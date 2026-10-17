import { useEffect, useState } from 'react';
import type { MigrationSnapshot } from '../../../shared/migrations.ts';
import { executeMigration, listMigrations, skipMigration } from '../api/client.ts';
import { useAppState } from '../state/AppState.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { SettingCard } from '../ui/SettingRow.tsx';

export function MigrationPage() {
  const { openSettings } = useAppState();
  return <MigrationContent onBack={() => openSettings('general')} />;
}

export function MigrationContent({ onBack, onContinue, startup = false }: {
  onBack?: () => void; onContinue?: () => void; startup?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<MigrationSnapshot | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    setNotice(null);
    try { setSnapshot(await listMigrations()); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not inspect migration sources.'); }
  }

  useEffect(() => {
    let cancelled = false;
    void listMigrations().then((value) => { if (!cancelled) setSnapshot(value); })
      .catch((error: unknown) => { if (!cancelled) setNotice(error instanceof Error ? error.message : 'Could not inspect migration sources.'); });
    return () => { cancelled = true; };
  }, []);

  async function migrate(id: string, fresh = false) {
    if (pending) return;
    setPending(id); setNotice(null); setSuccess(null);
    try {
      const result = await (fresh ? skipMigration(id) : executeMigration(id));
      setSnapshot((current) => current && ({ ...current,
        migrations: current.migrations.map((entry) => entry.id === id ? result.migration : entry),
      }));
      setSuccess(result.changed ? 'Data folder renamed. Xeck now uses the new location.' : result.migration.detail);
      if (startup) onContinue?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Migration failed.');
    } finally { setPending(null); }
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-main px-gutter py-gutter" aria-labelledby="migration-title">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id="migration-title" className="text-heading font-semibold text-ink">{startup ? 'Bring your existing data into Xeck?' : 'Migration'}</h1>
            <p className="mt-2 text-body text-muted">{startup ? 'We found your former application data. Would you like to migrate it?' : 'Move existing application data into Xeck.'}</p>
          </div>
          {onBack && <button type="button" className={BUTTON.ghost} disabled={pending !== null} onClick={onBack}>Back to settings</button>}
        </header>
        <p className="text-ui text-muted">Available migrations appear below. Close other Xeck instances before renaming a data folder.</p>
        {snapshot?.busy && <p className="text-ui text-muted" role="status">An agent is running. Finish active replies, then refresh.</p>}
        {!snapshot && !notice && <p className="text-ui text-muted" role="status">Checking data folders…</p>}
        {snapshot?.migrations.map((migration) => (
          <SettingCard key={migration.id}>
            <div className="flex flex-col gap-4 p-4">
              <div>
                <h2 className="text-lead font-semibold text-ink">{migration.title}</h2>
                <p className="mt-2 text-ui text-muted">{migration.description}</p>
              </div>
              <dl className="flex flex-col gap-3 text-ui">
                <div><dt className="text-muted">From</dt><dd className="mt-1 break-all text-ink">{migration.sourcePath}</dd></div>
                <div><dt className="text-muted">To</dt><dd className="mt-1 break-all text-ink">{migration.targetPath}</dd></div>
              </dl>
              <p className="text-ui text-muted">{migration.detail}</p>
              {migration.state === 'ready' && (
                <div className="flex flex-wrap gap-3"><button type="button" className={BUTTON.primary} disabled={pending !== null || snapshot.busy}
                  aria-busy={pending === migration.id} onClick={() => void migrate(migration.id)}>
                  {pending === migration.id ? 'Please wait…' : startup ? 'Migrate existing data' : 'Rename data folder'}
                </button>
                {startup && <button type="button" className={BUTTON.secondary} disabled={pending !== null || snapshot.busy}
                  onClick={() => void migrate(migration.id, true)}>Start fresh</button>}
                </div>
              )}
            </div>
          </SettingCard>
        ))}
        {notice && <p className="text-ui text-danger" role="alert">{notice}</p>}
        {success && <p className="text-ui text-ink" role="status">{success}</p>}
        {startup && <p className="text-ui text-muted">Migrate renames the old folder to xeck. Start fresh creates an empty xeck folder and leaves the old data untouched.</p>}
        {startup && snapshot && !snapshot.startupRequired && <div><button type="button" className={BUTTON.primary} disabled={pending !== null} onClick={onContinue}>Continue to Xeck</button></div>}
        <div><button type="button" className={BUTTON.secondary} disabled={pending !== null} onClick={() => void refresh()}>Refresh</button></div>
      </div>
    </main>
  );
}
