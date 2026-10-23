import { t } from '../i18n/index.ts';
import { useEffect, useState, type FormEvent } from 'react';
import { BOT_COLORS, MAX_BOT_PURPOSE_CHARS, MAX_BOT_SYSTEM_PROMPT_CHARS, MAX_XECKBOT_BADGE_LENGTH, MAX_XECKBOT_BADGES, type BotColor } from '../../../shared/types.ts';
import { getSession } from '../api/client.ts';
import { useAppState } from '../state/AppState.tsx';
import { BotAvatar, BOT_COLOR_CLASSES } from '../ui/BotAvatar.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { TextField } from '../ui/TextField.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { IconCheck, IconClose, IconPlus, IconSpinner, IconWand } from '../ui/icons.tsx';
import { cn } from '../lib/cn.ts';
import { XeckBotLibrary } from './XeckBotLibrary.tsx';

const COLOR_NAMES: Record<BotColor, string> = {
  blue: 'Mavi',
  violet: 'Mor',
  pink: 'Pembe',
  gray: 'Gri',
};

export function XeckBotsPage() {
  const { sessions, createBot, openChat, updateBotProfile } = useAppState();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [color, setColor] = useState<BotColor>('blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingBot, setEditingBot] = useState<{ id: string; name: string } | null>(null);
  const [instructionDraft, setInstructionDraft] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null);
  const [badgeDraft, setBadgeDraft] = useState<string[]>([]);
  const [newBadge, setNewBadge] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const bots = sessions.filter((session) => session.bot && !session.botConversation);
  const conversations = sessions.filter((session) => session.botConversation);
  const startCreate = () => { setName(''); setPurpose(''); setColor('blue'); setError(null); setProgressStage(0); setCreating(true); };
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setProgressStage((stage) => (stage + 1) % 3), 2600);
    return () => window.clearInterval(timer);
  }, [busy]);
  const openProfileEditor = async (bot: { id: string; title: string }) => {
    if (loadingProfileId) return;
    setLoadingProfileId(bot.id);
    setPageError(null);
    setProfileError(null);
    try {
      const session = await getSession(bot.id);
      setInstructionDraft(session.bot?.systemPrompt ?? '');
      setBadgeDraft(session.bot?.badges ?? []);
      setNewBadge('');
      setEditingBot({ id: bot.id, name: bot.title });
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : t("Talimat yüklenemedi"));
    } finally {
      setLoadingProfileId(null);
    }
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingBot || savingProfile) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      await updateBotProfile(editingBot.id, instructionDraft, badgeDraft);
      setEditingBot(null);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : t("Profil kaydedilemedi"));
    } finally {
      setSavingProfile(false);
    }
  };
  const addBadge = () => {
    const badge = newBadge.trim().slice(0, MAX_XECKBOT_BADGE_LENGTH);
    if (!badge || badgeDraft.length >= MAX_XECKBOT_BADGES || badgeDraft.some((item) => item.toLocaleLowerCase() === badge.toLocaleLowerCase())) return;
    setBadgeDraft((current) => [...current, badge]);
    setNewBadge('');
  };
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
      <XeckBotLibrary
        bots={bots}
        conversations={conversations}
        error={pageError}
        loadingProfileId={loadingProfileId}
        onCreate={startCreate}
        onOpen={(id) => void openChat(id)}
        onEdit={(bot) => void openProfileEditor(bot)}
      />
      {editingBot && <Dialog title={t("{0} profilini düzenle", { 0: editingBot.name })} onClose={() => { if (!savingProfile) setEditingBot(null); }}>
        <form className="bot-profile-form flex flex-col gap-4 px-gutter pb-gutter pt-3" onSubmit={(event) => void saveProfile(event)}>
          <section>
            <h4 className="mb-2 text-ui font-medium text-ink">{t("Rozetler")}</h4>
            <p className="mb-3 text-small text-muted">{t("Rol, yetenek veya uzmanlığını kısa rozetler olarak ekle.")}</p>
            <div className="flex flex-wrap gap-2">
              {badgeDraft.map((badge) => <span key={badge} className="inline-flex items-center gap-1 rounded-full bg-main py-1 pl-2.5 pr-1.5 text-small text-ink">
                {badge}<button type="button" className="icon-button size-6" aria-label={t("{0} rozetini kaldır", { 0: badge })} onClick={() => setBadgeDraft((current) => current.filter((item) => item !== badge))}><IconClose /></button>
              </span>)}
              {badgeDraft.length === 0 && <span className="text-small text-muted">{t("Henüz rozet yok")}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <TextField autoFocus width="block" value={newBadge} maxLength={MAX_XECKBOT_BADGE_LENGTH} disabled={savingProfile || badgeDraft.length >= MAX_XECKBOT_BADGES} placeholder={t("Örn. İngilizce, Yazılım, Mentor")}
                onChange={(event) => setNewBadge(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addBadge(); } }} />
              <button type="button" className={BUTTON.secondary} disabled={savingProfile || !newBadge.trim() || badgeDraft.length >= MAX_XECKBOT_BADGES} onClick={addBadge}><IconPlus />{t("Ekle")}</button>
            </div>
            <p className="mt-1 text-right text-micro text-muted">{badgeDraft.length} / {MAX_XECKBOT_BADGES}</p>
          </section>
          <details className="rounded-control bg-main px-3 py-2">
            <summary className="cursor-pointer text-ui font-medium text-ink">{t("System prompt")}</summary>
            <p className="my-2 text-small text-muted">{t("Bu XeckBot'un sistem talimatları. Değişiklikler sonraki yanıtlarında kullanılır.")}</p>
            <Textarea required minRows={8} maxRows={18} maxLength={MAX_BOT_SYSTEM_PROMPT_CHARS} value={instructionDraft} disabled={savingProfile} className="font-normal" onChange={(event) => setInstructionDraft(event.target.value)} />
            <p className="mt-1 text-right text-micro text-muted">{instructionDraft.length.toLocaleString()} / {MAX_BOT_SYSTEM_PROMPT_CHARS.toLocaleString()}</p>
          </details>
          {profileError && <p role="alert" className="rounded-control bg-field px-3 py-2 text-small text-danger">{t(profileError)}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className={BUTTON.ghost} disabled={savingProfile} onClick={() => setEditingBot(null)}>{t("İptal")}</button>
            <button type="submit" className={BUTTON.primary} disabled={savingProfile || !instructionDraft.trim()}>{savingProfile ? <IconSpinner /> : <IconCheck />}{savingProfile ? t("Kaydediliyor") : t("Save")}</button>
          </div>
        </form>
      </Dialog>}
      {creating && !busy && <Dialog title={t("XeckBot oluştur")} onClose={() => setCreating(false)}>
        <form className="bot-create-form flex flex-col gap-6 px-gutter pb-gutter pt-3" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          <p className="text-ui leading-relaxed text-muted">{t("İsmini, rengini ve ne yapacağını belirle. XeckBot’un sana özel hazırlansın.")}</p>

          <div className="flex min-w-0 items-center gap-4 rounded-card bg-main p-4" aria-label={t("XeckBot önizlemesi")}>
            <BotAvatar name={name || 'X'} color={color} className="size-16 rounded-card text-heading transition-colors" />
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-lead font-semibold', name.trim() ? 'text-ink' : 'text-muted')}>
                {name.trim() || t("XeckBot’unun ismi")}
              </p>
              <p className="mt-1 line-clamp-2 text-small leading-relaxed text-muted">{purpose.trim() || t("Kendi sohbeti, kaldığın yerden.")}</p>
            </div>
          </div>

          <label className="flex flex-col gap-2 text-ui font-medium text-ink">
            {t("İsim")}<TextField
              autoFocus
              width="block"
              className="font-normal"
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
            <button type="button" className={BUTTON.ghost} onClick={() => setCreating(false)}>{t("İptal")}</button>
            <button type="submit" className={BUTTON.primary} disabled={!name.trim() || !purpose.trim()}><IconPlus />{t("XeckBot oluştur")}</button>
          </div>
        </form>
      </Dialog>}
      {busy && <Dialog title={t("XeckBot hazırlanıyor")} showCloseButton={false} onClose={() => undefined}>
        <div className="bot-create-loading px-7 pb-7 pt-5" role="status" aria-live="polite">
          <div className="bot-create-loading-art mx-auto mb-5 flex size-24 items-center justify-center rounded-full bg-main">
            <BotAvatar name={name || 'X'} color={color} className="bot-create-progress-mark size-16 rounded-card text-heading" />
            <span className="bot-create-loading-spark rounded-full bg-chip p-2 text-brand"><IconWand /></span>
          </div>
          <p key={progressStage} className="bot-create-progress-caption text-center text-body font-semibold text-ink">{t(["Talimatları amacına göre yazıyor…", "Yanıt tarzını belirliyor…", "Kimliğini tamamlıyor…"][progressStage])}</p>
          <p className="mt-2 text-center text-small leading-relaxed text-muted">{t("Biraz zaman alabilir; hazır olunca sohbetin açılacak.")}</p>
          <div className="bot-create-progress-track mt-6" aria-hidden="true"><span /></div>
          <div className="mt-3 flex items-center justify-between gap-2" aria-hidden="true">
            {[0, 1, 2].map((step) => <span key={step} className="bot-create-progress-step" data-active={progressStage === step || undefined} />)}
          </div>
        </div>
      </Dialog>}
    </section>
  );
}
