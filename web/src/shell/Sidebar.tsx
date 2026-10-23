import { t } from '../i18n/index.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppState } from '../state/AppState.tsx';
import { groupSessions } from '../lib/group-sessions.ts';
import { cn } from '../lib/cn.ts';
import { IconChat, IconFolder, IconSearch, IconXeck, IconSettings } from '../ui/icons.tsx';
import type { MenuOption } from '../ui/Menu.tsx';
import { MAX_PROJECT_NAME_CHARS } from '../../../shared/limits.ts';
import type { Project, SessionSummary } from '../../../shared/types.ts';
import { SidebarSearchOverlay } from './SidebarSearchOverlay.tsx';
import { SidebarDialogs } from './SidebarDialogs.tsx';
import { SidebarProjects } from './SidebarProjects.tsx';
import { SidebarChatRow } from './SidebarChatRow.tsx';
/** A nav row in the sidebar. Icons are 18px and never shrink. */
const NAV_ROW =
  'flex h-control w-full items-center gap-2.5 rounded-control px-2 text-left text-body text-ink hover:bg-hover [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:flex-none [&_svg]:text-muted hover:[&_svg]:text-ink hover-none:min-h-11';

/** A chat row inside the scroll area. Denser than a nav row and mood tinted.
    `pl-2` mirrors the old `.nav-row` left padding so the spinner never sticks
    to the edge; `pr-2.5` keeps the old 10px right breathing room. */
const CHAT_ROW =
  'relative flex min-h-8 w-full items-center gap-2.5 rounded-row pr-2.5 pl-2 text-left hover:bg-chat-hover hover-none:min-h-11';
