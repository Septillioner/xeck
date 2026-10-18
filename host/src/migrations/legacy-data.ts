import { lstat, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import type { MigrationResult, MigrationStatus } from '../../../shared/migrations.ts';
import { applicationDataDirectories } from '../infra/data-dir.ts';

export const LEGACY_DATA_MIGRATION = 'legacy-data';

function directories() {
  const { base, legacy: sourcePath, current: targetPath } = applicationDataDirectories();
  if (path.dirname(sourcePath) !== base || path.dirname(targetPath) !== base) {
    throw new Error('Migration paths must stay inside the application data directory.');
  }
  return { sourcePath, targetPath };
}

async function stat(directory: string) {
  try { return await lstat(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export async function inspectLegacyData(): Promise<MigrationStatus> {
  const paths = directories();
  const [source, target] = await Promise.all([stat(paths.sourcePath), stat(paths.targetPath)]);
  const metadata = { id: LEGACY_DATA_MIGRATION, title: 'Legacy Xeck data',
    description: 'Rename the former poyraz-web application data folder to xeck. Chats, settings, credentials, rules and memories stay in the same folder.', ...paths };
  if (source && (!source.isDirectory() || source.isSymbolicLink()) || target && (!target.isDirectory() || target.isSymbolicLink())) {
    return { ...metadata, state: 'blocked', detail: 'The source and target must be ordinary directories, without symlinks.' };
  }
  if (source && target) return { ...metadata, state: 'conflict', detail: 'Both folders exist. No files will be merged or overwritten.' };
  if (source) return { ...metadata, state: 'ready', detail: 'The legacy data folder is ready to rename.' };
  if (target) return { ...metadata, state: 'current', detail: 'Xeck already uses the current data folder.' };
  return { ...metadata, state: 'missing', detail: 'No legacy data folder was found.' };
}

export async function migrateLegacyData(): Promise<MigrationResult> {
  const before = await inspectLegacyData();
  if (before.state === 'conflict' || before.state === 'blocked') throw new MigrationConflictError(before.detail);
  if (before.state !== 'ready') return { migration: before, changed: false };
  // Fixed absolute sibling paths were verified above; no arbitrary paths are accepted.
  await rename(before.sourcePath, before.targetPath);
  return { migration: await inspectLegacyData(), changed: true };
}

export class MigrationConflictError extends Error {}

export async function startFreshLegacyData(): Promise<MigrationResult> {
  const before = await inspectLegacyData();
  if (before.state === 'blocked') throw new MigrationConflictError(before.detail);
  if (before.state === 'current' || before.state === 'conflict') return { migration: before, changed: false };
  // An empty current folder records the decision and leaves the legacy folder intact.
  await mkdir(path.dirname(before.targetPath), { recursive: true });
  await mkdir(before.targetPath);
  return { migration: await inspectLegacyData(), changed: true };
}
