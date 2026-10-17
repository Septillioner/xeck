import type { SessionSummary } from '../../../shared/types.ts';
import { groupSessions } from '../lib/group-sessions.ts';
import { formatChatDate, formatChatTime } from '../lib/session-time.ts';
import { useAppState } from '../state/AppState.tsx';
import { isActiveMood, moodLabel, type BotMood } from '../state/mood.ts';
import { IconBusy, IconChat, IconFolder, IconPlus } from '../ui/icons.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { TypingText } from '../ui/TypingText.tsx';

/**
 * The full chat list of one project, shown in the main pane at `/p/<id>`.
 *
 * It is a navigation surface, not a management one: a row opens its chat and
 * the header starts a new one in the project. Rename, move and delete stay in
 * the sidebar rows, so this page never has to mirror their menu machinery.
 * Rows reuse the `.chat-row` mood contract from `styles/components.css`, which
 * is why they carry both the class and `data-mood`.
 *
 * The content column is `max-w-3xl` (48rem, the same measure as the chat
 * transcript), so the header and the list share one left edge on a wide pane.
 */
export function ProjectChatsPage({ projectId }: { projectId: string }) {
  const { projects, sessions, sessionMoods, createChat, openChat } = useAppState();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return null;

  const projectSessions = sessions.filter((session) => session.projectId === projectId);
  const groups = groupSessions(projectSessions);

  return (
    <section className="panel-shell flex min-w-0 flex-1 flex-col bg-main" aria-labelledby="project-title">
      <header className="bg-sidebar">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-gutter py-6 max-md:px-4 max-md:py-5">
          <span
            className="flex size-11 flex-none items-center justify-center rounded-card bg-accent text-on-accent"
            aria-hidden="true"
          >
            <IconFolder />
          </span>
          <div className="min-w-0 flex-1">
            <h1 id="project-title" className="truncate text-heading font-semibold tracking-tight">
              {project.name}
            </h1>
            <p className="mt-1 truncate text-small text-muted">{headerMeta(projectSessions)}</p>
          </div>
          <button
            type="button"
            className={BUTTON.primary}
            onClick={() => createChat(project.id)}
          >
            <IconPlus />
            New chat
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-3xl px-gutter py-6 max-md:px-4">
          {projectSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <span
                className="flex size-11 items-center justify-center rounded-card bg-field text-muted"
                aria-hidden="true"
              >
                <IconChat />
              </span>
              <p className="text-ui font-medium text-ink">No chats in this project yet</p>
              <p className="text-small text-muted">Start one with New chat and it appears here.</p>
            </div>
          ) : (
            [...groups.entries()].map(([label, items]) =>
              items.length === 0 ? null : (
                <section key={label} className="mb-section last:mb-0">
                  <div className="sticky top-0 z-10 mb-2 flex items-center gap-3 bg-main py-2">
                    <h2 className="text-micro font-semibold tracking-[0.04em] text-muted uppercase">{label}</h2>
                    <span className="ml-auto text-micro tabular-nums text-muted">{items.length}</span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {items.map((session) => (
                      <ProjectChatRow
                        key={session.id}
                        session={session}
                        mood={sessionMoods[session.id] ?? 'idle'}
                        onOpen={openChat}
                      />
                    ))}
                  </ul>
                </section>
              ),
            )
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectChatRow({
  session,
  mood,
  onOpen,
}: {
  session: SessionSummary;
  mood: BotMood;
  onOpen: (id: string) => Promise<void>;
}) {
  const active = isActiveMood(mood);
  return (
    <li data-mood={mood} className="chat-row overflow-hidden rounded-card bg-chip transition-colors hover:bg-chat-hover has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-ink">
      <button
        type="button"
        title={session.title}
        className="relative flex min-h-14 w-full items-center gap-3 px-4 text-left text-body text-ink focus-visible:outline-none hover-none:min-h-14"
        onClick={() => void onOpen(session.id)}
      >
        {active && <IconBusy mood={mood} />}
        <TypingText text={session.title} className="min-w-0 flex-1 truncate" />
        <span className="flex flex-none items-center gap-2">
          {mood !== 'idle' && (
            <span className="chat-mood-dot h-1.5 w-1.5 flex-none rounded-full bg-mood" aria-hidden="true" />
          )}
          {active && <span className="text-micro text-mood">{moodLabel(mood)}</span>}
          <time className="w-14 flex-none text-right text-small tabular-nums text-muted" dateTime={session.updatedAt}>
            {formatChatTime(session.updatedAt)}
          </time>
        </span>
      </button>
    </li>
  );
}

/** Count plus the newest update, so the header says how alive the project is. */
function headerMeta(sessions: SessionSummary[]): string {
  const latest = sessions[0];
  if (!latest) return chatCount(0);
  return `${chatCount(sessions.length)} · Updated ${formatChatDate(latest.updatedAt)}`;
}

function chatCount(count: number): string {
  return count === 1 ? '1 chat' : `${count} chats`;
}
