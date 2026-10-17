import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { searchFileContents } from '../../../tools/content-search.ts';
import { searchFilesTool, listDirectoryTool, FileToolRejected } from '../../../tools/file-access.ts';
import { settingsPath } from '../../../infra/data-dir.ts';
import { writeJson } from '../../../infra/json-file.ts';

test('discovery and content search share bounded, scoped file selection', async (t) => {
  const previous = process.env.APPDATA;
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'xeck-search-'));
  process.env.APPDATA = temporary;
  const workspace = path.join(temporary, 'workspace');
  await mkdir(path.join(workspace, 'nested'), { recursive: true });
  await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });
  await writeFile(path.join(workspace, 'a.ts'), 'needle\nsecond\n');
  await writeFile(path.join(workspace, 'nested', 'b.ts'), 'needle\nneedle\n');
  for (const name of ['.env', 'id_rsa', 'secret.pem']) await writeFile(path.join(workspace, name), 'needle');
  await mkdir(path.join(workspace, 'node_modules'));
  await writeFile(path.join(workspace, 'node_modules', 'hidden.ts'), 'needle');
  try {
    await t.test('glob search and tree listing use compact relative paths', async () => {
      const result = await searchFilesTool({ query: '**/*.ts' });
      assert.deepEqual(result.entries.map((row) => row.path), ['a.ts', 'nested/b.ts']);
      assert.equal('truncated' in result, false);
      const listed = await listDirectoryTool('', true, 1);
      assert.equal(listed.entries.find((row) => row.path === 'a.ts')?.size, 14);
      assert.equal(listed.entries.some((row) => row.path === '.env'), false);
    });
    await t.test('limits total matching lines across files', async () => {
      const result = await searchFileContents({ pattern: 'needle', maxResults: 2 });
      assert.equal(result.results.length, 2);
      assert.equal(result.reason, 'result-limit');
      assert.equal(result.results[0].path, 'a.ts');
      assert.equal(result.results[0].line, 1);
      assert.deepEqual(await searchFileContents({ pattern: 'absent' }), { results: [] });
      const exact = await searchFileContents({ pattern: 'needle', maxResults: 3 });
      assert.equal(exact.results.length, 3);
      assert.equal(exact.truncated, undefined);
    });
    await t.test('rejects excluded explicit paths and outside targets', async () => {
      await assert.rejects(searchFileContents({ pattern: 'needle', path: '.env' }), FileToolRejected);
      await assert.rejects(searchFileContents({ pattern: 'needle', path: '..' }), FileToolRejected);
    });
    await t.test('does not interpolate shell syntax and reports invalid regex', async () => {
      assert.deepEqual(await searchFileContents({ pattern: 'needle; echo injected' }), { results: [] });
      await assert.rejects(searchFileContents({ pattern: '[' }), FileToolRejected);
    });
    await t.test('honors include/exclude, context and cancellation', async () => {
      const result = await searchFileContents({ pattern: 'needle', include: '*.ts', exclude: 'nested/**', contextLines: 1 });
      assert.equal(result.results.filter((row) => !row.context).length, 1);
      assert.ok(result.results.some((row) => row.context && row.text === 'second'));
      await assert.rejects(searchFileContents({ pattern: 'needle' }, AbortSignal.abort()), /cancelled/);
    });
    await t.test('reports listing truncation only when another eligible entry exists', async () => {
      const exact = await listDirectoryTool('', false, 1, 3);
      assert.equal(exact.entries.length, 3);
      assert.equal(exact.truncated, undefined);
      const limited = await listDirectoryTool('', false, 1, 2);
      assert.equal(limited.entries.length, 2);
      assert.equal(limited.reason, 'result-limit');
    });
    await t.test('skips directory symlinks and rejects explicit symlink paths', async (t) => {
      try { await symlink(path.join(workspace, 'nested'), path.join(workspace, 'linked'), 'junction'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('Symlink permission unavailable'); return; } throw error; }
      const found = await searchFilesTool({ query: '*.ts' });
      assert.equal(found.entries.some((row) => row.path.startsWith('linked/')), false);
      await assert.rejects(searchFileContents({ pattern: 'needle', path: 'linked' }), FileToolRejected);
    });
    await t.test('bounds long matching lines without returning oversized JSON', async () => {
      await writeFile(path.join(workspace, 'large.ts'), 'needle' + 'ü'.repeat(20_000));
      const result = await searchFileContents({ pattern: 'needle', path: 'large.ts' });
      assert.equal(result.reason, 'output-limit');
      assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 20_000);
    });
  } finally {
    if (previous === undefined) delete process.env.APPDATA; else process.env.APPDATA = previous;
    await rm(temporary, { recursive: true, force: true });
  }
});
