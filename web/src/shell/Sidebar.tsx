import { t } from '../i18n/index.ts';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAppState } from '../state/AppState.tsx';
import { isActiveMood, moodLabel, type BotMood } from '../state/mood.ts';
import { groupSessions } from '../lib/group-sessions.ts';
import { cn } from '../lib/cn.ts';
import { IconBusy, IconChat, IconChevron, IconEdit, IconFolder, IconMoreVertical, IconPlus, IconXeck, IconSearch, IconSettings, IconTrash } from '../ui/icons.tsx';
import { BotAvatar } from '../ui/BotAvatar.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { BUTTON, ICON_BUTTON, ICON_BUTTON_DANGER, ICON_BUTTON_ROW } from '../ui/button-styles.ts';
import type { MenuOption } from '../ui/Menu.tsx';
import { TypingText } from '../ui/TypingText.tsx';
import { MAX_PROJECT_NAME_CHARS } from '../../../shared/limits.ts';
import type { Project, SessionSummary } from '../../../shared/types.ts';
import { TextField } from '../ui/TextField.tsx';
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
/** Chats previewed under a project row before the project page takes over. */
const PROJECT_CHAT_PREVIEW_COUNT = 3;

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
    const busy = isActiveMood(mood);
    const hasMood = mood !== 'idle';
    const actionsOpen = openActionsId === session.id;
    const actionsMenuId = `chat-actions-${session.id}`;
    return (
      <li key={session.id} data-mood={mood} className="chat-row group relative rounded-control">
        {editingId === session.id ? (
          <TextField
            autoFocus
            value={titleDraft}
            width="block"
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => {
              setEditingId(null);
              const next = titleDraft.trim();
              if (next && next !== session.title) void renameChat(session.id, next);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setTitleDraft(session.title);
                setEditingId(null);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={cn(CHAT_ROW, nested && 'text-ui text-muted hover:text-ink', selected && cn(ACTIVE_ROW, 'font-medium'))}
            aria-current={selected ? 'page' : undefined}
            onClick={() => {
              void openChat(session.id);
            }}
          >
            {busy ? <IconBusy mood={mood} /> : session.botConversation ? <IconChat /> : session.bot ? <BotAvatar name={session.title} color={session.bot.color} /> : null}
            <TypingText text={session.title} className="min-w-0 flex-1 truncate" />
            {hasMood && <span className="chat-mood-dot h-1.5 w-1.5 flex-none rounded-full bg-mood" aria-hidden="true" />}
            <span className="w-7 flex-none hover-none:w-8" aria-hidden="true" />
          </button>
        )}
        {editingId !== session.id && (
          <div
            ref={actionsOpen ? actionsMenuRef : null}
            className={cn(
              'absolute top-1/2 right-1 -translate-y-1/2',
              actionsOpen && 'z-30',
              !actionsOpen && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover-none:opacity-100',
            )}
          >
            <button
              type="button"
              aria-label={t("Chat actions for {0}", { "0": session.title })}
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              aria-controls={actionsMenuId}
              className={cn(
                'flex size-control-sm items-center justify-center rounded-tile text-muted hover:bg-track hover:text-ink hover-none:size-9 [&_svg]:h-[18px] [&_svg]:w-[18px]',
                actionsOpen && 'bg-track text-ink',
              )}
              onClick={() => {
                setProjectSubmenuOpen(false);
                setOpenActionsId((current) => (current === session.id ? null : session.id));
              }}
            >
              <IconMoreVertical />
            </button>
            {actionsOpen && (
              <div
                id={actionsMenuId}
                role="menu"
                aria-label={t("Chat actions for {0}", { "0": session.title })}
                className={cn('absolute right-0 w-44 overflow-y-auto rounded-control bg-chip p-1', menuUp ? 'bottom-full mb-1' : 'top-full mt-1')}
                style={{ maxHeight: `calc(100vh - ${MENU_VIEWPORT_GUTTER_PX * 2}px)` }}
              >
                <div className="relative" hidden={Boolean(session.bot)}>

                    <button
                      ref={actionsOpen ? projectSubmenuTriggerRef : null}
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={projectSubmenuOpen}
                      aria-controls={`chat-project-options-${session.id}`}
                      className="flex w-full items-center justify-between rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover"
                      onClick={() => setProjectSubmenuOpen((open) => !open)}
                    >
                      <span>{t("Projeye taşı")}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                    {projectSubmenuOpen && createPortal(
                      <div
                        ref={projectSubmenuRef}
                        id={`chat-project-options-${session.id}`}
                        role="menu"
                        aria-label={t("Move chat to project")}
                        className="fixed z-30 max-h-60 w-48 overflow-y-auto rounded-control bg-chip p-1"
                        style={{
                          top: projectSubmenuPosition?.top ?? 0,
                          left: projectSubmenuPosition?.left ?? 0,
                          maxWidth: `calc(100vw - ${MENU_VIEWPORT_GUTTER_PX * 2}px)`,
                          maxHeight: Math.max(
                            0,
                            Math.min(
                              PROJECT_SUBMENU_MAX_HEIGHT_PX,
                              window.innerHeight - MENU_VIEWPORT_GUTTER_PX * 2,
                            ),
                          ),
                          visibility: projectSubmenuPosition ? 'visible' : 'hidden',
                        }}
                      >
                        {projectOptions.map((option) => (
                          <button
                            key={option.value || 'no-project'}
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover"
                            onClick={() => {
                              setProjectActionError(null);
                              void assignChatToProject(session.id, option.value || null).catch((cause) =>
                                setProjectActionError(cause instanceof Error ? cause.message : t("Could not move the chat")),
                              );
                              setOpenActionsId(null);
                              setProjectSubmenuOpen(false);
                            }}
                          >
                            {option.icon}
                            <span className="min-w-0 truncate">{option.label}</span>
                          </button>
                        ))}
                      </div>,
                      document.body,
                    )}
                  </div>
                {!session.botConversation && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover"
                  onClick={() => {
                    setOpenActionsId(null);
                    setProjectSubmenuOpen(false);
                    setEditingId(session.id);
                    setTitleDraft(session.title);
                    setDeleteDialogChatId(null);
                  }}
                >
                  <IconEdit />
                  <span>{t("Yeniden adlandır")}</span>
                </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-danger hover:bg-hover"
                  onClick={() => {
                    setDeleteDialogChatId(session.id);
                    setOpenActionsId(null);
                    setProjectSubmenuOpen(false);
                  }}
                >
                  <IconTrash />
                  <span>{t("Sil")}</span>
                </button>
              </div>
            )}
          </div>
        )}
        {hasMood && <span className="sr-only">{t(moodLabel(mood))}</span>}
      </li>
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
        <section className="mb-4">
          <div className="mx-2.5 mb-2 flex items-center justify-between">
            <h2 className="text-micro font-semibold tracking-[0.06em] text-muted uppercase">{t("Projects")}</h2>
            <button
              type="button"
              aria-label={t("New project")}
              className={ICON_BUTTON}
              onClick={openCreateProject}
            >
              <IconPlus />
            </button>
          </div>
          {projects.length === 0 && <p className="mx-2.5 py-1.5 text-small text-muted">{t("No projects yet")}</p>}
          {projectActionError && <p className="mx-2 mb-2 text-small text-danger" role="alert">{t(projectActionError)}</p>}
          <ul className="flex flex-col gap-1">
            {projects.map((project) => {
              const projectSessions = sessions.filter((session) => session.projectId === project.id);
              const expanded = Boolean(expandedProjectIds[project.id]);
              const pageOpen = !settingsOpen && projectPageId === project.id;
              const projectKey = `project-${project.id}`;
              const menuOpen = openActionsId === projectKey;
              const projectMenuId = `project-actions-${project.id}`;
              return (
                <li key={project.id} className="rounded-control">
                  <div className={cn('group/project relative flex min-h-8 items-center gap-2 rounded-control px-2.5 hover:bg-hover hover-none:min-h-11', pageOpen && ACTIVE_ROW)}>
                    <button
                      type="button"
                      aria-label={expanded ? t("Collapse {0}", { "0": project.name }) : t("Expand {0}", { "0": project.name })}
                      aria-expanded={expanded}
                      aria-controls={`project-chats-${project.id}`}
                      className={ICON_BUTTON_ROW}
                      onClick={() => toggleProjectChats(project.id)}
                    >
                      <IconChevron className={cn('transition-transform', expanded && 'rotate-90')} />
                    </button>
                    <button
                      type="button"
                      aria-current={pageOpen ? 'page' : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left"
                      onClick={() => openProjectPage(project.id)}
                    >
                      <IconFolder />
                      <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">{project.name}</span>
                    </button>
                    <div
                      ref={menuOpen ? actionsMenuRef : null}
                      className={cn(
                        'relative flex-none opacity-0 transition-opacity duration-100 group-hover/project:opacity-100 group-focus-within/project:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100',
                        menuOpen && 'z-30 opacity-100',
                      )}
                    >
                      <button
                        type="button"
                        aria-label={t("Project actions for {0}", { "0": project.name })}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-controls={projectMenuId}
                        className={cn(ICON_BUTTON_ROW, '[&_svg]:h-[18px] [&_svg]:w-[18px]', menuOpen && 'bg-track text-ink')}
                        onClick={() => {
                          setProjectSubmenuOpen(false);
                          setOpenActionsId((current) => (current === projectKey ? null : projectKey));
                        }}
                      >
                        <IconMoreVertical />
                      </button>
                      {menuOpen && (
                        <div
                          id={projectMenuId}
                          role="menu"
                          aria-label={t("Project actions for {0}", { "0": project.name })}
                          className={cn('absolute right-0 w-44 overflow-y-auto rounded-control bg-chip p-1', menuUp ? 'bottom-full mb-1' : 'top-full mt-1')}
                style={{ maxHeight: `calc(100vh - ${MENU_VIEWPORT_GUTTER_PX * 2}px)` }}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover"
                            onClick={() => {
                              setOpenActionsId(null);
                              void createChat(project.id);
                            }}
                          >
                            <IconPlus />
                            <span>{t("New chat")}</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover"
                            onClick={() => {
                              setOpenActionsId(null);
                              openRenameProject(project);
                            }}
                          >
                            <IconEdit />
                            <span>{t("Rename")}</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-danger hover:bg-hover"
                            onClick={() => {
                              setOpenActionsId(null);
                              setDeleteDialogProjectId(project.id);
                            }}
                          >
                            <IconTrash />
                            <span>{t("Delete")}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {expanded && (projectSessions.length === 0 ? (
                    <p className="py-1 pl-12 text-small text-muted">{t("No chats yet")}</p>
                  ) : (
                    <ul id={`project-chats-${project.id}`} className="mt-1 mb-1 ml-8 flex flex-col gap-1">
                      {projectSessions.slice(0, PROJECT_CHAT_PREVIEW_COUNT).map((session) => renderSession(session, true))}
                    </ul>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
        <h2 className="mx-2.5 mb-2 text-micro font-semibold tracking-[0.06em] text-muted uppercase">{botWorkspace ? t("XeckBots") : t("Chats")}</h2>
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
    {projectDialogOpen && (
      <Dialog
        title={projectDialogId ? t("Rename project") : t("New project")}
        onClose={() => setProjectDialogOpen(false)}
      >
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProject();
          }}
        >
          <label className="flex flex-col gap-2 text-ui text-muted">
            {t("Project name")}<TextField
              autoFocus
              width="block"
              value={projectNameDraft}
              maxLength={MAX_PROJECT_NAME_CHARS}
              onChange={(event) => setProjectNameDraft(event.target.value)}
            />
          </label>
          {projectDialogError && <p className="text-small text-danger" role="alert">{t(projectDialogError)}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BUTTON.ghost}
              onClick={() => setProjectDialogOpen(false)}
            >
              {t("Cancel")}</button>
            <button
              type="submit"
              className={BUTTON.primary}
              disabled={projectDialogBusy}
            >
              {projectDialogBusy ? t("Saving") : t("Save")}
            </button>
          </div>
        </form>
      </Dialog>
    )}
    {deleteDialogChatId && (
      <Dialog
        title={t("Chatu sil")}
        onClose={() => setDeleteDialogChatId(null)}
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="text-ui text-muted">
            {t("Bu chatı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BUTTON.ghost}
              onClick={() => setDeleteDialogChatId(null)}
            >
              {t("İptal")}</button>
            <button
              type="button"
              data-primary
              className={BUTTON.danger}
              onClick={() => {
                void deleteChat(deleteDialogChatId);
                setDeleteDialogChatId(null);
              }}
            >
              {t("Sil")}</button>
          </div>
        </div>
      </Dialog>
    )}
    {deleteDialogProjectId && (
      <Dialog
        title={t("Projeyi sil")}
        onClose={() => setDeleteDialogProjectId(null)}
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="text-ui text-muted">
            {t("Bu projeyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BUTTON.ghost}
              onClick={() => setDeleteDialogProjectId(null)}
            >
              {t("İptal")}</button>
            <button
              type="button"
              data-primary
              className={BUTTON.danger}
              onClick={() => {
                void deleteProject(deleteDialogProjectId);
                setDeleteDialogProjectId(null);
              }}
            >
              {t("Sil")}</button>
          </div>
        </div>
      </Dialog>
    )}
    {searchOpen && (
      <SearchOverlay
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

function SearchOverlay({
  query,
  buttonRef,
  onQuery,
  onClose,
  onOpen,
}: {
  query: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onQuery: (value: string) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { sessions } = useAppState();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const needle = query.trim().toLowerCase();
  const matches = sessions.filter((session) => session.title.toLowerCase().includes(needle));

  useEffect(() => {
    inputRef.current?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [buttonRef]);

  return (
    <div className="fixed inset-0 z-20 flex justify-center bg-scrim pt-[12vh]">
      <div className="h-fit w-[min(32rem,calc(100%-32px))] overflow-hidden rounded-card bg-chip" ref={panelRef}>
        <div className="flex h-12 items-center gap-2.5 px-3.5 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ink">
          <IconSearch className="h-[18px] w-[18px] flex-none text-muted" />
          <TextField bare
            ref={inputRef}
            value={query}
            placeholder={t("Search chats")}
            aria-label={t("Search chats")}
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-lead focus:outline-none"
            onChange={(event) => onQuery(event.target.value)}
          />
          <kbd className="flex-none rounded-full bg-field px-2 py-0.5 font-sans text-micro text-muted">{t("Esc")}</kbd>
        </div>
        <div className="max-h-[320px] overflow-auto p-1 [scrollbar-gutter:stable]">
          {matches.length === 0 ? (
            <p className="p-4 text-ui text-muted">{t("No chats")}</p>
          ) : (
            matches.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onOpen(session.id)}
                className="block w-full truncate rounded-control px-3 py-2 text-left text-body hover:bg-hover"
              >
                {session.title}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
