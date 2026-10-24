import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionSummary } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { t } from '../i18n/index.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { TextField } from '../ui/TextField.tsx';
import { BUTTON, ICON_BUTTON } from '../ui/button-styles.ts';
import { IconMoreVertical } from '../ui/icons.tsx';

/** Shared actions for the sidebar, project list, bot library and chat header. */
export function SessionActions({ session, extraActions = [] }: { extraActions?: { label: string; onClick: () => void; pressed: boolean }[]; session: Pick<SessionSummary, 'id' | 'title' | 'bot' | 'botConversation' | 'parentId' | 'projectId' | 'pinned' | 'archived'> }) {
  const { projects, streamingIds, renameChat, deleteChat, assignChatToProject, updateChatOrganization, botGroups, botGroupsLoading, botGroupsError, assignBotGroup, setBotProfileId } = useAppState();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'move' | 'group' | 'delete' | null>(null);
  const [title, setTitle] = useState(session.title);
  const [project, setProject] = useState(session.projectId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const readOnly = Boolean(session.botConversation || session.parentId);

  useEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = menuRef.current?.offsetHeight ?? 220;
      setPosition({ left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)), top: Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 4 : rect.top - height - 4) });
    };
    positionMenu();
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menuRef.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      if (event.key === 'Tab') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('keydown', key, true); window.removeEventListener('resize', positionMenu); window.removeEventListener('scroll', positionMenu, true); };
  }, [open]);

  if (readOnly && extraActions.length === 0) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); setOpen(false); setDialog(null); triggerRef.current?.focus(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Request failed')); }
    finally { setBusy(false); }
  };
  const showDialog = (kind: typeof dialog) => {
    triggerRef.current?.focus(); setOpen(false); setError(null); setTitle(session.title); setProject(kind === 'group' ? botGroups.find((group) => group.botIds.includes(session.id))?.id ?? '' : session.projectId ?? ''); setDialog(kind);
  };
  const row = 'flex min-h-row w-full items-center rounded-tile px-3 text-left text-ui hover:bg-hover disabled:opacity-50';
  return <>
    <span data-xeck-menu data-open={open ? 'true' : 'false'}><button ref={triggerRef} type="button" className={ICON_BUTTON} aria-label={t('Actions for {0}', { 0: session.title })} aria-haspopup="menu" aria-expanded={open} onClick={() => { setError(null); setOpen((value) => !value); }}><IconMoreVertical /></button></span>
    {open && createPortal(<div ref={menuRef} data-dialog-popover role="menu" aria-label={t('Chat actions')} className="fixed z-40 w-52 overflow-auto rounded-control bg-chip p-1" style={{ ...position, maxHeight: 'calc(100dvh - 16px)' }}>
      {!readOnly && <>
      {session.bot && <button type="button" role="menuitem" className={row} onClick={() => { setOpen(false); triggerRef.current?.focus(); setBotProfileId(session.id); }}>{t('Profili düzenle')}</button>}
      <button type="button" role="menuitem" className={row} disabled={busy} onClick={() => void run(() => updateChatOrganization(session.id, { pinned: !session.pinned }))}>{t(session.pinned ? 'Unpin' : 'Pin')}</button>
      {!session.bot && <button type="button" role="menuitem" className={row} disabled={busy} onClick={() => showDialog('rename')}>{t('Rename')}</button>}
      {session.bot && <button type="button" role="menuitem" className={row} disabled={busy || botGroupsLoading || Boolean(botGroupsError)} onClick={() => showDialog('group')}>{t('Move bot to group')}</button>}
      {!session.bot && <button type="button" role="menuitem" className={row} disabled={busy} onClick={() => showDialog('move')}>{t('Move chat to project')}</button>}
      <button type="button" role="menuitem" className={row} disabled={busy || streamingIds.includes(session.id)} onClick={() => void run(() => updateChatOrganization(session.id, { archived: !session.archived }))}>{t(session.archived ? 'Restore from archive' : 'Archive')}</button>
      <button type="button" role="menuitem" className={`${row} text-danger`} disabled={busy} onClick={() => showDialog('delete')}>{t('Delete')}</button>
      </>}
      {extraActions.map((action) => <button key={action.label} type="button" role="menuitemcheckbox" aria-checked={action.pressed} className={row} onClick={() => { setOpen(false); action.onClick(); triggerRef.current?.focus(); }}>{action.label}</button>)}
      {error && <p className="px-3 py-2 text-small text-danger" role="alert">{error}</p>}
    </div>, document.body)}
    {dialog && <Dialog title={t(dialog === 'rename' ? 'Rename' : dialog === 'move' ? 'Move chat to project' : dialog === 'group' ? 'Move bot to group' : 'Delete chat')} onClose={() => { if (!busy) setDialog(null); }}>
      <form className="flex flex-col gap-4 p-gutter" onSubmit={(event) => {
        event.preventDefault();
        void run(() => dialog === 'rename' ? renameChat(session.id, title.trim()) : dialog === 'move' ? assignChatToProject(session.id, project || null) : dialog === 'group' ? assignBotGroup(session.id, project || null) : deleteChat(session.id));
      }}>
        {dialog === 'rename' ? <label className="flex flex-col gap-2 text-ui">{t('Name')}<TextField width="block" value={title} maxLength={120} required disabled={busy} onChange={(event) => setTitle(event.target.value)} /></label>
          : dialog === 'move' ? <label className="flex flex-col gap-2 text-ui">{t('Project')}<select className="field field-block" value={project} disabled={busy} onChange={(event) => setProject(event.target.value)}><option value="">{t('No project')}</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          : dialog === 'group' ? <label className="flex flex-col gap-2 text-ui">{t('Bot groups')}<select className="field field-block" value={project} disabled={busy} onChange={(event) => setProject(event.target.value)}><option value="">{t('Ungrouped bots')}</option>{botGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{botGroups.length === 0 && <span className="text-small text-muted">{t('Create a group in the sidebar first.')}</span>}</label>
          : <p className="text-ui text-muted">{t('Delete this chat permanently? You can archive it instead to keep its history.')}</p>}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => setDialog(null)}>{t('Cancel')}</button><button type="submit" className={dialog === 'delete' ? BUTTON.danger : BUTTON.primary} disabled={busy || (dialog === 'rename' && !title.trim())}>{busy ? t('Saving') : t(dialog === 'delete' ? 'Delete' : 'Save')}</button></div>
      </form>
    </Dialog>}
  </>;
}
