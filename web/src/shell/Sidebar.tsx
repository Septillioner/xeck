import { BotSidebar } from './BotSidebar.tsx';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import { useAppState } from '../state/AppState.tsx';
import { cn } from '../lib/cn.ts';
import { IconChat, IconChevron, IconFolder, IconMoreVertical, IconPlus, IconSearch, IconSettings, IconStar, IconXeck } from '../ui/icons.tsx';
import { BUTTON, ICON_BUTTON } from '../ui/button-styles.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { TextField } from '../ui/TextField.tsx';
import { MAX_PROJECT_NAME_CHARS } from '../../../shared/limits.ts';
import { SidebarSearchOverlay } from './SidebarSearchOverlay.tsx';
import { SessionActions } from './SessionActions.tsx';

const ROW = 'flex min-h-9 hover-none:min-h-11 w-full items-center gap-2.5 rounded-control px-3 text-left text-body hover:bg-hover';

export function Sidebar() {
  const { sessions, projects, active, botsOpen, settingsOpen, projectPageId, createChat, openChat, openBots, openProjectPage, createProject, renameProject, setProjectPinned, deleteProject, openSettings, sessionMoods, workspace, openChats, setBotCreateOpen } = useAppState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(() => { try { return localStorage.getItem('xeck.sidebar.projects') === 'true'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('xeck.sidebar.projects', String(projectsOpen)); } catch {} }, [projectsOpen]);
  useEffect(() => { if (projectPageId) setProjectsOpen(true); }, [projectPageId]);
  const [projectDialog, setProjectDialog] = useState<{ id?: string; name: string } | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const botContext = workspace === 'bots';
  const visible = sessions.filter((session) => !session.archived && !session.parentId && !session.bot && !session.botConversation);
  const pinned = visible.filter((session) => session.pinned);
  const recent = visible.filter((session) => !session.pinned);
  const search = () => { setQuery(''); setSearchOpen(true); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const openProjectDialog = (project: typeof projectDialog) => { setError(null); setDeletingProject(false); setProjectDialog(project); };
  const saveProject = async () => {
    if (!projectDialog || busy) return;
    setBusy(true); setError(null);
    try {
      if (deletingProject && projectDialog.id) await deleteProject(projectDialog.id);
      else if (projectDialog.id) await renameProject(projectDialog.id, projectDialog.name.trim());
      else await createProject(projectDialog.name.trim());
      setProjectDialog(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not save project')); }
    finally { setBusy(false); }
  };
  const renderSession = (session: typeof sessions[number]) => {
    const selected = !settingsOpen && !projectPageId && !botsOpen && active?.id === session.id;
    const mood = sessionMoods[session.id] ?? 'idle';
    const project = projects.find((item) => item.id === session.projectId);
    return <li key={session.id} className={cn('chat-row flex items-center gap-1 rounded-control pr-1', selected && 'bg-chat-active')} data-mood={mood}>
      <button type="button" className={cn(ROW, 'min-w-0 flex-1')} aria-current={selected ? 'page' : undefined} onClick={() => void openChat(session.id)}>
        {session.pinned ? <IconStar className="shrink-0 text-muted" /> : null}
        <span className="min-w-0 flex-1"><span className="block truncate text-ui">{session.title}</span>{project && <span className="block truncate text-micro text-muted">{project.name}</span>}</span>
        {mood !== 'idle' && <span className="chat-mood-dot size-1.5 shrink-0 rounded-full bg-mood" aria-label={t(mood)} />}
      </button>
      <SessionActions session={session} />
    </li>;
  };
  return <>
    <aside id="sidebar" className="panel-shell z-drawer flex w-sidebar flex-none flex-col bg-sidebar max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[min(84vw,320px)] max-lg:-translate-x-full max-lg:transition-transform group-data-[sidebar-open='true']/shell:max-lg:translate-x-0">
      <div className="flex items-center gap-2 px-5 pt-5 pb-4 text-brand font-semibold"><IconXeck size={20} />Xeck</div>
      <nav className="flex flex-col gap-1 px-2.5">
        <div className="mb-2 grid grid-cols-2 gap-1" role="group" aria-label={t('Workspaces')}>
          <button type="button" className={cn('flex min-h-9 items-center justify-center gap-2 rounded-control text-ui', !botContext && 'bg-chat-active text-ink')} aria-pressed={!botContext} onClick={openChats}><IconChat />{t('Chats')}</button>
          <button type="button" className={cn('flex min-h-9 items-center justify-center gap-2 rounded-control text-ui', botContext && 'bg-chat-active text-ink')} aria-pressed={botContext} onClick={openBots}><IconXeck />XeckBot</button>
        </div>
        <button type="button" className={ROW} onClick={() => { if (botContext) { setBotCreateOpen(true); } else createChat(); }}><IconPlus />{t(botContext ? 'XeckBot oluştur' : 'New chat')}</button>
        <button ref={searchButtonRef} type="button" className={ROW} onClick={() => search()}><IconSearch /><span className="flex-1">{t('Search')}</span><kbd className="text-micro text-muted">Ctrl K</kbd></button>
      </nav>
      <div className="min-h-0 flex-1 overflow-auto px-2.5 pt-5 pb-4">
        {botContext ? <BotSidebar /> : <>
        <div className="mb-2 flex items-center justify-between gap-2 px-2">
          <button type="button" className="flex min-h-row items-center gap-2 text-small font-medium text-muted" aria-expanded={projectsOpen} onClick={() => setProjectsOpen((value) => !value)}><IconChevron className={cn(projectsOpen && 'rotate-90')} />{t('Projects')}</button>
          <button type="button" className={ICON_BUTTON} aria-label={t('New project')} onClick={() => openProjectDialog({ name: '' })}><IconPlus /></button>
        </div>
        {(projectsOpen || projects.some((project) => project.pinned)) && <ul className="mb-5 flex flex-col gap-1">{[...projects].filter((project) => projectsOpen || project.pinned).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))).map((project) => <li key={project.id} className={cn('flex items-center gap-1 rounded-control pr-1', projectPageId === project.id && !settingsOpen && 'bg-chat-active')}>
          <button type="button" className={cn(ROW, 'min-w-0 flex-1')} onClick={() => openProjectPage(project.id)}><IconFolder className="shrink-0 text-muted" /><span className="truncate text-ui">{project.name}</span>{project.pinned && <IconStar className="shrink-0 text-muted" />}</button>
          <button type="button" className={ICON_BUTTON} aria-label={t('Project actions for {0}', { 0: project.name })} onClick={() => openProjectDialog({ id: project.id, name: project.name })}><IconMoreVertical /></button>
        </li>)}</ul>}
        {pinned.length > 0 && <section className="mb-4"><h2 className="px-3 py-2 text-micro font-medium text-muted">{t('Pinned')}</h2><ul className="flex flex-col gap-1">{pinned.map(renderSession)}</ul></section>}
        <section><h2 className="px-3 py-2 text-micro font-medium text-muted">{t('Recent chats')}</h2><ul className="flex flex-col gap-1">{recent.map(renderSession)}</ul>
        </section>
        </>}
      </div>
      <nav className="flex flex-col gap-1 p-2.5">
        <button type="button" className={cn(ROW, settingsOpen && 'bg-chat-active')} onClick={() => openSettings('general')}><IconSettings />{t('Settings')}</button>
      </nav>
    </aside>
    {searchOpen && <SidebarSearchOverlay query={query} onQuery={setQuery} buttonRef={searchButtonRef} onClose={() => setSearchOpen(false)} onOpen={(id) => { setSearchOpen(false); void openChat(id); }} onOpenProject={(id) => { setSearchOpen(false); openProjectPage(id); }} />}
    {projectDialog && <Dialog title={t(deletingProject ? 'Delete project' : projectDialog.id ? 'Rename project' : 'New project')} onClose={() => { if (!busy) setProjectDialog(null); }}>
      <form className="flex flex-col gap-4 p-gutter" onSubmit={(event) => { event.preventDefault(); void saveProject(); }}>
        {deletingProject ? <p className="text-ui text-muted">{t('The project will be removed. Its chats will be kept.')}</p> : <label className="flex flex-col gap-2 text-ui">{t('Project name')}<TextField width="block" required maxLength={MAX_PROJECT_NAME_CHARS} value={projectDialog.name} disabled={busy} onChange={(event) => setProjectDialog({ ...projectDialog, name: event.target.value })} /></label>}
        {projectDialog.id && !deletingProject && <button type="button" className={BUTTON.secondary} disabled={busy} onClick={() => {
          setBusy(true); setError(null);
          void setProjectPinned(projectDialog.id!, !projects.find((item) => item.id === projectDialog.id)?.pinned).catch((cause) => setError(cause instanceof Error ? cause.message : t('Request failed'))).finally(() => setBusy(false));
        }}>{t(projects.find((item) => item.id === projectDialog.id)?.pinned ? 'Unpin' : 'Pin')}</button>}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">{projectDialog.id && !deletingProject && <button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => setDeletingProject(true)}>{t('Delete')}</button>}<span className="flex-1" /><button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => setProjectDialog(null)}>{t('Cancel')}</button><button type="submit" className={deletingProject ? BUTTON.danger : BUTTON.primary} disabled={busy || !projectDialog.name.trim()}>{busy ? t('Saving') : t(deletingProject ? 'Delete' : 'Save')}</button></div>
      </form>
    </Dialog>}
  </>;
}
