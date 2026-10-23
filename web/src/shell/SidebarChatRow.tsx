import type { RefObject } from 'react';
import { t } from '../i18n/index.ts';
import { cn } from '../lib/cn.ts';
import type { SessionSummary } from '../../../shared/types.ts';
import { isActiveMood, moodLabel, type BotMood } from '../state/mood.ts';
import { BotAvatar } from '../ui/BotAvatar.tsx';
import { IconBusy, IconChat, IconEdit, IconMoreVertical, IconTrash } from '../ui/icons.tsx';
import type { MenuOption } from '../ui/Menu.tsx';
import { TypingText } from '../ui/TypingText.tsx';
import { TextField } from '../ui/TextField.tsx';

const CHAT_ROW = 'relative flex min-h-8 w-full items-center gap-2.5 rounded-row pr-2.5 pl-2 text-left hover:bg-chat-hover hover-none:min-h-11';
const ACTIVE_ROW = 'bg-chat-active text-ink';
const MENU_VIEWPORT_GUTTER_PX = 8;
const PROJECT_SUBMENU_MAX_HEIGHT_PX = 240;

export function SidebarChatRow({
  session,
  nested,
  selected,
  mood,
  actionsOpen,
  editing,
  titleDraft,
  menuUp,
  projectSubmenuOpen,
  projectSubmenuPosition,
  projectOptions,
  actionsMenuRef,
  projectSubmenuTriggerRef,
  projectSubmenuRef,
  onOpen,
  onToggleActions,
  onToggleProjectSubmenu,
  onStartRename,
  onTitleDraft,
  onFinishEditing,
  onCancelEditing,
  onDelete,
  onAssignProject,
}: {
  session: SessionSummary;
  nested: boolean;
  selected: boolean;
  mood: BotMood;
  actionsOpen: boolean;
  editing: boolean;
  titleDraft: string;
  menuUp: boolean;
  projectSubmenuOpen: boolean;
  projectSubmenuPosition: { top: number; left: number } | null;
  projectOptions: MenuOption[];
  actionsMenuRef: RefObject<HTMLDivElement | null>;
  projectSubmenuTriggerRef: RefObject<HTMLButtonElement | null>;
  projectSubmenuRef: RefObject<HTMLDivElement | null>;
  onOpen: (id: string) => void;
  onToggleActions: (id: string) => void;
  onToggleProjectSubmenu: () => void;
  onStartRename: (id: string, title: string) => void;
  onTitleDraft: (value: string) => void;
  onFinishEditing: () => void;
  onCancelEditing: () => void;
  onDelete: (id: string) => void;
  onAssignProject: (sessionId: string, projectId: string | null) => void;
}) {
  const busy = isActiveMood(mood);
  const hasMood = mood !== 'idle';
  const actionsMenuId = `chat-actions-${session.id}`;

  return (
    <li data-mood={mood} className="chat-row group relative rounded-control">
      {editing ? (
        <TextField
          autoFocus
          value={titleDraft}
          width="block"
          onChange={(event) => onTitleDraft(event.target.value)}
          onBlur={onFinishEditing}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') onCancelEditing();
          }}
        />
      ) : <button
        type="button"
        className={cn(CHAT_ROW, nested && 'text-ui text-muted hover:text-ink', selected && cn(ACTIVE_ROW, 'font-medium'))}
        aria-current={selected ? 'page' : undefined}
        onClick={() => onOpen(session.id)}
      >
        {busy ? <IconBusy mood={mood} /> : session.botConversation ? <IconChat /> : session.bot ? <BotAvatar name={session.title} color={session.bot.color} /> : null}
        <span className="min-w-0 flex-1">
          <TypingText text={session.title} className="block truncate" />
          {session.bot && !session.botConversation && session.bot.badges?.length ? <span className="mt-1 flex min-w-0 gap-1 overflow-hidden">
            {session.bot.badges.slice(0, 2).map((badge) => <span key={badge} className="max-w-24 truncate rounded-full bg-field px-1.5 py-0.5 text-micro text-muted">{badge}</span>)}
            {session.bot.badges.length > 2 && <span className="text-micro text-muted">+{session.bot.badges.length - 2}</span>}
          </span> : null}
        </span>
        {hasMood && <span className="chat-mood-dot h-1.5 w-1.5 flex-none rounded-full bg-mood" aria-hidden="true" />}
        <span className="w-7 flex-none hover-none:w-8" aria-hidden="true" />
      </button>}
      {!editing && <div
        ref={actionsOpen ? actionsMenuRef : null}
        className={cn(
          'absolute top-1/2 right-1 -translate-y-1/2',
          actionsOpen && 'z-30',
          !actionsOpen && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover-none:opacity-100',
        )}
      >
        <button
          type="button"
          aria-label={t('Chat actions for {0}', { '0': session.title })}
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          aria-controls={actionsMenuId}
          className={cn(
            'flex size-control-sm items-center justify-center rounded-tile text-muted hover:bg-track hover:text-ink hover-none:size-9 [&_svg]:h-[18px] [&_svg]:w-[18px]',
            actionsOpen && 'bg-track text-ink',
          )}
          onClick={() => onToggleActions(session.id)}
        >
          <IconMoreVertical />
        </button>
        {actionsOpen && (
          <div
            id={actionsMenuId}
            role="menu"
            aria-label={t('Chat actions for {0}', { '0': session.title })}
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
                onClick={onToggleProjectSubmenu}
              >
                <span>{t('Projeye taşı')}</span>
                <span aria-hidden="true">›</span>
              </button>
              {projectSubmenuOpen && (
                <div
                  ref={projectSubmenuRef}
                  id={`chat-project-options-${session.id}`}
                  role="menu"
                  aria-label={t('Move chat to project')}
                  className="fixed z-30 max-h-60 w-48 overflow-y-auto rounded-control bg-chip p-1"
                  style={{
                    top: projectSubmenuPosition?.top ?? 0,
                    left: projectSubmenuPosition?.left ?? 0,
                    maxWidth: `calc(100vw - ${MENU_VIEWPORT_GUTTER_PX * 2}px)`,
                    maxHeight: Math.max(0, Math.min(PROJECT_SUBMENU_MAX_HEIGHT_PX, window.innerHeight - MENU_VIEWPORT_GUTTER_PX * 2)),
                    visibility: projectSubmenuPosition ? 'visible' : 'hidden',
                  }}
                >
                  {projectOptions.map((option) => (
                    <button
                      key={option.value || 'no-project'}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover"
                      onClick={() => onAssignProject(session.id, option.value || null)}
                    >
                      {option.icon}<span className="min-w-0 truncate">{option.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!session.botConversation && (
              <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-ink hover:bg-hover" onClick={() => onStartRename(session.id, session.title)}>
                <IconEdit /><span>{t('Yeniden adlandır')}</span>
              </button>
            )}
            <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui text-danger hover:bg-hover" onClick={() => onDelete(session.id)}>
              <IconTrash /><span>{t('Sil')}</span>
            </button>
          </div>
        )}
      </div>}
      {hasMood && <span className="sr-only">{t(moodLabel(mood))}</span>}
    </li>
  );
}
