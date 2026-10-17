import type { MigrationSnapshot } from '../../../shared/migrations.ts';
import { hasActiveAgentTurns } from '../agent/runtime/agents/pool.ts';
import { withStorageMaintenance } from '../infra/storage-maintenance.ts';
import { inspectLegacyData, LEGACY_DATA_MIGRATION, migrateLegacyData, startFreshLegacyData } from './legacy-data.ts';
import { recoverInterruptedSubagents } from '../stores/sessions.ts';

/** Add future editor importers here, each with its own inspection and execution. */
const migrations = [{ id: LEGACY_DATA_MIGRATION, inspect: inspectLegacyData, run: migrateLegacyData, skip: startFreshLegacyData }];

export async function migrationSnapshot(): Promise<MigrationSnapshot> {
  const statuses = await Promise.all(migrations.map((entry) => entry.inspect()));
  return { migrations: statuses, busy: hasActiveAgentTurns(), startupRequired: statuses.some((entry) => entry.id === LEGACY_DATA_MIGRATION && entry.state === 'ready') };
}

export async function runMigration(id: string, skip = false) {
  const migration = migrations.find((entry) => entry.id === id);
  if (!migration) return null;
  return withStorageMaintenance(hasActiveAgentTurns, async () => {
    const result = await (skip ? migration.skip() : migration.run());
    if (!skip && result.changed) {
      try { await recoverInterruptedSubagents(); }
      catch (error) { console.error('Data migration completed; interrupted-session recovery failed', error); }
    }
    return result;
  });
}
