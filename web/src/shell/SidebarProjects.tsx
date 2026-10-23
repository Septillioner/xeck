import type { RefObject, ReactNode } from 'react';
import { t } from '../i18n/index.ts';
import { cn } from '../lib/cn.ts';
import { IconChevron, IconEdit, IconFolder, IconMoreVertical, IconPlus, IconTrash } from '../ui/icons.tsx';
import { ICON_BUTTON, ICON_BUTTON_ROW } from '../ui/button-styles.ts';
import type { Project, SessionSummary } from '../../../shared/types.ts';

const MENU_VIEWPORT_GUTTER_PX = 8;
const PROJECT_CHAT_PREVIEW_COUNT = 3;
const ACTIVE_ROW = 'bg-chat-active text-ink';

export function SidebarProjects({
  projects,
  sessions,
  settingsOpen,
  projectPageId,
  expandedProjectIds,
  projectActionError,
  openActionsId,
  menuUp,
  actionsMenuRef,
  onCreateProject,
  onToggleProjectChats,
  onOpenProject,
  onToggleActions,
  onCreateChat,
  onRenameProject,
  onDeleteProject,
  renderSession,
}: {
  projects: Project[];
  sessions: SessionSummary[];
  settingsOpen: boolean;
  projectPageId: string | null;
  expandedProjectIds: Record<string, true>;
  projectActionError: string | null;
  openActionsId: string | null;
  menuUp: boolean;
  actionsMenuRef: RefObject<HTMLDivElement | null>;
  onCreateProject: () => void;
  onToggleProjectChats: (id: string) => void;
  onOpenProject: (projectId: string) => void;
  onToggleActions: (id: string) => void;
  onCreateChat: (projectId: string) => void;
  onRenameProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  renderSession: (session: SessionSummary, nested?: boolean) => ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mx-2.5 mb-2 flex items-center justify-between">
        <h2 className="text-micro font-semibold tracking-[0.06em] text-muted uppercase">{t('Projects')}</h2>
        <button type="button" aria-label={t('New project')} className={ICON_BUTTON} onClick={onCreateProject}>
          <IconPlus />
        </button>
      </div>
      {projects.length === 0 && <p className="mx-2.5 py-1.5 text-small text-muted">{t('No projects yet')}</p>}
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
                  aria-label={expanded ? t('Collapse {0}', { '0': project.name }) : t('Expand {0}', { '0': project.name })}
                  aria-expanded={expanded}
                  aria-controls={`project-chats-${project.id}`}
                  className={ICON_BUTTON_ROW}
                  onClick={() => onToggleProjectChats(project.id)}
                >
                  <IconChevron className={cn('transition-transform', expanded && 'rotate-90')} />
                </button>
                <button
                  type="button"
                  aria-current={pageOpen ? 'page' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left"
                  onClick={() => onOpenProject(project.id)}
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
                    aria-label={t('Project actions for {0}', { '0': project.name })}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-controls={projectMenuId}
                    className={cn(ICON_BUTTON_ROW, '[&_svg]:h-[18px] [&_svg]:w-[18px]', menuOpen && 'bg-track text-ink')}
                    onClick={() => onToggleActions(projectKey)}
                  >
                    <IconMoreVertical />
                  </button>
                  {menuOpen && (
                    <div
                      id={projectMenuId}
                      role="menu"
                      aria-label={t('Project actions for {0}', { '0': project.name })}
                      className={cn('absolute right-0 w-44 overflow-y-auto rounded-control bg-chip p-1', menuUp ? 'bottom-full mb-1' : 'top-full mt-1')}
                      style={{ maxHeight: `calc(100vh - ${MENU_VIEWPORT_GUTTER_PX * 2}px)` }}
                    >
                      <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover" onClick={() => onCreateChat(project.id)}>
                        <IconPlus /><span>{t('New chat')}</span>
                      </button>
                      <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover" onClick={() => onRenameProject(project)}>
                        <IconEdit /><span>{t('Rename')}</span>
                      </button>
                      <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-danger hover:bg-hover" onClick={() => onDeleteProject(project.id)}>
                        <IconTrash /><span>{t('Delete')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {expanded && (projectSessions.length === 0 ? (
                <p className="py-1 pl-12 text-small text-muted">{t('No chats yet')}</p>
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
  );
}