/** Selected row: a solid tone fill, nothing else. */
const ACTIVE_ROW = 'bg-chat-active text-ink';
const PROJECT_SUBMENU_GAP_PX = 4;
const MENU_VIEWPORT_GUTTER_PX = 8;
const PROJECT_SUBMENU_MAX_HEIGHT_PX = 240;
export function Sidebar() {
  const {
    botsOpen,
    openBots,
    sessions,
    projects,
    active,
    sessionMoods,
    createChat,
    openChat,
    renameChat,
    deleteChat,
    createProject,
    renameProject,
    deleteProject,
    assignChatToProject,
    openSettings,
    closeSettings,
    settingsOpen,
    projectPageId,
    openProjectPage,
  } = useAppState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, true>>({});
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [deleteDialogChatId, setDeleteDialogChatId] = useState<string | null>(null);
  const [deleteDialogProjectId, setDeleteDialogProjectId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [projectSubmenuOpen, setProjectSubmenuOpen] = useState(false);
  const [menuUp, setMenuUp] = useState(false);
  const [projectSubmenuPosition, setProjectSubmenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogId, setProjectDialogId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [projectDialogBusy, setProjectDialogBusy] = useState(false);
  const [projectDialogError, setProjectDialogError] = useState<string | null>(null);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const projectSubmenuTriggerRef = useRef<HTMLButtonElement>(null);
  const projectSubmenuRef = useRef<HTMLDivElement>(null);
  const botWorkspace = botsOpen || (Boolean(active?.bot) && !projectPageId);
  const bots = sessions.filter((session) => session.bot && !session.botConversation);
  const botConversations = sessions.filter((session) => session.botConversation);
  const groups = groupSessions(sessions.filter((session) => !session.projectId && !session.bot));
  const projectOptions: MenuOption[] = [
    { value: '', label: t("No project") },
    ...projects.map((project) => ({ value: project.id, label: project.name, icon: <IconFolder /> })),
  ];

  useEffect(() => {
    if (!openActionsId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (actionsMenuRef.current?.contains(target) || projectSubmenuRef.current?.contains(target)) return;
      setOpenActionsId(null);
      setProjectSubmenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpenActionsId(null);
      setProjectSubmenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [openActionsId]);

  useLayoutEffect(() => {
    if (!openActionsId || !projectSubmenuOpen) {
      setProjectSubmenuPosition(null);
      return;
    }

    const updateProjectSubmenuPosition = () => {
      const trigger = projectSubmenuTriggerRef.current;
      const submenu = projectSubmenuRef.current;
      if (!trigger || !submenu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();
      const rightCandidate = triggerRect.right + PROJECT_SUBMENU_GAP_PX;
      const leftCandidate = triggerRect.left - PROJECT_SUBMENU_GAP_PX - submenuRect.width;
      const rightFits = rightCandidate + submenuRect.width <= window.innerWidth - MENU_VIEWPORT_GUTTER_PX;
      const leftFits = leftCandidate >= MENU_VIEWPORT_GUTTER_PX;
      const preferredLeft = rightFits || !leftFits ? rightCandidate : leftCandidate;
      const maxLeft = Math.max(
        MENU_VIEWPORT_GUTTER_PX,
        window.innerWidth - MENU_VIEWPORT_GUTTER_PX - submenuRect.width,
      );
      const left = Math.min(Math.max(preferredLeft, MENU_VIEWPORT_GUTTER_PX), maxLeft);
      const maxTop = Math.max(
        MENU_VIEWPORT_GUTTER_PX,
        window.innerHeight - MENU_VIEWPORT_GUTTER_PX - submenuRect.height,
      );
      const top = Math.min(Math.max(triggerRect.top, MENU_VIEWPORT_GUTTER_PX), maxTop);

      setProjectSubmenuPosition((current) =>
        current?.top === top && current.left === left ? current : { top, left },
      );
    };

    updateProjectSubmenuPosition();
    window.addEventListener('resize', updateProjectSubmenuPosition);
    window.addEventListener('scroll', updateProjectSubmenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateProjectSubmenuPosition);
      window.removeEventListener('scroll', updateProjectSubmenuPosition, true);
    };
  }, [openActionsId, projectSubmenuOpen]);

  // Row menus open below the trigger; when the bottom does not fit (last rows) they flip above it.
  useLayoutEffect(() => {
    if (!openActionsId) {
      setMenuUp(false);
      return;
    }
    const wrap = actionsMenuRef.current;
    const menu = wrap?.querySelector<HTMLElement>(':scope > [role="menu"]');
    const trigger = wrap?.querySelector<HTMLElement>(':scope > button');
    if (!menu || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - MENU_VIEWPORT_GUTTER_PX - rect.bottom - PROJECT_SUBMENU_GAP_PX;
    const above = rect.top - MENU_VIEWPORT_GUTTER_PX - PROJECT_SUBMENU_GAP_PX;
    setMenuUp(menu.offsetHeight > below && above > below);
  }, [openActionsId]);

  const toggleProjectChats = (id: string) => {
    setExpandedProjectIds((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const openCreateProject = () => {
    setProjectDialogId(null);
    setProjectNameDraft('');
    setProjectDialogError(null);
    setProjectDialogOpen(true);
  };

  const openRenameProject = (project: Project) => {
    setProjectDialogId(project.id);
    setProjectNameDraft(project.name);
    setProjectDialogError(null);
    setProjectDialogOpen(true);
  };

  const saveProject = async () => {
    const name = projectNameDraft.trim();
    if (!name) {
      setProjectDialogError('Project name is required');
      return;
    }
    if (name.length > MAX_PROJECT_NAME_CHARS) {
      setProjectDialogError('Project name is too long');
      return;
    }

    setProjectDialogBusy(true);
    try {
      if (projectDialogId) await renameProject(projectDialogId, name);
      else await createProject(name);
      setProjectDialogOpen(false);
    } catch (cause) {
      setProjectDialogError(cause instanceof Error ? cause.message : t("Could not save project"));
    } finally {
      setProjectDialogBusy(false);
    }
  };

  /** `nested` rows sit under a project: one step smaller (`text-ui`, same as the project name) and muted. */
  const renderSession = (session: SessionSummary, nested = false) => {
    const selected = !botsOpen && !settingsOpen && !projectPageId && session.id === active?.id;
    const mood = sessionMoods[session.id] ?? 'idle';
    const actionsOpen = openActionsId === session.id;
    return (
      <SidebarChatRow
        key={session.id}
        session={session}
        nested={nested}
        selected={selected}
        mood={mood}
        actionsOpen={actionsOpen}
        editing={editingId === session.id}
        titleDraft={titleDraft}
        menuUp={menuUp}
        projectSubmenuOpen={projectSubmenuOpen}
        projectSubmenuPosition={projectSubmenuPosition}
        projectOptions={projectOptions}
        actionsMenuRef={actionsMenuRef}
        projectSubmenuTriggerRef={projectSubmenuTriggerRef}
        projectSubmenuRef={projectSubmenuRef}
        onOpen={(id) => void openChat(id)}
        onToggleActions={(id) => {
          setProjectSubmenuOpen(false);
          setOpenActionsId((current) => current === id ? null : id);
        }}
        onToggleProjectSubmenu={() => setProjectSubmenuOpen((open) => !open)}
        onStartRename={(id, title) => {
          setOpenActionsId(null);
          setProjectSubmenuOpen(false);
          setEditingId(id);
          setTitleDraft(title);
          setDeleteDialogChatId(null);
        }}
        onTitleDraft={setTitleDraft}
        onFinishEditing={() => {
          setEditingId(null);
          const next = titleDraft.trim();
          if (next && next !== session.title) void renameChat(session.id, next);
        }}
        onCancelEditing={() => {
          setTitleDraft(session.title);
          setEditingId(null);
        }}
        onDelete={(id) => {
          setDeleteDialogChatId(id);
          setOpenActionsId(null);
          setProjectSubmenuOpen(false);
        }}
        onAssignProject={(id, projectId) => {
          setProjectActionError(null);
          void assignChatToProject(id, projectId).catch((cause) =>
            setProjectActionError(cause instanceof Error ? cause.message : t('Could not move the chat')),
          );
          setOpenActionsId(null);
          setProjectSubmenuOpen(false);
        }}
      />
    );
  };

  return (
    <>
    <aside
      id="sidebar"
      className="panel-shell z-drawer flex w-sidebar flex-none flex-col bg-sidebar max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[min(84vw,320px)] max-lg:-translate-x-full max-lg:transition-transform max-lg:duration-200 group-data-[sidebar-open='true']/shell:max-lg:translate-x-0"
    >
      <div className="flex items-center gap-2 pt-5 pr-4 pb-3 pl-4 text-brand font-semibold tracking-tight">
        <span className="flex size-6 flex-none items-center justify-center rounded-tile text-small font-semibold text-logo" aria-hidden="true">
          <IconXeck size={20} />
        </span>
        {t("Xeck")}</div>
      <nav className="flex flex-col gap-1.5 px-2.5">
        <button
          type="button"
          onClick={() => void createChat()}
          className={NAV_ROW}
        >
          <IconChat />
          {t("New chat")}</button>
        <button
          ref={searchButtonRef}
          type="button"
          data-active={searchOpen ? 'true' : 'false'}
          onClick={() => setSearchOpen((open) => !open)}
          className={cn(NAV_ROW, searchOpen && ACTIVE_ROW)}
        >
          <IconSearch />
          {t("Search")}</button>
        <button
          type="button"
          data-active={settingsOpen ? 'true' : 'false'}
          onClick={() => (settingsOpen ? closeSettings() : openSettings('general'))}
          className={cn(NAV_ROW, settingsOpen && ACTIVE_ROW)}
        >
          <IconSettings />
          {t("Settings")}</button>
      </nav>
      <div className="min-h-0 flex-1 overflow-auto pt-5 pr-2.5 pb-6 pl-2.5 [scrollbar-gutter:stable]">
        <nav aria-label={t("Workspaces")} className="mb-4 flex flex-col gap-1">
          <button type="button" className={cn(NAV_ROW, !botsOpen && !active?.bot && !settingsOpen && !projectPageId && ACTIVE_ROW)} onClick={() => {
            const chat = sessions.find((session) => !session.bot && !session.projectId);
            if (chat) void openChat(chat.id);
            else createChat();
          }}>
            <IconChat />{t("Chat")}</button>
          <button type="button" className={cn(NAV_ROW, (botsOpen || Boolean(active?.bot)) && !settingsOpen && !projectPageId && ACTIVE_ROW)} onClick={openBots}>
            <IconXeck />{t("XeckBot")}</button>
        </nav>
        <SidebarProjects
          projects={projects}
          sessions={sessions}
          settingsOpen={settingsOpen}
          projectPageId={projectPageId}
          expandedProjectIds={expandedProjectIds}
          projectActionError={projectActionError}
          openActionsId={openActionsId}
          menuUp={menuUp}
          actionsMenuRef={actionsMenuRef}
          onCreateProject={openCreateProject}
          onToggleProjectChats={toggleProjectChats}
          onOpenProject={openProjectPage}
          onToggleActions={(id) => {
            setProjectSubmenuOpen(false);
            setOpenActionsId((current) => current === id ? null : id);
          }}
          onCreateChat={(id) => {
            setOpenActionsId(null);
            void createChat(id);
          }}
          onRenameProject={(project) => {
            setOpenActionsId(null);
            openRenameProject(project);
          }}
          onDeleteProject={(id) => {
            setOpenActionsId(null);
            setDeleteDialogProjectId(id);
          }}
          renderSession={renderSession}
        />        <h2 className="mx-2.5 mb-2 text-micro font-semibold tracking-[0.06em] text-muted uppercase">{botWorkspace ? t("XeckBots") : t("Chats")}</h2>
        {botWorkspace ? (
          bots.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {bots.map((session) => renderSession(session))}
            </ul>
          ) : (
            <p className="mx-2.5 py-1.5 text-small text-muted">{t("Henüz XeckBot yok")}</p>
          )
        ) : [...groups.entries()].map(([label, items]) =>
          items.length === 0 ? null : (
            <section key={label} className="mb-1.5">
              <h3 className="mx-2.5 mt-5 mb-2 text-micro font-semibold tracking-[0.04em] text-muted uppercase">{t(label)}</h3>
              <ul className="flex flex-col gap-1">
                {items.map((session) => renderSession(session))}
              </ul>
            </section>
          ),
        )}
        {botWorkspace && botConversations.length > 0 && (
          <section className="mt-5">
            <h2 className="mx-2.5 mb-2 text-micro font-semibold tracking-[0.06em] text-muted uppercase">{t('Bot conversations')}</h2>
            <ul className="flex flex-col gap-1">{botConversations.map((session) => renderSession(session))}</ul>
          </section>
        )}
      </div>
    </aside>
    <SidebarDialogs
      projectOpen={projectDialogOpen}
      projectId={projectDialogId}
      projectName={projectNameDraft}
      projectBusy={projectDialogBusy}
      projectError={projectDialogError}
      onProjectName={setProjectNameDraft}
      onCloseProject={() => setProjectDialogOpen(false)}
      onSaveProject={() => void saveProject()}
      chatId={deleteDialogChatId}
      projectDeleteId={deleteDialogProjectId}
      onCloseChatDelete={() => setDeleteDialogChatId(null)}
      onCloseProjectDelete={() => setDeleteDialogProjectId(null)}
      onDeleteChat={() => {
        if (deleteDialogChatId) void deleteChat(deleteDialogChatId);
        setDeleteDialogChatId(null);
      }}
      onDeleteProject={() => {
        if (deleteDialogProjectId) void deleteProject(deleteDialogProjectId);
        setDeleteDialogProjectId(null);
      }}
    />
    {searchOpen && (
      <SidebarSearchOverlay
        query={query}
        buttonRef={searchButtonRef}
        onQuery={setQuery}
        onClose={() => {
          setSearchOpen(false);
          setQuery('');
        }}
        onOpen={(id) => {
          setSearchOpen(false);
          setQuery('');
          void openChat(id);
        }}
      />
    )}
    </>
  );
}
