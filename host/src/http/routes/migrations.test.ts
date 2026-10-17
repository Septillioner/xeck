import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink, unlink, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app.ts';
import { acquireAgentTurn } from '../../agent/runtime/agents/pool.ts';
import { readSettings } from '../../stores/settings-store.ts';
import { resolveDataDir } from '../../infra/data-dir.ts';
import { withStorageMaintenance, withStorageRequest } from '../../infra/storage-maintenance.ts';
import type { MigrationResult, MigrationSnapshot } from '../../../../shared/migrations.ts';

test('migration endpoints rename only legacy application data and preserve its contents', async (t) => {
  const previous = process.env.APPDATA;
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'xeck-migration-'));
  process.env.APPDATA = temporary;
  const source = path.join(temporary, 'poyraz-web');
  const target = path.join(temporary, 'xeck');
  const app = createApp();
  const inspect = async () => (await (await app.request('/api/migrations')).json()) as MigrationSnapshot;
  const run = (id = 'legacy-data', body = '{}', origin?: string) => app.request(`/api/migrations/${id}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body,
  });
  try {
    await t.test('reports missing data and rejects unknown migrations and arbitrary paths', async () => {
      assert.equal((await inspect()).migrations[0].state, 'missing');
      assert.equal((await inspect()).startupRequired, false);
      assert.equal((await run('unknown')).status, 404);
      assert.equal((await run('legacy-data', '{"path":"C:/other"}')).status, 400);
      assert.equal((await run('legacy-data', '{}', 'https://untrusted.example')).status, 403);
      assert.equal((await app.request('/api/migrations/legacy-data', { method: 'POST' })).status, 415);
    });
    await mkdir(path.join(source, 'sessions'), { recursive: true });
    const settings = '{"systemInstructions":"preserve me","xeckInstructionsEnabled":false}';
    await writeFile(path.join(source, 'settings.json'), settings);
    await writeFile(path.join(source, 'sessions', 'evidence.json'), '{"content":"unchanged"}');
    await writeFile(path.join(source, 'providers.json'), '{"secret":"preserve-secret"}');
    await t.test('blocks migration while a turn or a store request owns data', async () => {
      const turn = acquireAgentTurn('migration-busy-test');
      try {
        assert.equal((await inspect()).busy, true);
        assert.equal((await run()).status, 409);
      } finally { turn.release(); }
      await withStorageRequest(async () => { assert.equal((await run()).status, 409); });
      assert.equal(resolveDataDir(), target);
      assert.equal((await inspect()).startupRequired, true);
      assert.equal((await app.request('/api/settings')).status, 409);
      await assert.rejects(lstat(target), { code: 'ENOENT' });
      await assert.rejects(readFile(path.join(target, 'settings.json')), { code: 'ENOENT' });
    });
    await t.test('maintenance excludes other HTTP data access and agent turns', async () => {
      await withStorageMaintenance(() => false, async () => {
        assert.equal((await app.request('/api/settings')).status, 503);
        assert.throws(() => acquireAgentTurn('migration-excluded-test'), /migration/);
        assert.equal((await run()).status, 409);
      });
    });
    await t.test('refuses a target conflict without changing either directory', async () => {
      await mkdir(target);
      await writeFile(path.join(target, 'keep.txt'), 'keep');
      assert.equal((await inspect()).migrations[0].state, 'conflict');
      assert.equal((await run()).status, 409);
      assert.equal(await readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep');
      assert.equal(await readFile(path.join(source, 'settings.json'), 'utf8'), settings);
      await rm(target, { recursive: true });
    });
    await t.test('renames the directory, preserves nested files and switches the resolver', async () => {
      const response = await run();
      assert.equal(response.status, 200);
      const result = await response.json() as MigrationResult;
      assert.equal(result.changed, true);
      assert.equal(result.migration.state, 'current');
      assert.equal(resolveDataDir(), target);
      assert.equal((await inspect()).startupRequired, false);
      assert.equal(await readFile(path.join(target, 'sessions', 'evidence.json'), 'utf8'), '{"content":"unchanged"}');
      assert.equal(await readFile(path.join(target, 'providers.json'), 'utf8'), '{"secret":"preserve-secret"}');
      assert.equal((await readSettings()).systemInstructions, 'preserve me');
      assert.equal((await readSettings()).xeckInstructionsEnabled, false);
      await assert.rejects(readFile(path.join(source, 'settings.json')), { code: 'ENOENT' });
      assert.equal((await (await run()).json() as MigrationResult).changed, false);
    });
    await t.test('rejects a symlink source instead of renaming its target', async (t) => {
      const other = path.join(temporary, 'other');
      await mkdir(other);
      try { await symlink(other, source, 'junction'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('Symlink permission unavailable'); return; } throw error; }
      assert.equal((await inspect()).migrations[0].state, 'blocked');
      assert.equal((await run()).status, 409);
      await unlink(source);
    });
    await t.test('declining creates fresh data, retains legacy files and does not ask again', async () => {
      const freshBase = path.join(temporary, 'fresh-case');
      const oldFolder = path.join(freshBase, 'poyraz-web');
      const newFolder = path.join(freshBase, 'xeck');
      await mkdir(oldFolder, { recursive: true });
      await writeFile(path.join(oldFolder, 'settings.json'), settings);
      process.env.APPDATA = freshBase;
      try {
        assert.equal((await inspect()).startupRequired, true);
        assert.equal((await app.request('/api/settings')).status, 409);
        const response = await app.request('/api/migrations/legacy-data/skip', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        });
        assert.equal(response.status, 200);
        assert.equal((await inspect()).startupRequired, false);
        assert.equal(resolveDataDir(), newFolder);
        assert.equal((await readSettings()).systemInstructions, '');
        assert.equal(await readFile(path.join(oldFolder, 'settings.json'), 'utf8'), settings);
        assert.equal((await app.request('/api/settings')).status, 200);
      } finally { process.env.APPDATA = temporary; }
    });
  } finally {
    if (previous === undefined) delete process.env.APPDATA; else process.env.APPDATA = previous;
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
