import { useId, useState } from 'react';
import { MAX_BOT_SYSTEM_PROMPT_CHARS } from '../../../shared/types.ts';
import { improveBotPrompt } from '../api/client.ts';
import { t } from '../i18n/index.ts';
import { BUTTON, ICON_BUTTON } from '../ui/button-styles.ts';
import { Textarea } from '../ui/Textarea.tsx';
import { IconSpinner, IconWand } from '../ui/icons.tsx';

export function BotInstructionEditor({ name, value, onChange, disabled, onBusyChange }: {
  name: string; value: string; onChange: (value: string) => void; disabled?: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const instructionId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previous, setPrevious] = useState<string | null>(null);
  async function improve() {
    if (busy || disabled || !name.trim() || !value.trim()) return;
    setBusy(true); onBusyChange(true); setError('');
    try {
      const result = await improveBotPrompt(name, value);
      setPrevious(value); onChange(result.systemPrompt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not improve prompt')); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="flex flex-col gap-2">
    <label htmlFor={instructionId} className="text-ui">{t('Instructions')}</label>
    <div className="relative">
      <Textarea id={instructionId} className="block pb-16" required minRows={6} maxRows={12} maxLength={MAX_BOT_SYSTEM_PROMPT_CHARS} disabled={disabled || busy} value={value} onChange={(event) => onChange(event.target.value)} />
      <div className="absolute bottom-2 right-2">
        <button type="button" className={ICON_BUTTON} title={t(busy ? 'Improving prompt…' : 'Improve prompt')} aria-label={t(busy ? 'Improving prompt…' : 'Improve prompt')} aria-busy={busy} disabled={disabled || busy || !name.trim() || !value.trim()} onClick={() => void improve()}>{busy ? <IconSpinner /> : <IconWand />}</button>
      </div>
    </div>
    <p className="text-small text-muted">{t('These instructions are used directly as the bot’s system prompt.')}</p>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        {previous !== null && <button type="button" className={BUTTON.ghost} disabled={disabled || busy} onClick={() => { onChange(previous); setPrevious(null); }}>{t('Undo')}</button>}
      </div>
      <span className="text-micro text-muted">{value.length} / {MAX_BOT_SYSTEM_PROMPT_CHARS}</span>
    </div>
    {error && <p role="alert" className="text-small text-danger">{t(error)}</p>}
  </div>;
}
