import { t } from '../i18n/index.ts';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { ContextTree, ProviderKind, TranscriptMessage } from '../../../shared/types.ts';
import { maxContextThreshold } from '../../../shared/model-context.ts';
import { getSessionContext } from '../api/client.ts';
import { useAppState } from '../state/AppState.tsx';
import { cn } from '../lib/cn.ts';
import { IconChat, IconCheck, IconChevron, IconCode, IconFolder, IconPlus, IconStar, IconXeck } from '../ui/icons.tsx';
import { useStreamRevealLength } from '../ui/use-typed-text.ts';
import { callsForMessages, type ActivityCall } from './activity-calls.ts';
import { Composer } from './Composer.tsx';
import { ContextSidebar } from './ContextSidebar.tsx';
import { MessageList } from './MessageList.tsx';
import { BotAvatar } from '../ui/BotAvatar.tsx';
import { XeckPulse } from './XeckPulse.tsx';
import { ContextMeter } from './ContextMeter.tsx';
import { ModelMenu, modelOptions } from './ModelMenu.tsx';
import { PlanPanel } from './PlanPanel.tsx';
import { PlanMeter } from './PlanMeter.tsx';
import { usePolicyCycle } from './policy-cycle.ts';
import { BUTTON } from '../ui/button-styles.ts';

const FIRST_PROVIDER_PAGE: ProviderKind = 'ollama';
const OPENAI_PROVIDER: ProviderKind = 'openai';

