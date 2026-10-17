import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveDataDir } from './data-dir.ts';

test('Xeck always uses its own data directory; legacy data needs an explicit migration decision', async () => {
  const previous = process.env.APPDATA;
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'xeck-data-'));
  process.env.APPDATA = temporary;
  try {
    const current = path.join(temporary, 'xeck');
    const legacy = path.join(temporary, 'poyraz-web');
    assert.equal(resolveDataDir(), current);
    await mkdir(legacy);
    assert.equal(resolveDataDir(), current);
    await mkdir(current);
    assert.equal(resolveDataDir(), current);
  } finally {
    if (previous === undefined) delete process.env.APPDATA; else process.env.APPDATA = previous;
    await rm(temporary, { recursive: true, force: true });
  }
});
