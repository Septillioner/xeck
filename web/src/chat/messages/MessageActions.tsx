import { useEffect, useId, useRef, useState } from 'react';
import type { TranscriptMessage } from '../../../../shared/types.ts';
import { messageBlocks } from '../../../../shared/transcript.ts';
import { t } from '../../i18n/index.ts';
import { useAppState } from '../../state/AppState.tsx';
import { BUTTON, ICON_BUTTON } from '../../ui/button-styles.ts';
import { IconCheck, IconCopy, IconEdit, IconMoreVertical } from '../../ui/icons.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { Textarea } from '../../ui/Textarea.tsx';

export function MessageActions({ message }: { message: TranscriptMessage }) {
  const { active, streaming, queuedMessages, send } = useAppState();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(message.content);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    actionsRef.current?.querySelector<HTMLButtonElement>('[data-message-action]')?.focus();
    const outside = (event: MouseEvent) => { if (!actionsRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); triggerRef.current?.focus(); }
      if (event.key === 'Tab') setMenuOpen(false);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...actionsRef.current!.querySelectorAll<HTMLButtonElement>('[data-message-action]:not(:disabled)')];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('keydown', key, true); };
  }, [menuOpen]);
  const text = message.role === 'assistant' ? messageBlocks(message).filter((block) => block.kind === 'text').map((block) => block.text).join('\n\n') || message.content : message.content;
  const canEdit = message.role === 'user' && !message.source && !active?.botConversation && active?.origin?.by !== 'agent' && active?.messages.some((item) => item.id === message.id);
  if (!text) return null;
  return <>
    <div ref={actionsRef} className="message-actions mt-1 flex min-h-7 flex-wrap items-center gap-1 text-small text-muted" data-open={menuOpen} data-user={message.role === 'user'} data-feedback={Boolean(error || copied)}>
      <button ref={triggerRef} type="button" className={ICON_BUTTON + ' message-actions-trigger'} aria-label={t('Message actions')} title={t('Message actions')} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => setMenuOpen((open) => !open)}>{copied ? <IconCheck /> : <IconMoreVertical />}</button>
      <div id={menuId} className="message-action-buttons" role={menuOpen ? 'menu' : undefined}>
      <button data-message-action type="button" role={menuOpen ? 'menuitem' : undefined} className={ICON_BUTTON} aria-label={t(copied ? 'Copied' : 'Copy message')} title={t(copied ? 'Copied' : 'Copy message')} onClick={() => {
        if (!navigator.clipboard) { setError(t('Could not copy message')); return; }
        void navigator.clipboard.writeText(text).then(() => { setCopied(true); setError(null); }).catch(() => setError(t('Could not copy message')));
        if (menuOpen) { setMenuOpen(false); triggerRef.current?.focus(); }
      }} onBlur={() => setCopied(false)}>{copied ? <IconCheck /> : <IconCopy />}</button>
      {canEdit && <button data-message-action type="button" role={menuOpen ? 'menuitem' : undefined} className={ICON_BUTTON} aria-label={t('Edit and resend')} title={t(streaming || queuedMessages.length ? 'Wait for the current reply to finish' : 'Edit and resend')} disabled={Boolean(streaming) || queuedMessages.length > 0} onClick={() => { if (menuOpen) { setMenuOpen(false); triggerRef.current?.focus(); } setContent(message.content); setError(null); setEditing(true); }}><IconEdit /></button>}
      </div>
      {error && <span role="alert">{error}</span>}
    </div>
    {editing && <Dialog title={t('Edit and resend')} onClose={() => { if (!submitting) setEditing(false); }}>
      <form className="flex flex-col gap-4 p-gutter" onSubmit={(event) => { event.preventDefault(); if (!content.trim() || submitting || streaming || queuedMessages.length > 0) return; setSubmitting(true); setError(null); void send(content.trim(), { preserveDraft: true, onAccepted: () => { setSubmitting(false); setEditing(false); }, onError: (message) => { setError(message); setSubmitting(false); } }).finally(() => setSubmitting(false)); }}>
        <p className="text-ui text-muted">{t('Sent as a new message. Earlier replies stay in history.')}</p>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <Textarea disabled={submitting} aria-label={t('Message')} minRows={3} maxRows={10} value={content} onChange={(event) => setContent(event.target.value)} />
        <div className="flex justify-end gap-2"><button type="button" className={BUTTON.ghost} disabled={submitting} onClick={() => setEditing(false)}>{t('Cancel')}</button><button type="submit" className={BUTTON.primary} disabled={submitting || !content.trim() || Boolean(streaming) || queuedMessages.length > 0}>{t(submitting ? 'Sending' : 'Send')}</button></div>
      </form>
    </Dialog>}
  </>;
}
