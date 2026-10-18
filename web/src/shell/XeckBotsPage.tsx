import { t } from '../i18n/index.ts';
import { useState, type FormEvent } from 'react';
import { BOT_COLORS, MAX_BOT_PURPOSE_CHARS, type BotColor } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { BotAvatar, BOT_COLOR_CLASSES } from '../ui/BotAvatar.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { TextField } from '../ui/TextField.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { IconCheck, IconPlus, IconSpinner, IconXeck } from '../ui/icons.tsx';
import { cn } from '../lib/cn.ts';

const COLOR_NAMES: Record<BotColor, string> = {
  blue: 'Mavi',
  violet: 'Mor',
  pink: 'Pembe',
  gray: 'Gri',
};

export function XeckBotsPage() {
  const { sessions, createBot, openChat } = useAppState();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [color, setColor] = useState<BotColor>('blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bots = sessions.filter((session) => session.bot && !session.botConversation);
  const conversations = sessions.filter((session) => session.botConversation);
  const startCreate = () => { setName(''); setPurpose(''); setColor('blue'); setError(null); setCreating(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !purpose.trim() || busy) return;
    setBusy(true);
    setError(null);
    try { await createBot({ name: name.trim(), color, purpose: purpose.trim() }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Could not create XeckBot")); }
    finally { setBusy(false); }
  };
  return (
    <section className="panel-shell flex min-w-0 flex-1 flex-col overflow-auto bg-main" aria-labelledby="xeckbot-title">
      <div className="mx-auto w-full max-w-3xl px-gutter py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><h1 id="xeckbot-title" className="flex items-center gap-2 text-heading font-semibold"><IconXeck />{t("XeckBot")}</h1><p className="mt-2 text-body text-muted">{t("Her XeckBot ile kaldığın yerden sohbete devam et.")}</p></div>
          <button type="button" className={BUTTON.primary} onClick={startCreate}><IconPlus />{t("XeckBot oluştur")}</button>
        </header>
        {bots.length === 0 ? <p className="rounded-card bg-chip px-gutter py-8 text-body text-muted">{t("İlk XeckBot’unu oluşturmak için bir isim ve renk seç.")}</p> : (
          <ul className="flex flex-col gap-2">{bots.map((bot) => <li key={bot.id}><button type="button" className="flex w-full items-center gap-3 rounded-card bg-chip px-4 py-4 text-left hover:bg-hover" onClick={() => void openChat(bot.id)}><BotAvatar name={bot.title} color={bot.bot!.color} className="size-11 text-brand" /><span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{bot.title}</span><span className="text-small text-muted">{t("Sohbete devam et")}</span></span></button></li>)}</ul>
        )}
        {conversations.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lead font-semibold">{t('Bot conversations')}</h2>
            <ul className="flex flex-col gap-2">{conversations.map((conversation) => (
              <li key={conversation.id}><button type="button" className="flex w-full flex-col gap-1 rounded-card bg-chip px-4 py-3 text-left hover:bg-hover" onClick={() => void openChat(conversation.id)}>
                <span className="max-w-full truncate text-body font-medium">{conversation.title}</span>
                <span className="text-small text-muted">{t('View bot conversation')}</span>
              </button></li>
            ))}</ul>
          </section>
        )}
      </div>
      {creating && <Dialog title={t("XeckBot oluştur")} onClose={() => { if (!busy) setCreating(false); }}>
        <form className="bot-create-form flex flex-col gap-6 px-gutter pb-gutter pt-3" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          <p className="text-ui leading-relaxed text-muted">{t("İsmini, rengini ve ne yapacağını belirle. XeckBot’un sana özel hazırlansın.")}</p>

          <div className="flex min-w-0 items-center gap-4 rounded-card bg-main p-4" aria-label={t("XeckBot önizlemesi")}>
            <BotAvatar name={name || 'X'} color={color} className="size-16 rounded-card text-heading transition-colors" />
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-lead font-semibold', name.trim() ? 'text-ink' : 'text-muted')}>
                {name.trim() || t("XeckBot’unun ismi")}
              </p>
              <p className="mt-1 text-small text-muted">{t("Kendi sohbeti, kaldığın yerden.")}</p>
            </div>
          </div>

          <label className="flex flex-col gap-2 text-ui font-medium text-ink">
            {t("İsim")}<TextField
              autoFocus
              width="block"
              className="h-11 font-normal"
              maxLength={80}
              required
              value={name}
              disabled={busy}
              placeholder={t("Örn. Atlas")}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2 text-ui font-medium text-ink">
            {t("Bu agent ne yapacak?")}<Textarea
              required
              minRows={3}
              maxRows={6}
              maxLength={MAX_BOT_PURPOSE_CHARS}
              value={purpose}
              disabled={busy}
              className="font-normal"
              placeholder={t("Örn. İngilizce konuşma pratiği yaptırsın, hatalarımı açıklasın ve seviyeme uygun sorular sorsun.")}
              aria-describedby="bot-purpose-help"
              onChange={(event) => setPurpose(event.target.value)}
            />
            <span id="bot-purpose-help" className="text-small font-normal leading-relaxed text-muted">{t("Görevini ve nasıl davranmasını istediğini yaz. Sistem talimatı bu açıklamaya göre hazırlanır.")}</span>
          </label>

          <fieldset disabled={busy} className="min-w-0">
            <legend className="mb-3 text-ui font-medium text-ink">{t("Renk")}</legend>
            <div className="grid grid-cols-4 gap-2">
              {BOT_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={color === option}
                  className={cn(
                    'flex min-w-0 flex-col items-center gap-2 rounded-control px-2 py-3 text-small transition-colors disabled:cursor-default disabled:opacity-50',
                    color === option ? 'bg-chat-active font-medium text-ink' : 'text-muted hover:bg-hover hover:text-ink',
                  )}
                  onClick={() => setColor(option)}
                >
                  <span aria-hidden="true" className={cn('flex size-9 items-center justify-center rounded-full', BOT_COLOR_CLASSES[option])}>
                    <IconCheck className={cn('transition-opacity', color !== option && 'opacity-0')} />
                  </span>
                  {t(COLOR_NAMES[option])}
                </button>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="rounded-control bg-field px-3 py-2 text-small text-danger">{t(error)}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => setCreating(false)}>{t("İptal")}</button>
            <button type="submit" className={BUTTON.primary} disabled={busy || !name.trim() || !purpose.trim()}>
              {busy ? <IconSpinner /> : <IconPlus />}
              {busy ? t("Kimlik hazırlanıyor…") : t("XeckBot oluştur")}
            </button>
          </div>
        </form>
      </Dialog>}
    </section>
  );
}
