import { getSession } from '../api/client.ts';
import { t } from '../i18n/index.ts';
import { useEffect, useState, type FormEvent } from 'react';
import { BOT_COLORS, MAX_XECKBOT_BADGE_LENGTH, MAX_XECKBOT_BADGES, type BotColor } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { BotInstructionEditor } from './BotInstructionEditor.tsx';
import { TextField } from '../ui/TextField.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { IconCheck, IconClose, IconPlus, IconSpinner } from '../ui/icons.tsx';
import { cn } from '../lib/cn.ts';

const COLOR_NAMES: Record<BotColor, string> = { blue: 'Mavi', violet: 'Mor', pink: 'Pembe', gray: 'Gri' };

export function BotProfileDialog({ id }: { id: string }) {
  const { updateBotProfile, setBotProfileId } = useAppState();
  const [editingBot, setEditingBot] = useState({ id, name: '' });
  const [instructionDraft, setInstructionDraft] = useState('');
  const [profileDetails, setProfileDetails] = useState<{ title: string; botColor: BotColor }>({ title: '', botColor: 'blue' });
  const [badgeDraft, setBadgeDraft] = useState<string[]>([]);
  const [newBadge, setNewBadge] = useState('');
  const [improving, setImproving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setProfileError(null);
    void getSession(id).then((session) => {
      if (cancelled) return;
      if (!session.bot || session.botConversation) throw new Error(t('XeckBot not found'));
      setEditingBot({ id, name: session.title });
      setInstructionDraft(session.bot.systemPrompt || session.bot.purpose || '');
      setProfileDetails({ title: session.title, botColor: session.bot.color });
      setBadgeDraft(session.bot.badges ?? []);
    }).catch((cause) => { if (!cancelled) setProfileError(cause instanceof Error ? cause.message : t('Talimat yüklenemedi')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, attempt]);
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); if (savingProfile || improving) return;
    setSavingProfile(true); setProfileError(null);
    try { await updateBotProfile(id, instructionDraft, badgeDraft, { title: profileDetails.title, botColor: profileDetails.botColor }); setBotProfileId(null); }
    catch (cause) { setProfileError(cause instanceof Error ? cause.message : t('Profil kaydedilemedi')); }
    finally { setSavingProfile(false); }
  };
  const addBadge = () => {
    const badge = newBadge.trim().slice(0, MAX_XECKBOT_BADGE_LENGTH);
    if (!badge || badgeDraft.length >= MAX_XECKBOT_BADGES || badgeDraft.some((item) => item.toLocaleLowerCase() === badge.toLocaleLowerCase())) return;
    setBadgeDraft((current) => [...current, badge]); setNewBadge('');
  };
  return <Dialog title={editingBot.name ? t('{0} profilini düzenle', { 0: editingBot.name }) : t('Profili düzenle')} onClose={() => { if (!savingProfile && !improving) setBotProfileId(null); }}>
    {loading ? <p role="status" className="flex items-center gap-2 p-gutter text-ui text-muted"><IconSpinner />{t('Loading')}</p>
      : !editingBot.name ? <div className="flex flex-col gap-3 p-gutter"><p role="alert" className="text-ui text-danger">{profileError}</p><button type="button" className={BUTTON.secondary} onClick={() => setAttempt((value) => value + 1)}>{t('Retry')}</button></div>
      : (
        <form className="bot-profile-form flex flex-col gap-4 px-gutter pb-gutter pt-3" onSubmit={(event) => void saveProfile(event)}>
          <label className="flex flex-col gap-2 text-ui">{t('Name')}<TextField autoFocus width="block" required maxLength={80} disabled={savingProfile} value={profileDetails.title} onChange={(event) => setProfileDetails({ ...profileDetails, title: event.target.value })} /></label>
          <BotInstructionEditor name={profileDetails.title} value={instructionDraft} onChange={setInstructionDraft} disabled={savingProfile} onBusyChange={setImproving} />
          <fieldset disabled={savingProfile}><legend className="mb-2 text-ui">{t('Renk')}</legend><div className="flex flex-wrap gap-1">{BOT_COLORS.map((option) => <button key={option} type="button" aria-pressed={profileDetails.botColor === option} className={cn(BUTTON.ghost, profileDetails.botColor === option && 'bg-chat-active text-ink')} onClick={() => setProfileDetails({ ...profileDetails, botColor: option })}>{t(COLOR_NAMES[option])}</button>)}</div></fieldset>
          <details>
            <summary className="cursor-pointer text-ui text-muted">{t("Advanced profile settings")}</summary>
          <section className="mt-4">
            <h4 className="mb-2 text-ui font-medium text-ink">{t("Rozetler")}</h4>
            <p className="mb-3 text-small text-muted">{t("Rol, yetenek veya uzmanlığını kısa rozetler olarak ekle.")}</p>
            <div className="flex flex-wrap gap-2">
              {badgeDraft.map((badge) => <span key={badge} className="inline-flex items-center gap-1 rounded-full bg-main py-1 pl-2.5 pr-1.5 text-small text-ink">
                {badge}<button type="button" disabled={savingProfile} className="icon-button size-6" aria-label={t("{0} rozetini kaldır", { 0: badge })} onClick={() => setBadgeDraft((current) => current.filter((item) => item !== badge))}><IconClose /></button>
              </span>)}
              {badgeDraft.length === 0 && <span className="text-small text-muted">{t("Henüz rozet yok")}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <TextField width="block" value={newBadge} maxLength={MAX_XECKBOT_BADGE_LENGTH} disabled={savingProfile || badgeDraft.length >= MAX_XECKBOT_BADGES} placeholder={t("Örn. İngilizce, Yazılım, Mentor")}
                onChange={(event) => setNewBadge(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addBadge(); } }} />
              <button type="button" className={BUTTON.secondary} disabled={savingProfile || !newBadge.trim() || badgeDraft.length >= MAX_XECKBOT_BADGES} onClick={addBadge}><IconPlus />{t("Ekle")}</button>
            </div>
            <p className="mt-1 text-right text-micro text-muted">{badgeDraft.length} / {MAX_XECKBOT_BADGES}</p>
          </section>
          </details>
          {profileError && <p role="alert" className="rounded-control bg-field px-3 py-2 text-small text-danger">{t(profileError)}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className={BUTTON.ghost} disabled={savingProfile || improving} onClick={() => setBotProfileId(null)}>{t("İptal")}</button>
            <button type="submit" className={BUTTON.primary} disabled={savingProfile || improving || !instructionDraft.trim() || !profileDetails.title.trim()}>{savingProfile ? <IconSpinner /> : <IconCheck />}{savingProfile ? t("Kaydediliyor") : t("Save")}</button>
          </div>
        </form>
      )}
  </Dialog>;
}
