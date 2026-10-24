import { t } from '../i18n/index.ts';
import { sameImages, type ImageAttachment } from '../../../shared/images.ts';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { ContextTree, Project, ProviderKind, StoredSession, TranscriptMessage } from '../../../shared/types.ts';
import { maxContextThreshold } from '../../../shared/model-context.ts';
import { getSessionContext } from '../api/client.ts';
import { useAppState } from '../state/AppState.tsx';
import { IconChat, IconCode, IconFolder, IconStar, IconXeck } from '../ui/icons.tsx';
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
import { SessionActions } from '../shell/SessionActions.tsx';

const FIRST_PROVIDER_PAGE: ProviderKind = 'ollama';
const OPENAI_PROVIDER: ProviderKind = 'openai';
const CHAT_STARTERS = [
  'Review what I was working on last.',
  'Make a short plan before changing anything.',
  'Look through this project and tell me what is unfinished.',
] as const;
const BOT_STARTERS = [
  'Help me get started with this task.',
  'Make a step-by-step plan with me.',
  'Help me review and improve my work.',
] as const;

export function ChatView() {
  const {
    active,
    activeMood,
    debugOpen,
    setDebugOpen,
    planPanelOpen,
    changedFiles,
    setDraft,
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
  const messages = visibleMessages(active?.messages ?? [], live ? streaming?.userContent ?? '' : null, live ? streaming?.userImages : undefined);
  const liveBlocksKey = live ? live.blocks.map((block) => block.kind === 'tool' ? `t:${block.callId}:${block.pending ? '1' : '0'}:${block.label}` : block.kind === 'dialog' ? `d:${block.dialogId}:${block.resolved ? '1' : '0'}` : block.kind === 'subagent' ? `s:${block.sessionId}:${block.status}:${block.activity}` : `${block.kind}:${block.text.length}`).join('|') : '';

  const followBottom = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const userMessageCount = messages.filter((message) => message.role === 'user').length;
  useEffect(() => { followBottom.current = true; setAwayFromBottom(false); }, [active?.id, userMessageCount]);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !followBottom.current) return;
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

  const detail = active ? chatDetail(active, projects) : null;
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
      onSelectCall={(id) => { setSelectedCallId(id); setDebugOpen(true); }}
      onRespondDialog={isSubagent ? undefined : respondDialog}
      onOpenSubagent={(sessionId) => void openChat(sessionId)}
    />
  );

  return (
    <section className="chat-column" data-mood={activeMood} ref={surfaceRef}>
      <div className="chat-stage relative">
      {active && !isSubagent && (
        <header className="shrink-0 px-4 py-3" aria-label={t('Chat details')}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {active.bot ? <BotAvatar name={active.title} color={active.bot.color} /> : <AgentIcon className={AgentIcon === IconXeck ? 'shrink-0 text-logo' : 'shrink-0 text-muted'} />}
            <div className="min-w-0 flex-1"><h1 className="m-0 truncate text-body font-medium">{active.title}</h1>{detail && <p className="truncate text-small text-muted">{detail}</p>}</div>
            <SessionActions session={active} extraActions={[
              ...(plan || changedFiles.length > 0 ? [{ label: t('Artifacts'), onClick: () => void openPlanPanel(), pressed: planPanelOpen }] : []),
              ...(settings.debugMode ? [{ label: t('Debug'), onClick: () => setDebugOpen(!debugOpen), pressed: debugOpen }] : []),
            ]} />
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
            {!active?.bot && (
              <div className="hero-stage">
                <IconXeck size={28} className="hero-mark" />
                <h2 className="display-title">{t("What are we working on today?")}</h2>
              </div>
            )}
            <StarterRows prompts={active?.bot ? BOT_STARTERS : CHAT_STARTERS} onPick={(prompt) => { setDraft(t(prompt)); surfaceRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); }} />
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
            <div ref={scrollRef} className="transcript-scroll" onScroll={() => {
              const node = scrollRef.current;
              if (!node) return;
              const nearBottom = node.scrollHeight - node.clientHeight - node.scrollTop < 80;
              followBottom.current = nearBottom;
              setAwayFromBottom(!nearBottom);
            }}>
              <div className="column" data-text-size={settings.textSize}>
                {transcript}
                <XeckPulse key={active?.id} signal={live && streaming ? streaming : null} />
                {(error || active?.subagentError) && <ErrorBanner message={error ?? active?.subagentError ?? ''} onRetry={isSubagent || isBotConversation ? undefined : () => void retry()} />}
                {isSubagent && active?.subagentStatus && !live && !error && !active.subagentError && (
                  <p className="py-2 text-small text-muted" role="status">{active.subagentStatus === 'done' ? t("Complete") : active.subagentStatus === 'cancelled' ? t("Cancelled") : active.subagentStatus === 'failed' ? t("Failed") : t("Running")}</p>
                )}
              </div>
            </div>
          {awayFromBottom && <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2"><button type="button" className={BUTTON.secondary} onClick={() => { const node = scrollRef.current; if (node) node.scrollTop = node.scrollHeight; followBottom.current = true; setAwayFromBottom(false); }}>{t('Jump to latest')}</button></div>}
          </div>
          {!isSubagent && !isBotConversation && <div className="composer-dock"><div className="column">
            <div data-mood={activeMood}>
              <Composer modelMenu={modelMenu} />
            </div>
            <ContextMeter />
          </div></div>}
        </>
      )}
      {isBotConversation && <p className="px-gutter py-4 text-center text-small text-muted">{t('This conversation belongs to the bots. Your personal chats stay separate.')}</p>}
      </div>
      {/* The plan pane is docked, so it is a column beside the chat like the
          debug pane is, and never an overlay that hides the transcript. */}
      {!debugOpen && !isSubagent && !isBotConversation && <PlanPanel />}
      {settings.debugMode && active && debugOpen && (
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

function visibleMessages(messages: TranscriptMessage[], pendingUser: string | null, images: ImageAttachment[] = []) {
  if (pendingUser === null || (!pendingUser && !images.length)) return messages;
  const last = messages.at(-1);
  if (last?.role === 'user' && last.content === pendingUser && sameImages(last.images, images)) return messages;
  return [
    ...messages,
    {
      id: 'pending-user',
      role: 'user' as const,
      content: pendingUser,
      ...(images.length ? { images } : {}),
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

function chatDetail(session: StoredSession, projects: Project[]): string | null {
  const project = projects.find((item) => item.id === session.projectId)?.name;
  const purpose = session.bot?.purpose?.trim();
  const parts = [purpose || project, session.archived ? t('Archived') : null].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : null;
}

function StarterRows({ prompts, onPick }: { prompts: readonly string[]; onPick: (prompt: string) => void }) {
  return (
    <div className="starter-list" aria-label={t('Suggested tasks')}>
      {prompts.map((prompt) => (
        <button key={prompt} type="button" className="starter-row" onClick={() => onPick(prompt)}>{t(prompt)}</button>
      ))}
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
