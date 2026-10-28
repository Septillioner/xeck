import { useState } from 'react';
import type { BotGroup } from '../../../shared/bot-groups.ts';
import { MAX_BOT_GROUP_NAME } from '../../../shared/bot-groups.ts';
import { useAppState } from '../state/AppState.tsx';
import { t, useI18n } from '../i18n/index.ts';
import { cn } from '../lib/cn.ts';
import { BotAvatar } from '../ui/BotAvatar.tsx';
import { IconChat, IconChevron, IconMoreVertical, IconFolderPlus } from '../ui/icons.tsx';
import { BUTTON, ICON_BUTTON } from '../ui/button-styles.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { TextField } from '../ui/TextField.tsx';
import { SessionActions } from './SessionActions.tsx';

export function BotSidebar() {
  const { sessions, active, botsOpen, settingsOpen, openChat, sessionMoods, botGroups, botGroupsError, botGroupsLoading, refreshBotGroups, saveBotGroup, deleteBotGroup } = useAppState();
  const { locale } = useI18n();
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem('xeck.bot-groups.collapsed') ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; }
  });
  const [editing, setEditing] = useState<{ id: string | null; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bots = sessions.filter((session) => session.bot && !session.botConversation && !session.archived && !session.parentId)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.title.localeCompare(b.title, locale));
  const toggle = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id];
    setCollapsed(next); try { localStorage.setItem('xeck.bot-groups.collapsed', JSON.stringify(next)); } catch {}
  };
  const edit = (group?: BotGroup) => { setEditing({ id: group?.id ?? null, name: group?.name ?? '' }); setRemoving(false); setError(null); };
  const rows = (ids: string[]) => <ul className="flex flex-col gap-1">{bots.filter((bot) => ids.includes(bot.id)).map((bot) => {
    const selected = !botsOpen && !settingsOpen && active?.id === bot.id;
    const mood = sessionMoods[bot.id] ?? 'idle';
    return <li key={bot.id} className={cn('chat-row flex items-center gap-1 rounded-control pr-1', selected && 'bg-chat-active')} data-mood={mood}>
      <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control px-3 text-left hover:bg-hover" aria-current={selected ? 'page' : undefined} onClick={() => void openChat(bot.id)}>
        <BotAvatar name={bot.title} color={bot.bot!.color} /><span className="min-w-0 flex-1 truncate text-ui">{bot.title}</span>
        {mood !== 'idle' && <span className="chat-mood-dot size-1.5 shrink-0 rounded-full bg-mood" aria-label={t(mood)} />}
      </button><SessionActions session={bot} />
    </li>;
  })}</ul>;
  const conversations = sessions.filter((session) => session.botConversation && !session.archived);
  const ungrouped = bots.filter((bot) => !botGroups.some((group) => group.botIds.includes(bot.id)));
  return <>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-3"><h2 className="text-small font-medium text-muted">{t('My bots')}</h2><button type="button" className={BUTTON.ghost} title={t('New bot group')} disabled={botGroupsLoading || Boolean(botGroupsError)} onClick={() => edit()}><IconFolderPlus />{t('New bot group')}</button></div>
    {botGroupsLoading && <p role="status" className="px-3 text-small text-muted">{t('Loading')}</p>}
    {botGroupsError && <div role="alert" className="px-3 text-small text-danger">{t(botGroupsError)}<button type="button" className={BUTTON.ghost} onClick={() => void refreshBotGroups()}>{t('Retry')}</button></div>}
    {botGroups.map((group) => {
      const members = bots.filter((bot) => group.botIds.includes(bot.id));
      const expanded = !collapsed.includes(group.id);
      return <section key={group.id} className="mb-3">
        <div className="flex items-center gap-1 pr-1"><button type="button" className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-left text-small text-muted hover:bg-hover" aria-expanded={expanded} onClick={() => toggle(group.id)}><IconChevron className={cn('shrink-0', expanded && 'rotate-90')} /><span className="flex-1 truncate">{group.name}</span><span className="text-micro tabular-nums">{members.length}</span></button><button type="button" className={ICON_BUTTON} aria-label={t('Manage group {0}', { 0: group.name })} disabled={botGroupsLoading} onClick={() => edit(group)}><IconMoreVertical /></button></div>
        {expanded && (members.length ? rows(group.botIds) : <p className="px-3 py-2 text-small text-muted">{t('Move bots here from their action menu.')}</p>)}
      </section>;
    })}
    {ungrouped.length > 0 && <section>{botGroups.length > 0 && <h2 className="px-3 py-2 text-micro font-medium text-muted">{t('Ungrouped bots')}</h2>}{rows(ungrouped.map((bot) => bot.id))}</section>}
    {conversations.length > 0 && <details className="mt-6">
      <summary className="cursor-pointer px-3 py-2 text-small text-muted">{t('Bot conversations')}</summary>
      <ul className="flex flex-col gap-1">{conversations.map((conversation) => <li key={conversation.id}>
        <button type="button" className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 text-left text-ui hover:bg-hover', !botsOpen && !settingsOpen && active?.id === conversation.id && 'bg-chat-active')} aria-current={!botsOpen && !settingsOpen && active?.id === conversation.id ? 'page' : undefined} onClick={() => void openChat(conversation.id)}><IconChat className="shrink-0 text-muted" /><span className="truncate">{conversation.title}</span></button>
      </li>)}</ul>
    </details>}
    {editing && <Dialog title={t(removing ? 'Remove bot group' : editing.id ? 'Edit bot group' : 'New bot group')} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="flex flex-col gap-4 p-gutter" onSubmit={(event) => {
        event.preventDefault(); if (busy || !editing.name.trim()) return; setBusy(true); setError(null);
        void (removing && editing.id ? deleteBotGroup(editing.id) : saveBotGroup(editing.id, editing.name)).then(() => setEditing(null)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Request failed')).finally(() => setBusy(false));
      }}>
        {removing ? <p className="text-ui text-muted">{t('Only the group is removed. Your bots and their histories are kept.')}</p> : <label className="flex flex-col gap-2 text-ui">{t('Group name')}<TextField width="block" value={editing.name} maxLength={MAX_BOT_GROUP_NAME} required disabled={busy} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>}
        {error && <p role="alert" className="text-small text-danger">{t(error)}</p>}
        <div className="flex flex-wrap gap-2">{editing.id && !removing && <button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => setRemoving(true)}>{t('Remove group')}</button>}<span className="flex-1" /><button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => setEditing(null)}>{t('Cancel')}</button><button type="submit" className={removing ? BUTTON.danger : BUTTON.primary} disabled={busy || !editing.name.trim()}>{t(busy ? 'Saving' : removing ? 'Remove group' : 'Save')}</button></div>
      </form>
    </Dialog>}
  </>;
}
