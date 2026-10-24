import { useRef, useState, type RefObject } from 'react';
import { t, useI18n } from '../i18n/index.ts';
import { useAppState } from '../state/AppState.tsx';
import { IconChat, IconFolder, IconSearch, IconXeck } from '../ui/icons.tsx';
import { TextField } from '../ui/TextField.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { cn } from '../lib/cn.ts';
import { SessionActions } from './SessionActions.tsx';

export function SidebarSearchOverlay({ query, onQuery, onClose, onOpen, onOpenProject, initialScope = 'all' }: {
  query: string; buttonRef?: RefObject<HTMLButtonElement | null>; onQuery: (value: string) => void;
  onClose: () => void; onOpen: (id: string) => void; onOpenProject: (id: string) => void; initialScope?: 'all' | 'archive';
}) {
  const { sessions, projects, workspace } = useAppState();
  const { locale } = useI18n();
  const [scope, setScope] = useState<'all' | 'chats' | 'bots' | 'projects' | 'archive'>(initialScope);
  const resultsRef = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLocaleLowerCase(locale);
  const botWorkspace = workspace === 'bots';
  const matchingProjects = !botWorkspace && (scope === 'all' || scope === 'projects') ? projects.filter((project) => project.name.toLocaleLowerCase(locale).includes(needle)) : [];
  const matchingSessions = scope === 'projects' ? [] : sessions.filter((session) => {
    if (Boolean(session.bot || session.botConversation) !== botWorkspace) return false;
    if (Boolean(session.archived) !== (scope === 'archive')) return false;
    if (scope === 'chats' && (session.bot || session.botConversation)) return false;
    if (scope === 'bots' && (!session.bot || session.botConversation)) return false;
    const projectName = projects.find((project) => project.id === session.projectId)?.name ?? '';
    return [session.title, session.bot?.purpose, ...(session.bot?.badges ?? []), projectName].join(' ').toLocaleLowerCase(locale).includes(needle);
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
  const count = matchingProjects.length + matchingSessions.length;
  return <Dialog title={t(scope === 'archive' ? 'Archive' : 'Search')} onClose={onClose}>
    <div className="flex flex-col gap-3 px-gutter pb-gutter">
      <div className="flex items-center gap-2 rounded-control bg-field px-3 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ink">
        <IconSearch className="shrink-0 text-muted" />
        <TextField bare value={query} onChange={(event) => onQuery(event.target.value)} aria-label={t(botWorkspace ? 'Search XeckBots and conversations' : 'Search chats and projects')} placeholder={t('Search chats, bots and projects')}
          className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-body outline-none focus:outline-none" onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); resultsRef.current?.querySelector<HTMLButtonElement>('[data-search-result]')?.focus(); } }} />
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('Filter results')}>
        {(botWorkspace ? ['all', 'bots', 'archive'] as const : ['all', 'chats', 'projects', 'archive'] as const).map((item) => <button key={item} type="button" className={cn(BUTTON.ghost, scope === item && 'bg-chat-active text-ink')} aria-pressed={scope === item} onClick={() => setScope(item)}>{t({ all: 'All', chats: 'Chats', bots: 'My bots', projects: 'Projects', archive: 'Archive' }[item])}</button>)}
      </div>
      <p className="text-small text-muted" role="status">{t('{0} results', { 0: count })}</p>
      <div ref={resultsRef} className="max-h-80 overflow-auto" onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...resultsRef.current!.querySelectorAll<HTMLButtonElement>('[data-search-result]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}>
        {count === 0 && <p className="py-8 text-center text-ui text-muted">{t('No matching results')}</p>}
        {matchingProjects.map((project) => <button key={project.id} data-search-result type="button" className="flex min-h-14 w-full items-center gap-3 rounded-control px-3 text-left hover:bg-hover" onClick={() => onOpenProject(project.id)}><IconFolder className="shrink-0 text-muted" /><span className="min-w-0"><span className="block truncate text-body">{project.name}</span><span className="text-small text-muted">{t('Project')}</span></span></button>)}
        {matchingSessions.map((session) => <div key={session.id} className="flex items-center rounded-control pr-1 hover:bg-hover">
          <button data-search-result type="button" className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-control px-3 text-left" onClick={() => onOpen(session.id)}>
            {session.bot ? <IconXeck className="shrink-0 text-muted" /> : <IconChat className="shrink-0 text-muted" />}
            <span className="min-w-0"><span className="block truncate text-body">{session.title}</span><span className="block truncate text-small text-muted">{session.botConversation ? t('Bot conversations') : session.bot ? 'XeckBot' : t('Chat')}{projects.some((project) => project.id === session.projectId) ? ' · ' + projects.find((project) => project.id === session.projectId)!.name : ''} · {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(session.updatedAt))}</span></span>
          </button>
          <SessionActions session={session} />
        </div>)}
      </div>
    </div>
  </Dialog>;
}