export function ChatView() {
  const {
    active,
    activeMood,
    agents,
    catalog,
    configuredModels,
    draftEffort,
    draftServiceTier,
    draftProfile,
    draftProjectId,
    providers,
    projects,
    setSessionEffort,
    setSessionServiceTier,
    setSessionModel,
    updateCatalogMaxContext,
    streaming,
    error,
    retry,
    settings,
    openSettings,
    plan,
    openPlanPanel,
    respondDialog,
    openChat,
  } = useAppState();
  const parentId = active?.origin?.by === 'agent' ? active.origin.parent : null;
  const isSubagent = parentId !== null;
  const isBotConversation = Boolean(active?.botConversation);
  const activeAgent = agents.find((agent) => agent.id === active?.agentId);
  const AgentIcon = AGENT_ICONS[activeAgent?.id ?? ''] ?? AGENT_ICONS[activeAgent?.icon ?? ''] ?? IconChat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  usePolicyCycle(surfaceRef);
  const live =
    streaming && active && streaming.sessionId === active.id
      ? {
          content: streaming.content,
          reasoning: streaming.reasoning,
          phase: streaming.phase,
          blocks: streaming.blocks,
          activity: streaming.activity.map((item) => ({
            label: item.label,
            pending: item.pending,
            callId: item.id,
            change: item.change,
            terminal: item.terminal,
          })),
          rateLimit: streaming.rateLimit ?? null,
          stopping: streaming.stopping ?? false,
          toolCalls: streaming.activity,
        }
      : null;

  // No turn means nothing to reveal: the hook then gets an empty target and
  // shows every text in full.
  const revealedChars = useStreamRevealLength(live?.content ?? '');
  const messages = visibleMessages(active?.messages ?? [], live ? streaming?.userContent ?? '' : null);
  const liveBlocksKey = live ? live.blocks.map((block) => block.kind === 'tool' ? `t:${block.callId}:${block.pending ? '1' : '0'}:${block.label}` : block.kind === 'dialog' ? `d:${block.dialogId}:${block.resolved ? '1' : '0'}` : block.kind === 'subagent' ? `s:${block.sessionId}:${block.status}:${block.activity}` : `${block.kind}:${block.text.length}`).join('|') : '';

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, live?.content, live?.reasoning, liveBlocksKey, revealedChars]);

  const [contextTree, setContextTree] = useState<ContextTree | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const calls = useMemo(
    () => callsForMessages(active?.messages ?? [], active?.libraryMessages ?? []),
    [active?.messages, active?.libraryMessages],
  );
  const selection = useMemo(
    () => selectedCall(selectedCallId, calls, live?.activity ?? null, streaming),
    [selectedCallId, calls, live?.activity, streaming],
  );

  useEffect(() => {
    setSelectedCallId(null);
    setContextTree(null);
    setContextError(null);
  }, [active?.id]);

  useEffect(() => {
    if (!settings.debugMode || !active) {
      setContextTree(null);
      setContextError(null);
      return;
    }
    let cancelled = false;
    void getSessionContext(active.id)
      .then((next) => {
        if (cancelled) return;
        setContextTree(next);
        setContextError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setContextError(cause instanceof Error ? cause.message : t("Could not load context"));
      });
    return () => {
      cancelled = true;
    };
  }, [settings.debugMode, active?.id, active?.updatedAt]);

  const empty = messages.length === 0 && !live;
  // A draft has no session yet, so the project header reads the draft state.
  const draftProject = draftProjectId ? projects.find((project) => project.id === draftProjectId) ?? null : null;
  const profile = active?.profile.model
    ? active.profile
    : draftProfile?.model
      ? draftProfile
      : settings.defaultProfile?.model
        ? settings.defaultProfile
        : undefined;
  const effort = active ? active.reasoningEffort ?? null : draftEffort;
  const serviceTier = active ? active.serviceTier ?? null : draftServiceTier;
  const menuProvider = profile?.provider ?? OPENAI_PROVIDER;
  const showEffort = profile
    ? catalog.some(
        (entry) =>
          entry.provider === profile.provider && entry.model === profile.model && entry.supportsReasoningEffort === true,
      )
    : false;
  const showServiceTier = menuProvider === OPENAI_PROVIDER;
  const catalogEntry = profile
    ? catalog.find((entry) => entry.provider === profile.provider && entry.model === profile.model)
    : undefined;
  const maxThreshold = profile ? maxContextThreshold(profile.model) : undefined;
  const canUseMax = Boolean(maxThreshold && catalogEntry?.contextLength && catalogEntry.contextLength > maxThreshold);
  const modelMenu = (
    <ModelMenu
      provider={menuProvider}
      model={profile?.model ?? ''}
      options={modelOptions(configuredModels, providers, catalog, profile)}
      disabled={Boolean(live)}
      effort={showEffort ? effort : undefined}
      serviceTier={showServiceTier ? serviceTier : undefined}
      maxContextEnabled={canUseMax ? catalogEntry?.maxContextEnabled === true : undefined}
      onEffortChange={showEffort ? (next) => void setSessionEffort(next) : undefined}
      onServiceTierChange={showServiceTier ? (next) => void setSessionServiceTier(next) : undefined}
      onMaxContextChange={canUseMax && catalogEntry
        ? (enabled) => void updateCatalogMaxContext(catalogEntry.slug, enabled)
        : undefined}
      onChange={(provider, model) => {
        void setSessionModel(provider, model);
      }}
      onAddModel={() => openSettings(FIRST_PROVIDER_PAGE)}
    />
  );

  const transcript = (
    <MessageList
      messages={messages}
      showReasoning={settings.showReasoning}
      hideToolUsages={settings.hideToolUsages}
      toolUsageViewMode={settings.toolUsageViewMode}
      calls={calls}
      streaming={live}
      revealChars={live ? revealedChars : undefined}
      debug={settings.debugMode}
      selectedCallId={selectedCallId}
      onSelectCall={setSelectedCallId}
      onRespondDialog={isSubagent ? undefined : respondDialog}
      onOpenSubagent={(sessionId) => void openChat(sessionId)}
    />
  );

  return (
    <section className="chat-column" data-mood={activeMood} ref={surfaceRef}>
      <div className="chat-stage relative" data-agent-header={active && !isSubagent ? 'true' : undefined}>
      {active && !isSubagent && (
        <header className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4" aria-label={t("Chat agent")}>
          <div className="flex h-10 min-w-0 max-w-xs items-center gap-2.5 rounded-full bg-chip py-1.5 pl-1.5 pr-4 text-ui text-ink">
            {active.botConversation ? (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-field text-muted" aria-hidden="true"><IconChat /></span>
            ) : active.bot ? (
              <BotAvatar name={active.title} color={active.bot.color} />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-field text-accent" aria-hidden="true">
                <AgentIcon />
              </span>
            )}
            <span className="min-w-0 truncate font-medium leading-tight" title={active.bot ? active.title : t(activeAgent?.label ?? active.agentId ?? 'Agent')}>
              {active.bot ? active.title : t(activeAgent?.label ?? active.agentId ?? 'Agent')}
            </span>
          </div>
        </header>
      )}
      {parentId && (
        <header className="shrink-0">
          <div className="column flex items-center gap-3 px-5 py-2">
            <button type="button" className={BUTTON.ghost} onClick={() => void openChat(parentId)}>{t("Back to parent chat")}</button>
            <span className="truncate text-small text-muted">{active?.agentId} · {active?.profile.model}</span>
          </div>
        </header>
      )}
      {!active && draftProject && (
        <header className="shrink-0">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-5 py-3">
            <span
              className="flex h-7 w-7 flex-none items-center justify-center rounded-control bg-field text-muted [&_svg]:h-4 [&_svg]:w-4"
              aria-hidden="true"
            >
              <IconFolder />
            </span>
            <span className="text-ui text-muted">{t("New chat in")}</span>
            <span className="truncate text-ui font-medium text-ink">{draftProject.name}</span>
          </div>
        </header>
      )}
      {empty && !isSubagent && !isBotConversation ? (
        <div className="center-stage">
          <div className="column">
            {!active?.bot && <AgentPicker />}
            <div data-mood={activeMood}>
              <Composer modelMenu={modelMenu} />
            </div>
            <ContextMeter />
            {error && <ErrorBanner message={error} onRetry={() => void retry()} />}
          </div>
        </div>
      ) : (
        <>
          {plan && !isSubagent && !isBotConversation && (
            <div className="shrink-0 px-4 pt-3">
              <div className="column">
                <button
                  type="button"
                  className="w-full rounded-card bg-chip px-4 py-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  aria-label={t("Open active plan {0}", { "0": plan.name })}
                  onClick={() => void openPlanPanel()}
                >
                  <span className="block truncate text-sm font-semibold text-ink">{plan.name}</span>
                  <PlanMeter plan={plan} />
                </button>
              </div>
            </div>
          )}
          <div className="transcript-area">
            <div ref={scrollRef} className="transcript-scroll">
              <div className="column" data-text-size={settings.textSize}>
                {transcript}
                <XeckPulse key={active?.id} signal={live && streaming ? streaming : null} />
                {(error || active?.subagentError) && <ErrorBanner message={error ?? active?.subagentError ?? ''} onRetry={isSubagent || isBotConversation ? undefined : () => void retry()} />}
                {isSubagent && active?.subagentStatus && !live && !error && !active.subagentError && (
                  <p className="py-2 text-small text-muted" role="status">{active.subagentStatus === 'done' ? t("Complete") : active.subagentStatus === 'cancelled' ? t("Cancelled") : active.subagentStatus === 'failed' ? t("Failed") : t("Running")}</p>
                )}
              </div>
            </div>
          </div>
          {!isSubagent && !isBotConversation && <div className="column composer-dock">
            <div data-mood={activeMood}>
              <Composer modelMenu={modelMenu} />
            </div>
            <ContextMeter />
          </div>}
        </>
      )}
      {isBotConversation && <p className="px-gutter py-4 text-center text-small text-muted">{t('This conversation belongs to the bots. Your personal chats stay separate.')}</p>}
      </div>
      {/* The plan pane is docked, so it is a column beside the chat like the
          debug pane is, and never an overlay that hides the transcript. */}
      {!isSubagent && !isBotConversation && <PlanPanel />}
      {settings.debugMode && active && (
        <ContextSidebar tree={contextTree} parts={active.contextParts ?? null} error={contextError} selection={selection} />
      )}
    </section>
  );
}

