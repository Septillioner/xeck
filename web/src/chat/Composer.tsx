import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { COMMAND_NAME_PATTERN, SUMMARY_COMMAND } from '../../../shared/commands.ts';
import { isSessionPolicyId, type PolicyChoice, type SkillRecord } from '../../../shared/types.ts';
import { listSkills } from '../api/client.ts';
import { useAppState } from '../state/AppState.tsx';
import { IconSend, IconStop } from '../ui/icons.tsx';
import { Menu } from '../ui/Menu.tsx';
import { resolveDraftPolicyId } from './policy-cycle.ts';

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
          label="Policy"
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
        label="Policy"
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
  const { draft, setDraft, send, stop, streaming, settings, queuedMessages, enqueueMessage, removeQueuedMessage } = useAppState();
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    if (!trimmed) return;

    if (generating || queuedMessages.length > 0) {
      enqueueMessage(trimmed);
      setDraft('');
      return;
    }
    void send(trimmed);
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
      onSubmit={(event) => {
        event.preventDefault();
          submitMessage();
      }}
    >
      {menuOpen && (
        <div className="command-menu" role="listbox" aria-label="Commands">
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
              <span>{row.detail}</span>
            </button>
          ))}
        </div>
      )}
        {queuedMessages.length > 0 && (
          <section className="mb-3 min-w-0 overflow-hidden rounded-card bg-chip p-3" aria-label="Queued messages">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-ink">Queued messages</h2>
              <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
                {queuedMessages.length}
              </span>
            </div>
            <ol className="flex max-h-40 flex-col gap-1.5 overflow-y-auto p-0" aria-label="Queued messages">
              {queuedMessages.map((message) => (
                <li
                  className="flex min-w-0 items-start gap-2 rounded-control bg-field px-3 py-2"
                  key={message.id}
                >
                  <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere text-xs leading-relaxed text-ink">
                    {message.content}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-tile px-2 py-1 text-xs text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    aria-label={`Remove queued message: ${message.content}`}
                    onClick={() => removeQueuedMessage(message.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="composer">
        <div className="composer-main">
          <TextareaAutosize
            ref={inputRef}
            minRows={1}
            maxRows={COMPOSER_MAX_ROWS}
            value={draft}
            placeholder="Ask me anything..."
            onChange={(event) => setDraft(event.target.value)}
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
            <ModeSwitch />
            {modelMenu}
          </div>
        </div>
            <div className="composer-actions">
              <button
                type="submit"
                className="send-orb"
                aria-label={generating || queuedMessages.length > 0 ? 'Queue message' : 'Send'}
                disabled={draft.trim().length === 0}
              >
                <IconSend />
              </button>
              {generating && (
                <button type="button" className="send-orb" aria-label="Stop" onClick={stop}>
                  <IconStop />
                </button>
              )}
            </div>
      </div>

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
