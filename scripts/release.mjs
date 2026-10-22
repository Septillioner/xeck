import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
const options = args.filter((arg) => arg !== '--dry-run');
const bump = options[0] ?? 'patch';

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || 'Git command failed');
  return result.stdout.trim();
}

try {
  if (options.length > 1 || !['patch', 'minor', 'major', 'beta', 'rc', 'stable'].includes(bump)) {
    throw new Error('Usage: npm run release -- [patch|minor|major|beta|rc|stable] [--dry-run]');
  }
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const target = bump === 'stable' ? version.split('-')[0] : ['beta', 'rc'].includes(bump) ? 'prerelease' : bump;
  if (bump === 'stable' && version === target) throw new Error('The current version is already stable. Choose patch, minor, or major.');
  const branch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
  const dirty = git('status', '--porcelain');
  console.log(`Current version: ${version}; release type: ${bump}; branch: ${branch}`);
  if (dryRun) {
    console.log(`Would run npm version ${target}${['beta', 'rc'].includes(bump) ? ` --preid=${bump}` : ''}, create a release commit, and tag it with the v prefix.`);
    if (dirty) console.log('The working tree is dirty. Commit or stash changes before an actual release.');
    console.log('Dry run: no files, commits, tags, or remotes were changed.');
    process.exit(0);
  }
  if (dirty) throw new Error('Commit or stash all changes before releasing. No version or tag was changed.');
  if (!process.env.npm_execpath) throw new Error('Run this script through npm: npm run release -- patch');
  const command = ['version', target, '--git-tag-version=true', '--tag-version-prefix=v', '-m', 'chore(release): v%s'];
  if (['beta', 'rc'].includes(bump)) command.push(`--preid=${bump}`);
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...command], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('npm version failed. Inspect git status before retrying; a hook or Git error may have left partial changes.');
  const next = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const tag = `v${next}`;
  git('rev-parse', '--verify', `refs/tags/${tag}`);
  console.log(`Created release commit and tag ${tag}. Nothing has been pushed.`);
  console.log(`Publish when ready: git push --atomic origin HEAD refs/tags/${tag}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
