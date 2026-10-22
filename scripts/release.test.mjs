import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(version = '4.4.1') {
  const root = mkdtempSync(join(tmpdir(), 'xeck-release-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('./release.mjs', import.meta.url), join(root, 'scripts/release.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'release-fixture', version }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ name: 'release-fixture', version, lockfileVersion: 3, packages: { '': { name: 'release-fixture', version } } }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'septillioner');
  git('config', 'user.email', 'egeismailkosedag@gmail.com');
  git('add', '.');
  git('commit', '-m', 'Initial fixture');
  return {
    root, git,
    run: (...args) => spawnSync(process.execPath, ['scripts/release.mjs', ...args], {
      cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_dry_run: 'false' },
    }),
    version: () => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  };
}

for (const [before, bump, after] of [['4.4.1', 'patch', '4.4.2'], ['4.5.0-beta.1', 'beta', '4.5.0-beta.2'], ['4.5.0-beta.2', 'stable', '4.5.0']]) {
  test(`${bump} updates both manifests and creates the matching tag`, () => {
    const f = fixture(before);
    const result = f.run(bump);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.version(), after);
    assert.equal(JSON.parse(readFileSync(join(f.root, 'package-lock.json'), 'utf8')).version, after);
    assert.equal(f.git('rev-parse', `v${after}^{commit}`), f.git('rev-parse', 'HEAD'));
    assert.equal(f.git('status', '--porcelain'), '');
    assert.match(result.stdout, /Nothing has been pushed/);
  });
}

test('dirty tree blocks changes and dry run leaves files and tags alone', () => {
  const f = fixture();
  const head = f.git('rev-parse', 'HEAD');
  writeFileSync(join(f.root, 'unfinished.txt'), 'uncommitted work');
  assert.equal(f.run('patch').status, 1);
  assert.equal(f.run('patch', '--dry-run').status, 0);
  assert.equal(f.version(), '4.4.1');
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.git('tag', '--list'), '');
});

test('invalid input does not mutate the repository', () => {
  const f = fixture();
  assert.equal(f.run('--force').status, 1);
  assert.equal(f.version(), '4.4.1');
  assert.equal(f.git('tag', '--list'), '');
});