function selectedCall(
  id: string | null,
  calls: Map<string, ActivityCall[]>,
  live: { callId?: string; label: string; pending?: boolean }[] | null,
  streaming: { sessionId: string; activity: { id: string; label: string; pending: boolean; args: Record<string, unknown>; result: string | null }[] } | null,
): ActivityCall | null {
  if (!id) return null;
  const pending = streaming?.activity.find((item) => item.id === id);
  if (pending && live?.some((line) => line.callId === id)) {
    return { id: pending.id, label: pending.label, args: pending.args, result: pending.result, pending: pending.pending };
  }
  for (const rows of calls.values()) {
    const hit = rows.find((row) => row.id === id);
    if (hit) return hit;
  }
  return null;
}

function visibleMessages(messages: TranscriptMessage[], pendingUser: string | null) {
  if (!pendingUser) return messages;
  const last = messages.at(-1);
  if (last?.role === 'user' && last.content === pendingUser) return messages;
  return [
    ...messages,
    {
      id: 'pending-user',
      role: 'user' as const,
      content: pendingUser,
      createdAt: new Date().toISOString(),
    },
  ];
}


const AGENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  xeck: IconXeck,
  code: IconCode,
  chat: IconChat,
  star: IconStar,
};

/**
 * Soft tint chips behind the agent icons, straight from the settings nav
 * palette — no new color, icon stays `currentColor` (docs/rules/frontend.md).
 */
