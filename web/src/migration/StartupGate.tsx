import { useEffect, useState, type ReactNode } from 'react';
import { listMigrations } from '../api/client.ts';
import { MigrationContent } from './MigrationPage.tsx';
import { WindowTitlebar } from '../shell/AppShell.tsx';
import { BUTTON } from '../ui/button-styles.ts';

/** No app provider or boot request is mounted before the migration decision. */
export function StartupGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<'checking' | 'prompt' | 'app' | 'error'>('checking');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    document.documentElement.classList.add('dark');
    void listMigrations().then((snapshot) => {
      if (!cancelled) setStage(snapshot.startupRequired ? 'prompt' : 'app');
    }).catch((cause: unknown) => {
      if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Could not check existing data.'); setStage('error'); }
    });
    return () => { cancelled = true; };
  }, [attempt]);
  if (stage === 'app') return children;
  return <>
    <WindowTitlebar controls={window.electronWindow} />
    <div className={window.electronWindow ? 'flex h-[calc(100%-38px)] bg-main' : 'flex h-full bg-main'}>
      {stage === 'prompt' ? <MigrationContent startup onContinue={() => setStage('app')} /> : (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-gutter text-body text-muted">
          {stage === 'error' ? <>
            <p role="alert">{error}</p>
            <button type="button" className={BUTTON.secondary} onClick={() => { setStage('checking'); setAttempt((value) => value + 1); }}>Retry</button>
          </> : <p role="status">Checking existing Xeck data…</p>}
        </main>
      )}
    </div>
  </>;
}
