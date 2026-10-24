import { t } from '../i18n/index.ts';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { COMMAND_NAME_PATTERN, SUMMARY_COMMAND } from '../../../shared/commands.ts';
import { isSessionPolicyId, type PolicyChoice, type SkillRecord } from '../../../shared/types.ts';
import { listSkills } from '../api/client.ts';
import { useAppState } from '../state/AppState.tsx';
import { IconSend, IconSliders, IconStop } from '../ui/icons.tsx';
import { BUTTON, ICON_BUTTON } from '../ui/button-styles.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { Menu } from '../ui/Menu.tsx';
import { resolveDraftPolicyId } from './policy-cycle.ts';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, MAX_MESSAGE_IMAGES, readImageAttachments, type ImageAttachment } from '../../../shared/images.ts';
import { PhotoAttachments } from './PhotoAttachments.tsx';
import { IconAddPhoto } from '../ui/icons.tsx';

const SUMMARY_DETAIL = 'Summarize this conversation.';
/* The composer grows with its text up to this many lines, then scrolls. */
const COMPOSER_MAX_ROWS = 8;

function policyAccentStyle(accentColor: PolicyChoice['accentColor'] | undefined): CSSProperties | undefined {
  if (!accentColor) return undefined;
  return { '--policy-accent-color': accentColor } as CSSProperties;
}

function policyDot(accentColor: PolicyChoice['accentColor']) {
  return <i className="mode-dot" style={policyAccentStyle(accentColor)} aria-hidden="true" />;
}

/**
 * Policy combobox next to the composer. Options come from the agent's workspace
 * policies; labels come from the policy definitions behind `/api/agents`.
 */
