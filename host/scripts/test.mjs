import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(file);
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [file] : [];
  });
}

// Pass actual filenames: shell glob expansion differs between platforms and
// Node 20 does not expand quoted recursive test globs itself.
const files = discoverTests(join(root, 'src')).sort();
if (files.length === 0) {
  console.error('No host test files found.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...process.argv.slice(2), ...files], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