const AGENT_TINT: Record<string, string> = {
  code: 'bg-tint-customize-bg text-tint-customize-ink',
  chat: 'bg-tint-remote-bg text-tint-remote-ink',
  star: 'bg-tint-star-bg text-tint-star-ink',
};

/**
 * The empty state: pick the agent for the new chat. The choice lands in
 * `draftAgentId`; the session is created with it on the first send, so an
 * abandoned click never leaves an empty session behind.
 */
function AgentPicker() {
  const { agents, draftAgentId, setDraftAgentId, openSettings } = useAppState();
  return (
    <div className="agent-picker" role="radiogroup" aria-label={t("Agent")}>
      {agents.map((agent) => {
        const Icon = AGENT_ICONS[agent.id] ?? AGENT_ICONS[agent.icon] ?? IconChat;
        const selected = draftAgentId === agent.id;
        return (
          <button
            key={agent.id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-selected={selected ? 'true' : 'false'}
            className="agent-card"
            onClick={() => setDraftAgentId(agent.id)}
          >
            <span className={cn('agent-chip', AGENT_TINT[agent.id] ?? AGENT_TINT[agent.icon] ?? 'bg-tint-general-bg text-tint-general-ink')}>
              <Icon />
            </span>
            <span className="agent-card-copy">
              <span className="agent-card-title">{t(agent.label)}</span>
              <span className="agent-card-desc">{t(agent.description)}</span>
            </span>
            <span className="agent-card-check" aria-hidden="true"><IconCheck /></span>
          </button>
        );
      })}
      <button type="button" className="agent-card" data-kind="new" onClick={() => openSettings('customize')}>
        <span className="agent-chip bg-tint-general-bg text-tint-general-ink">
          <IconPlus />
        </span>
        <span className="agent-card-copy">
          <span className="agent-card-title">{t("New agent")}</span>
          <span className="agent-card-desc">{t("Customize rules, skills, and MCPs.")}</span>
        </span>
        <span className="agent-card-add" aria-hidden="true"><IconChevron /></span>
      </button>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <div>
        <strong>{t("Generation failed")}</strong>
        <p>{t(message)}</p>
      </div>
      {onRetry && <button type="button" onClick={onRetry}>
        {t("Regenerate")}</button>}
    </div>
  );
}
