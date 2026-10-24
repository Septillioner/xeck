import { useEffect, useState, type FormEvent } from 'react';
import { BOT_COLORS, MAX_BOT_PURPOSE_CHARS, type BotColor } from '../../../shared/types.ts';
import { t } from '../i18n/index.ts';
import { useAppState } from '../state/AppState.tsx';
import { BOT_COLOR_CLASSES } from '../ui/BotAvatar.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { TextField } from '../ui/TextField.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { IconCheck, IconSpinner } from '../ui/icons.tsx';
import { cn } from '../lib/cn.ts';

const COLOR_NAMES: Record<BotColor, string> = { blue: 'Mavi', violet: 'Mor', pink: 'Pembe', gray: 'Gri' };

export function BotCreateDialog() {
  const { createBot, setBotCreateOpen } = useAppState();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [color, setColor] = useState<BotColor>('blue');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim() || !purpose.trim()) return;
    setBusy(true); setError(null); setElapsed(0);
    try { await createBot({ name: name.trim(), purpose: purpose.trim(), color }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not create XeckBot')); }
    finally { setBusy(false); }
  };
  return <Dialog title={t(busy ? 'XeckBot hazırlanıyor' : 'XeckBot oluştur')} showCloseButton={!busy} onClose={() => { if (!busy) setBotCreateOpen(false); }}>
    {busy ? <div className="flex flex-col gap-3 p-gutter" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-body"><IconSpinner />{t('Preparing your XeckBot…')}</p>
      <p className="text-ui text-muted">{t('Biraz zaman alabilir; hazır olunca sohbetin açılacak.')}</p>
      <p aria-hidden="true" className="text-small tabular-nums text-muted">{t('{0} seconds elapsed', { 0: elapsed })}</p>
    </div> : <form className="flex flex-col gap-5 p-gutter" onSubmit={(event) => void submit(event)}>
      <label className="flex flex-col gap-2 text-ui">{t('Name')}<TextField width="block" required maxLength={80} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Örn. Atlas')} /></label>
      <label className="flex flex-col gap-2 text-ui">{t('Purpose')}<Textarea required minRows={3} maxRows={6} maxLength={MAX_BOT_PURPOSE_CHARS} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder={t('Örn. İngilizce konuşma pratiği yaptırsın, hatalarımı açıklasın ve seviyeme uygun sorular sorsun.')} /></label>
      <fieldset><legend className="mb-2 text-ui">{t('Renk')}</legend><div className="flex flex-wrap gap-1">
        {BOT_COLORS.map((option) => <button key={option} type="button" className={cn(BUTTON.ghost, color === option && 'bg-chat-active text-ink')} aria-pressed={color === option} onClick={() => setColor(option)}>
          <span aria-hidden="true" className={cn('flex size-5 items-center justify-center rounded-full', BOT_COLOR_CLASSES[option])}>{color === option && <IconCheck />}</span>{t(COLOR_NAMES[option])}
        </button>)}
      </div></fieldset>
      {error && <p role="alert" className="text-ui text-danger">{t(error)}</p>}
      <div className="flex justify-end gap-2"><button type="button" className={BUTTON.ghost} onClick={() => setBotCreateOpen(false)}>{t('Cancel')}</button><button type="submit" className={BUTTON.primary} disabled={!name.trim() || !purpose.trim()}>{t('Create')}</button></div>
    </form>}
  </Dialog>;
}