function ModeSwitch() {
  const {
    active,
    agents,
    draftAgentId,
    draftPolicyId,
    policyId,
    policyBusy,
    setDraftPolicyId,
    setPolicyId,
    streaming,
  } = useAppState();
  const agentId = active?.agentId || draftAgentId;
  const agentDef = agents.find((agent) => agent.id === agentId);
  if (!agentDef || agentDef.policies.length < 2) return null;

  const busyIcon = policyBusy ? <span className="control-spinner" aria-hidden="true" /> : null;
  if (!active) {
    const options = agentDef.policies.map((policy) => ({
      value: policy.id,
      label: policy.label,
      icon: policyDot(policy.accentColor),
    }));
    const selectedPolicy = resolveDraftPolicyId(agentDef, draftPolicyId);
    const selectedPolicyAccentColor = agentDef.policies.find(
      (policy) => policy.id === selectedPolicy,
    )?.accentColor;
    return (
      <div className="mode-combobox" style={policyAccentStyle(selectedPolicyAccentColor)}>
        <Menu
          label={t("Policy")}
          value={selectedPolicy}
          buttonClass="mode-trigger"
          placement="top"
          disabled={Boolean(streaming)}
          options={options}
          onChange={(next) => {
            if (isSessionPolicyId(next)) setDraftPolicyId(next);
          }}
        />
      </div>
    );
  }

  const selectedPolicyAccentColor = agentDef.policies.find(
    (policy) => policy.id === policyId,
  )?.accentColor;
  return (
    <div className="mode-combobox" style={policyAccentStyle(selectedPolicyAccentColor)}>
      <Menu
        label={t("Policy")}
        value={policyId}
        buttonClass="mode-trigger"
        placement="top"
        disabled={policyBusy || Boolean(streaming)}
        options={agentDef.policies.map((policy) => ({
          value: policy.id,
          label: policy.label,
          icon: busyIcon ?? policyDot(policy.accentColor),
        }))}
        onChange={(next) => {
          if (isSessionPolicyId(next)) void setPolicyId(next);
        }}
      />
    </div>
  );
}
export function Composer({ modelMenu }: { modelMenu: ReactNode }) {
  const { draft, setDraft, draftImages, setDraftImages, draftProjectId, send, stop, streaming, settings, queuedMessages, enqueueMessage, removeQueuedMessage, active, agents } = useAppState();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoGeneration = useRef(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [draggingPhotos, setDraggingPhotos] = useState(false);
  useEffect(() => {
    photoGeneration.current += 1;
    setPhotoError(null); setReadingPhotos(false); setDraggingPhotos(false);
    return () => { photoGeneration.current += 1; };
  }, [active?.id, draftProjectId]);
  const attachPhotos = async (files: File[]) => {
    if (!files.length || readingPhotos) return;
    const generation = photoGeneration.current;
    setPhotoError(null); setReadingPhotos(true);
    try {
      if (draftImages.length + files.length > MAX_MESSAGE_IMAGES) throw new Error('Attach up to 4 photos.');
      const images = await Promise.all(files.map(async (file): Promise<ImageAttachment> => {
        if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) throw new Error('Use a valid PNG, JPEG or WebP photo.');
        if (file.size > MAX_IMAGE_BYTES) throw new Error('Each photo must be 5 MB or smaller.');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read the photo.'));
          reader.readAsDataURL(file);
        });
        return { id: crypto.randomUUID(), name: file.name.slice(0, 200) || 'Photo', mimeType: file.type as ImageAttachment['mimeType'], data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
      }));
      const next = readImageAttachments([...draftImages, ...images]);
      if (generation === photoGeneration.current) setDraftImages(next);
    } catch (error) {
      if (generation === photoGeneration.current) setPhotoError(error instanceof Error ? error.message : 'Could not read the photo.');
    } finally {
      if (generation === photoGeneration.current) setReadingPhotos(false);
    }
  };
  const [optionsOpen, setOptionsOpen] = useState(false);
  const canChooseAssistant = !active && agents.filter((agent) => !agent.botOnly).length > 1;
  useEffect(() => { setOptionsOpen(false); }, [active?.id]);
  const [skills, setSkills] = useState<SkillRecord[] | null>(null);
  const [closedPrefix, setClosedPrefix] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const generating = Boolean(streaming);
  const prefix = commandPrefix(draft);
  const rows = useMemo(() => commandRows(prefix, skills ?? []), [prefix, skills]);
  const menuOpen = prefix !== null && prefix !== closedPrefix && rows.length > 0;
  const activeIndex = Math.min(highlight, Math.max(rows.length - 1, 0));
  const submitMessage = (content = draft) => {
    const trimmed = content.trim();
    if ((!trimmed && !draftImages.length) || readingPhotos) return;

    if (generating || queuedMessages.length > 0) {
      enqueueMessage(trimmed, draftImages);
      setDraft('');
      setDraftImages([]);
      return;
    }
    void send(trimmed, { images: draftImages });
  };

  useEffect(() => {
    setHighlight(0);
  }, [prefix]);

  useEffect(() => {
    if (prefix === null || skills) return;
    let cancelled = false;
    void listSkills()
      .then((next) => {
        if (!cancelled) setSkills(next);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [prefix, skills]);

  const pick = (name: string) => {
    setDraft(`/${name} `);
    setClosedPrefix(null);
    inputRef.current?.focus();
  };

  return (
    <form
      className="composer-form"
      data-dragging-photos={draggingPhotos || undefined}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingPhotos(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingPhotos(false); }}
      onDrop={(event) => { event.preventDefault(); setDraggingPhotos(false); void attachPhotos(Array.from(event.dataTransfer.files)); }}
      onSubmit={(event) => {
        event.preventDefault();
          submitMessage();
      }}
    >
      {menuOpen && (
        <div className="command-menu" role="listbox" aria-label={t("Commands")}>
          {rows.map((row, index) => (
            <button
              key={row.name}
              type="button"
              role="option"
              className="command-row"
              aria-selected={index === activeIndex}
              data-active={index === activeIndex ? 'true' : 'false'}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => {
                if (row.name === SUMMARY_COMMAND) submitMessage(`/${SUMMARY_COMMAND}`);
                else pick(row.name);
              }}
            >
              <span>/{row.name}</span>
              <span>{t(row.detail)}</span>
            </button>
          ))}
        </div>
      )}
        {queuedMessages.length > 0 && (
          <details className="mb-3 min-w-0 px-1" aria-label={t("Queued messages")}>
            <summary className="flex cursor-pointer items-center justify-between gap-2 text-small">
              <span className="font-medium text-ink">{t("Queued messages")}</span>
              <span className="text-small tabular-nums text-muted">
                {queuedMessages.length}
              </span>
            </summary>
            <ol className="mt-3 flex max-h-40 flex-col gap-1.5 overflow-y-auto p-0" aria-label={t("Queued messages")}>
              {queuedMessages.map((message) => (
                <li
                  className="flex min-w-0 items-start gap-2 rounded-control bg-field px-3 py-2"
                  key={message.id}
                >
                  <div className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere text-xs leading-relaxed text-ink">
                    {message.content || t('Photo')}
                    {message.images?.length ? <PhotoAttachments images={message.images} /> : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-tile px-2 py-1 text-xs text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    aria-label={t("Remove queued message: {0}", { "0": message.content })}
                    onClick={() => removeQueuedMessage(message.id)}
                  >
                    {t("Remove")}</button>
                </li>
              ))}
            </ol>
          </details>
        )}
        <div className="composer">
          <input ref={photoInputRef} type="file" accept={IMAGE_MIME_TYPES.join(',')} multiple hidden onChange={(event) => { void attachPhotos(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
          <PhotoAttachments images={draftImages} onRemove={readingPhotos ? undefined : (id) => { setDraftImages(draftImages.filter((image) => image.id !== id)); setPhotoError(null); }} />
          {photoError && <p className="photo-feedback text-danger" role="alert">{t(photoError)}</p>}
          {readingPhotos && <p className="photo-feedback" role="status">{t('Reading photos…')}</p>}
          {draftImages.length > 0 && !photoError && !readingPhotos && <p className="photo-feedback">{t('Use a model that supports photos.')}</p>}
          <TextareaAutosize
            ref={inputRef}
            minRows={1}
            maxRows={COMPOSER_MAX_ROWS}
            value={draft}
            placeholder={t("Ask me anything...")}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void attachPhotos(Array.from(event.clipboardData.files)); } }}
            onKeyDown={(event) => {
              // Enter that confirms an IME candidate must not send or pick a row.
              if (event.nativeEvent.isComposing) return;
              if (menuOpen && event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlight((current) => (current + 1) % rows.length);
                return;
              }
              if (menuOpen && event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlight((current) => (current - 1 + rows.length) % rows.length);
                return;
              }
              if (menuOpen && event.key === 'Escape') {
                event.preventDefault();
                setClosedPrefix(prefix);
                return;
              }
              if (menuOpen && !event.shiftKey && (event.key === 'Tab' || event.key === 'Enter')) {
                event.preventDefault();
                const row = rows[activeIndex];
                if (!row) return;
                        if (prefix !== null && row.name.toLowerCase() === prefix.toLowerCase()) submitMessage();
                else pick(row.name);
                return;
              }
              if (!settings.enterToSend) return;
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
            submitMessage();
              }
            }}
          />
          <div className="composer-foot">
            <button type="button" className={ICON_BUTTON} disabled={readingPhotos} aria-label={t('Add photos')} title={t('Add photos')} onClick={() => photoInputRef.current?.click()}><IconAddPhoto /></button>
            {canChooseAssistant && <button type="button" className={ICON_BUTTON} aria-label={t('Chat options')} title={t('Chat options')} onClick={() => setOptionsOpen(true)}><IconSliders /></button>}
            <ModeSwitch />
            {modelMenu}
            <div className="composer-actions">
              <button
                type="submit"
                className="send-orb"
                title={t(generating || queuedMessages.length > 0 ? 'Queue message' : 'Send')}
                aria-label={generating || queuedMessages.length > 0 ? t("Queue message") : t("Send")}
                disabled={readingPhotos || (draft.trim().length === 0 && draftImages.length === 0)}
              >
                <IconSend />
              </button>
              {generating && (
                <button type="button" className={ICON_BUTTON} title={t(streaming?.stopping ? "Force stop" : "Stop")} aria-label={streaming?.stopping ? t("Force stop") : t("Stop")} onClick={stop}>
                  <IconStop />
                </button>
              )}
            </div>
          </div>
      </div>

      {optionsOpen && <Dialog title={t('Chat options')} onClose={() => setOptionsOpen(false)}>
        <div className="flex flex-col gap-4 p-gutter">
          {canChooseAssistant && <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-ui">{t('Assistant')}</span><AssistantPicker /></div>}
        </div>
      </Dialog>}
    </form>
  );
}

function commandPrefix(draft: string): string | null {
  if (!draft.startsWith('/')) return null;
  if (/\s/.test(draft)) return null;
  return draft.slice(1);
}

function commandRows(prefix: string | null, skills: SkillRecord[]): { name: string; detail: string }[] {
  if (prefix === null) return [];
  const query = prefix.toLowerCase();
  const rows: { name: string; detail: string }[] = [];
  if (SUMMARY_COMMAND.startsWith(query)) rows.push({ name: SUMMARY_COMMAND, detail: SUMMARY_DETAIL });
  for (const skill of skills) {
    if (!COMMAND_NAME_PATTERN.test(skill.name)) continue;
    if (skill.name.toLowerCase() === SUMMARY_COMMAND) continue;
    if (!skill.name.toLowerCase().startsWith(query)) continue;
    rows.push({ name: skill.name, detail: skill.description });
  }
  return rows;
}

function AssistantPicker() {
  const { active, agents, draftAgentId, setDraftAgentId } = useAppState();
  if (active) return null;
  return <Menu label={t('Assistant')} value={draftAgentId} buttonClass={BUTTON.ghost} placement="top" options={agents.filter((agent) => !agent.botOnly).map((agent) => ({ value: agent.id, label: agent.label, subtitle: agent.description }))} onChange={setDraftAgentId} />;
}
