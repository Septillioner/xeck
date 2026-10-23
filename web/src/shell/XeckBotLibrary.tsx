import { useState } from 'react';
import type { SessionSummary } from '../../../shared/types.ts';
import { t, useI18n } from '../i18n/index.ts';
import { cn } from '../lib/cn.ts';
import { BotAvatar } from '../ui/BotAvatar.tsx';
import { BUTTON, ICON_BUTTON } from '../ui/button-styles.ts';
import { IconChat, IconClose, IconEdit, IconPlus, IconSearch, IconSend, IconSpinner, IconXeck } from '../ui/icons.tsx';
import { TextField } from '../ui/TextField.tsx';

export function XeckBotLibrary({ bots, conversations, error, loadingProfileId, onCreate, onOpen, onEdit }: {
  bots: SessionSummary[];
  conversations: SessionSummary[];
  error: string | null;
  loadingProfileId: string | null;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onEdit: (bot: SessionSummary) => void;
}) {
  const { locale } = useI18n();
  const [view, setView] = useState<'bots' | 'conversations'>('bots');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase(locale);
  const items = (view === 'bots' ? bots : conversations)
    .filter((item) => [item.title, item.bot?.purpose, ...(item.bot?.badges ?? [])].join(' ').toLocaleLowerCase(locale).includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(value));
  const firstBot = bots.length === 0 && view === 'bots' && !needle;

  return (
    <div className="mx-auto w-full max-w-5xl px-gutter py-8 max-sm:px-4 max-sm:py-6">
      <header className="mb-8 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <h1 id="xeckbot-title" className="m-0 text-heading font-semibold tracking-tight text-ink">{t('XeckBot')}</h1>
          <p className="mt-2 max-w-lg text-body leading-relaxed text-muted">{t('Your own assistants, each with a purpose. Pick one and continue where you left off.')}</p>
        </div>
        {!firstBot && <button type="button" className={BUTTON.primary} onClick={onCreate}><IconPlus />{t('XeckBot oluştur')}</button>}
      </header>

      {error && <p role="alert" className="mb-4 rounded-control bg-field px-3 py-2 text-small text-danger">{t(error)}</p>}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-control bg-field p-1" role="group" aria-label={t('XeckBot library')}>
          {(['bots', 'conversations'] as const).map((tab) => (
            <button key={tab} type="button" aria-pressed={view === tab}
              className={cn(BUTTON.ghost, view === tab && 'bg-chat-active text-ink')}
              onClick={() => { setView(tab); setQuery(''); }}>
              {tab === 'bots' ? <IconXeck /> : <IconChat />}
              {tab === 'bots' ? t('My bots') : t('Bot conversations')}
              <span className="text-small tabular-nums text-muted">{tab === 'bots' ? bots.length : conversations.length}</span>
            </button>
          ))}
        </div>
        {(bots.length > 0 || conversations.length > 0) && (
          <div className="flex h-9 w-64 items-center gap-2 rounded-control bg-field px-3 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ink max-sm:w-full">
            <IconSearch className="shrink-0 text-muted" />
            <TextField bare type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Search by name or expertise')} aria-label={t('Search XeckBots and conversations')}
              className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-ui text-ink outline-none focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
            {query && <button type="button" className={ICON_BUTTON} aria-label={t('Clear search')} onClick={() => setQuery('')}><IconClose /></button>}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-card bg-chip px-gutter py-12 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-card bg-field text-muted">{needle ? <IconSearch /> : view === 'bots' ? <IconXeck size={26} /> : <IconChat />}</span>
          <h2 className="text-large font-semibold text-ink">{needle ? t('No matching results') : view === 'bots' ? t('Meet your next assistant') : t('No bot conversations yet')}</h2>
          <p className="mt-2 max-w-sm text-body leading-relaxed text-muted">{needle ? t('Try a different name, purpose, or badge.') : view === 'bots' ? t('Give your bot a name and a task. Its instructions and personality will be prepared for you.') : t('Conversations between your bots will appear here.')}</p>
          {needle ? <button type="button" className={cn(BUTTON.secondary, 'mt-5')} onClick={() => setQuery('')}>{t('Clear search')}</button>
            : view === 'bots' && <button type="button" className={cn(BUTTON.primary, 'mt-5')} onClick={onCreate}><IconPlus />{t('XeckBot oluştur')}</button>}
        </div>
      ) : view === 'bots' ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label={t('My bots')}>
          {items.map((bot) => (
            <li key={bot.id} className="group relative flex min-w-0 flex-col rounded-card bg-chip transition-colors hover:bg-hover">
              <button type="button" className="flex flex-1 flex-col rounded-card p-5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" onClick={() => onOpen(bot.id)} aria-label={t('Open chat with {0}', { 0: bot.title })}>
                <div className="flex w-full items-center gap-3 pr-8">
                  <BotAvatar name={bot.title} color={bot.bot!.color} className="size-11 shrink-0 text-brand" />
                  <h2 className="min-w-0 break-words text-lead font-semibold text-ink">{bot.title}</h2>
                </div>
                <p className="mt-4 line-clamp-2 min-h-10 text-ui leading-relaxed text-muted">{bot.bot?.purpose || t('Ready to pick up where you left off.')}</p>
                {Boolean(bot.bot?.badges?.length) && <div className="mt-3 flex flex-wrap gap-1.5">
                  {bot.bot?.badges?.slice(0, 3).map((badge) => <span key={badge} className="max-w-full truncate rounded-full bg-field px-2 py-1 text-micro font-medium text-muted">{badge}</span>)}
                  {(bot.bot?.badges?.length ?? 0) > 3 && <span className="self-center text-micro text-muted">+{bot.bot!.badges!.length - 3}</span>}
                </div>}
                <div className="mt-auto flex w-full items-center justify-between gap-2 pt-5 text-small">
                  <time dateTime={bot.updatedAt} className="text-muted">{t('Updated {0}', { 0: date(bot.updatedAt) })}</time>
                  <span className="flex items-center gap-1.5 font-medium text-ink">{t('Sohbete devam et')}<IconSend className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" /></span>
                </div>
              </button>
              <button type="button" className={cn(ICON_BUTTON, 'absolute top-5 right-4')} disabled={loadingProfileId !== null}
                aria-label={t('Edit {0} profile', { 0: bot.title })} title={t('Profili düzenle')} onClick={() => onEdit(bot)}>
                {loadingProfileId === bot.id ? <IconSpinner /> : <IconEdit />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t('Bot conversations')}>
          {items.map((conversation) => {
            const participants = conversation.botConversation?.participants.map((id) => bots.find((bot) => bot.id === id)).filter((bot): bot is SessionSummary => Boolean(bot)) ?? [];
            return <li key={conversation.id}>
              <button type="button" className="flex min-h-row w-full items-center gap-4 rounded-card bg-chip p-4 text-left transition-colors hover:bg-hover" onClick={() => onOpen(conversation.id)}>
                <span className="flex shrink-0 -space-x-2" aria-hidden="true">{participants.length ? participants.slice(0, 3).map((bot) => <BotAvatar key={bot.id} name={bot.title} color={bot.bot!.color} className="size-9 text-small" />) : <IconChat className="text-muted" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium text-ink">{conversation.title}</span><span className="mt-1 block text-small text-muted">{t('View bot conversation')}</span></span>
                <time dateTime={conversation.updatedAt} className="shrink-0 text-small text-muted max-sm:hidden">{date(conversation.updatedAt)}</time>
                <IconSend className="shrink-0 text-muted" />
              </button>
            </li>;
          })}
        </ul>
      )}
    </div>
  );
}
