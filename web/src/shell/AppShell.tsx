import { useEffect, type ReactNode } from 'react';
import { ChatView } from '../chat/ChatView.tsx';
import { SettingsPage } from '../settings/SettingsDialog.tsx';
import { useAppState } from '../state/AppState.tsx';
import { Sidebar } from './Sidebar.tsx';
import { ProjectChatsPage } from './ProjectChatsPage.tsx';
import { IconClose, IconMaximize, IconMenu, IconMinimize } from '../ui/icons.tsx';
import { cn } from '../lib/cn.ts';
import { MigrationPage } from '../migration/MigrationPage.tsx';

export function AppShell() {
  const {
    ready,
    loadError,
    settingsOpen,
    migrationOpen,
    projectPageId,
    sidebarOpen,
    setSidebarOpen,
    active,
    settings,
    debugOpen,
    setDebugOpen,
  } = useAppState();
  const windowControls = window.electronWindow;

  // The mobile drawer is the only dismissible layer with no other close path.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen, setSidebarOpen]);

  return (
    <>
      <WindowTitlebar controls={windowControls} />
      {loadError && !migrationOpen ? (
        <main className="status-under-titlebar flex items-center justify-center text-danger">{loadError}</main>
      ) : !ready && !migrationOpen ? (
        <main className="status-under-titlebar flex items-center justify-center text-muted">Loading</main>
      ) : (
        <div
        className={cn(
          'relative flex h-full bg-bg max-lg:pt-[48px]',
          // The frameless Electron window draws a 38px titlebar above the shell, so the
          // shell gives up exactly that much height. In a browser there is no titlebar,
          // and without this the layout used to leave 38px of dead space at the bottom.
          windowControls && 'h-[calc(100%-38px)]',
          // `group/shell` (named, so row-level `group-hover` never matches the whole shell) lets the scrim below read the drawer state as a variant
          // instead of a selector rule. It must stay on the element carrying the
          // data attribute.
          'group/shell',
        )}
        data-sidebar-open={sidebarOpen ? 'true' : 'false'}
      >
        <nav
          aria-label="Chat list and debug"
          className={cn(
            // The bar is fixed so it takes no flex space; the shell reserves only
            // its height via padding-top. Hidden outright on wide screens.
            'fixed inset-x-0 top-0 z-20 hidden h-[48px] items-center gap-2 bg-sidebar px-2',
            'max-lg:flex',
          )}
        >
          <button
            type="button"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-row text-ink active:bg-hover max-lg:flex"
            aria-label="Toggle chat list"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <IconMenu />
          </button>
          <span className="flex-1 min-w-0 truncate text-lead font-semibold tracking-tight">Xeck</span>
          {settings.debugMode && active && (
            <button
              type="button"
              className={cn(
                'h-8 flex-none items-center rounded-full bg-field px-3 text-ui text-muted max-lg:flex',
                debugOpen && 'bg-chat-active text-ink',
              )}
              aria-label="Toggle debug panel"
              aria-pressed={debugOpen}
              onClick={() => setDebugOpen(!debugOpen)}
            >
              Debug
            </button>
          )}
        </nav>
        <Sidebar />
        <button
          type="button"
          className="fixed inset-x-0 bottom-0 top-[48px] z-scrim hidden bg-scrim max-lg:block group-data-[sidebar-open='false']/shell:hidden"
          aria-label="Close chat list"
          tabIndex={-1}
          onClick={() => setSidebarOpen(false)}
        />
        {migrationOpen ? (
          <MigrationPage />
        ) : settingsOpen ? (
          <SettingsPage />
        ) : projectPageId ? (
          <ProjectChatsPage projectId={projectPageId} />
        ) : (
          <ChatView />
        )}
        </div>
      )}
    </>
  );
}

export function WindowTitlebar({ controls }: { controls?: ElectronWindowControls }): ReactNode {
  if (!controls) return null;
  return (
    <header className="flex h-[38px] w-full items-center justify-end overflow-hidden bg-bg pl-4 text-muted window-drag">
      <div className="flex h-full window-no-drag">
        <button
          type="button"
          aria-label="Minimize"
          onClick={controls.minimize}
          className="flex h-full w-[46px] items-center justify-center text-muted hover:bg-hover hover:text-ink [&_svg]:h-[18px] [&_svg]:w-[18px]"
        >
          <IconMinimize />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={controls.toggleMaximize}
          className="flex h-full w-[46px] items-center justify-center text-muted hover:bg-hover hover:text-ink [&_svg]:h-[18px] [&_svg]:w-[18px]"
        >
          <IconMaximize />
        </button>
        <button
          type="button"
          className="window-close flex h-full w-[46px] items-center justify-center text-muted [&_svg]:h-[18px] [&_svg]:w-[18px]"
          aria-label="Close"
          onClick={controls.close}
        >
          <IconClose />
        </button>
      </div>
    </header>
  );
}
