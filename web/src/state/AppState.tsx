import { t } from '../i18n/index.ts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AgentPublic,
  CatalogEntry,
  ModelProfile,
  Project,
  ProviderPublic,
  ReasoningEffort,
  ServiceTier,
  SessionPolicyId,
  SessionSummary,
  Settings,
  SettingsTab,
  StoredSession,
} from '../../../shared/types.ts';
import { ACCENT_COLORS, DEFAULT_SETTINGS } from '../../../shared/types.ts';
import {
  cancelChat,
  getSession,
  getPlan,
  listSessionDialogs,
  putSessionPolicy,
  putSettings,
  respondToDialog,
} from '../api/client.ts';

import { readLocation, routePath, writeLocation, type AppLocation } from './location.ts';
import {
  moodForSignal,
  moodForTerminal,
  planMood,
  type BotMood,
} from './mood.ts';
import type { StreamingState } from './live-types.ts';
import { setLanguage } from '../i18n/index.ts';
import { AppStateContext, reportError, type AppStateValue, type QueuedMessage } from './context.ts';

import { bootApp, displaySettings } from './boot.ts';
import { toSummary, refreshReasoningEffortFlags } from './session-summary.ts';
import { useStreamRuntime } from './use-stream-runtime.ts';
import { useArtifactsState } from './use-artifacts-state.ts';
import { useModelSettings } from './use-model-settings.ts';
import { useProjectChatActions } from './use-project-chat-actions.ts';
import { useSessionPreferences } from './use-session-preferences.ts';
import { useMessageSender } from './use-message-sender.ts';
import { useBotGroups } from './use-bot-groups.ts';
import { useChatDrafts } from './use-chat-drafts.ts';

export { useAppState, reportError } from './context.ts';
export type { StreamingState } from './live-types.ts';

/**
 * What `Build` sends once the chat is in agent mode. It is one line, because the
 * plan itself is already in the transcript and in the panel; the model only needs
 * to be told that the drafting is over and the work starts now.
 */
const FIRST_QUEUED_MESSAGE_ID = 1;
export const BUILD_PLAN_MESSAGE = 'Implement the plan';
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<StoredSession | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const {
    addCatalogModel,
    configuredModels,
    refreshModels,
    removeCatalogModel,
    saveProvider,
    updateCatalogContextLimit,
    updateCatalogMaxContextMode,
  } = useModelSettings({ providers, setProviders, catalog, setCatalog });
  const [agents, setAgents] = useState<AgentPublic[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(() => readLocation().kind === 'migration');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [botsOpen, setBotsOpen] = useState(false);
  const [workspace, setWorkspace] = useState<'chats' | 'bots'>(() => {
    const place = readLocation();
    if (place.kind === 'bots' || (place.kind === 'chat' && place.workspace === 'bots')) return 'bots';
    if (place.kind === 'settings') { try { return localStorage.getItem('xeck.workspace') === 'bots' ? 'bots' : 'chats'; } catch {} }
    return 'chats';
  });
  const [botCreateOpen, setBotCreateOpen] = useState(false);
  const [botProfileId, setBotProfileId] = useState<string | null>(null);
  const botGroupState = useBotGroups(ready && workspace === 'bots');
  useEffect(() => { try { localStorage.setItem('xeck.workspace', workspace); } catch {} }, [workspace]);
  const navigationVersion = useRef(0);
  const [projectPageId, setProjectPageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [debugOpen, setDebugOpenState] = useState(false);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [draft, setDraft, removeDraft] = useChatDrafts(active?.id ?? `new:${draftProjectId ?? 'chat'}`);
  const [draftProfile, setDraftProfile] = useState<ModelProfile | null>(null);
  const [draftEffort, setDraftEffort] = useState<ReasoningEffort | null>(null);
  const [draftServiceTier, setDraftServiceTier] = useState<ServiceTier | null>(null);

  // Picker selection for the empty state. Defaults to coder/build, the backend default.
  const [draftAgentId, setDraftAgentIdState] = useState('');
  const [draftPolicyId, setDraftPolicyId] = useState('');
  const [streams, setStreams] = useState<Record<string, StreamingState>>({});
  const [queuedMessagesBySession, setQueuedMessagesBySession] = useState<Record<string, QueuedMessage[]>>({});
  const [drainingQueuedSessions, setDrainingQueuedSessions] = useState<Record<string, true>>({});
  const [policyBusy, setPolicyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready) setLanguage(settings.language);
  }, [ready, settings.language]);

  const activeId = useRef<string | null>(null);
  const {
    artifactTab,
    changedFileList,
    closePlanPanel,
    loadPlanPanel,
    openPlanPanel,
    planPanelDismissedRef,
    planPanelLoading,
    planPanelOpen,
    planView,
    plans,
    setArtifactTab,
    setChangedFileList,
    setPlanPanelOpen,
    setPlanView,
    setPlans,
    togglePlanTodo,
  } = useArtifactsState({ activeId, setError });
  const setDebugOpen = useCallback((open: boolean) => {
    setDebugOpenState(open);
    if (open) setPlanPanelOpen(false);
  }, [setPlanPanelOpen]);
  useEffect(() => { if (planPanelOpen) setDebugOpenState(false); }, [planPanelOpen]);
  const draftProjectIdRef = useRef<string | null>(null);
  const nextQueuedMessageId = useRef(FIRST_QUEUED_MESSAGE_ID);
  const settingsSaveRef = useRef<Promise<void>>(Promise.resolve());
  const projectPageIdRef = useRef<string | null>(null);
  const projectsRef = useRef(projects);
  const sessionsRef = useRef(sessions);
  const draftRef = useRef(draft);
  const draftProfileRef = useRef(draftProfile);
  const draftEffortRef = useRef(draftEffort);
  const draftServiceTierRef = useRef(draftServiceTier);
  const draftAgentIdRef = useRef(draftAgentId);
  const draftPolicyIdRef = useRef(draftPolicyId);
  const agentsRef = useRef(agents);
  const activeMessagesRef = useRef(0);
  const catalogRef = useRef(catalog);
  const senderSessionRefs = useMemo(() => ({
    activeId,
    activeMessages: activeMessagesRef,
    navigationVersion,
    agents: agentsRef,
    catalog: catalogRef,
  }), []);
  const senderDraftRefs = useMemo(() => ({
    content: draftRef,
    profile: draftProfileRef,
    effort: draftEffortRef,
    serviceTier: draftServiceTierRef,
    projectId: draftProjectIdRef,
    agentId: draftAgentIdRef,
    policyId: draftPolicyIdRef,
  }), []);
  const senderSetters = useMemo(() => ({
    setDraft,
    setDraftProjectId,
    setDraftProfile,
    setDraftEffort,
    setDraftServiceTier,
    setSessions,
    setActive,
    setStreams,
    setError,
  }), []);

  draftRef.current = draft;
  draftProfileRef.current = draftProfile;
  draftEffortRef.current = draftEffort;
  draftServiceTierRef.current = draftServiceTier;
  draftAgentIdRef.current = draftAgentId;
  draftPolicyIdRef.current = draftPolicyId;
  draftProjectIdRef.current = draftProjectId;
  agentsRef.current = agents;
  catalogRef.current = catalog;
  sessionsRef.current = sessions;
  projectPageIdRef.current = projectPageId;
  projectsRef.current = projects;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      const accent = ACCENT_COLORS.includes(settings.accent) ? settings.accent : DEFAULT_SETTINGS.accent;
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.accent = accent;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.accent]);

  const rememberSummary = useCallback((session: StoredSession) => {
    const summary = toSummary(session);
    setSessions((current) =>
      [...(summary.parentId ? [] : [summary]), ...current.filter((item) => item.id !== session.id && !item.parentId)].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    );
    setActive((current) => (current?.id === session.id ? session : current));
    if (activeId.current === session.id) activeMessagesRef.current = session.messages.length;
  }, []);

  const { setSessionEffort, setSessionModel, setSessionServiceTier } = useSessionPreferences({
    active,
    activeId,
    setDraftProfile,
    setDraftEffort,
    setDraftServiceTier,
    setSessions,
    setError,
    rememberSummary,
  });

  const { abortsRef, applyStreamEvent, clearTerminal, markTerminal, resumeLive, streamsRef, terminals } = useStreamRuntime({
    activeId,
    streams,
    setStreams,
    setSessions,
    setActive,
    setError,
    setPlans,
    setPlanPanelOpen,
    planPanelDismissedRef,
    rememberSummary,
    loadPlanPanel,
  });
  const senderStreamRuntime = useMemo(() => ({
    aborts: abortsRef,
    streams: streamsRef,
    applyEvent: applyStreamEvent,
    clearTerminal,
    markTerminal,
    resumeLive,
  }), [abortsRef, streamsRef, applyStreamEvent, clearTerminal, markTerminal, resumeLive]);

  /**
   * Re-reads the session after the local stream was torn down before the host's
   * `done {aborted}` arrived (navigation, delete, or the force-stop fallback).
   * A single immediate read usually loses the race against `persistPartial` and
   * returns the pre-turn snapshot, so this polls until the stored transcript
   * grows past what the turn started with (or the turn clearly ended).
   */
  const reloadAfterAbort = useCallback(
    async (sessionId: string) => {
      const baseline = activeId.current === sessionId ? activeMessagesRef.current : null;
      let latest: StoredSession | null = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          latest = await getSession(sessionId);
        } catch {
          return;
        }
        if (!latest) return;
        // The turn grew the transcript, or the live turn is gone from the host:
        // either way the persisted record is now authoritative.
        if (baseline === null || latest.messages.length > baseline) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (latest) rememberSummary(latest);
    },
    [active, rememberSummary],
  );

  const setDraftAgentId = useCallback((id: string) => {
    setDraftAgentIdState(id);
    const agent = agentsRef.current.find((item) => item.id === id);
    if (agent) setDraftPolicyId(agent.defaultPolicy);
  }, []);

  useEffect(() => {
    if (agents.length === 0 || draftAgentId) return;
    setDraftAgentIdState(agents[0].id);
    setDraftPolicyId(agents[0].defaultPolicy);
  }, [agents, draftAgentId]);

  const showDraft = useCallback((projectId: string | null = null) => {
    navigationVersion.current += 1;
    setWorkspace('chats');
    setBotCreateOpen(false);
    setBotProfileId(null);
    setPlanPanelOpen(false);
    setDebugOpenState(false);
    setMigrationOpen(false);
    setSettingsOpen(false);
    // The project page owns the main pane, so opening a draft has to release it:
    // without this the New chat buttons change the address and leave the page up.
    setProjectPageId(null);
    setError(null);
    activeId.current = null;
    setActive(null);
    setBotsOpen(false);
    setDraftProjectId(projectId);
    setDraftProfile(null);
    setDraftEffort(null);
    setDraftServiceTier(null);
    const first = agentsRef.current[0];
    setDraftAgentIdState(first?.id ?? '');
    setDraftPolicyId(first?.defaultPolicy ?? '');
  }, []);

  const showSettings = useCallback((tab: SettingsTab) => {
    setMigrationOpen(false);
    setBotsOpen(false);
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const applyLocation = useCallback(async (place: AppLocation) => {
    const version = ++navigationVersion.current;
    setBotCreateOpen(false);
    setBotsOpen(place.kind === 'bots');
    if (place.kind === 'bots') {
      setWorkspace('bots');
      setSettingsOpen(false);
      setMigrationOpen(false);
      setProjectPageId(null);
      setSidebarOpen(false);
      return;
    }
    setMigrationOpen(place.kind === 'migration');
    if (place.kind === 'migration') {
      setSettingsOpen(false);
      setProjectPageId(null);
      setSidebarOpen(false);
      return;
    }
    // Navigating away closes the mobile drawer, so it never covers the chat.
    setSidebarOpen(false);
    if (place.kind === 'project') {
      setWorkspace('chats');
      // A project page shows no session; the chat stays loaded underneath and
      // the sidebar stops marking that chat row as the open one.
      setSettingsOpen(false);
      setError(null);
      if (!projectsRef.current.some((project) => project.id === place.id)) {
        // Stale link (project deleted elsewhere): fall back to the draft.
        showDraft();
        writeLocation({ kind: 'draft' }, 'replace');
        return;
      }
      setProjectPageId(place.id);
      return;
    }
    setProjectPageId(null);
    if (place.kind === 'settings') {
      showSettings(place.tab);
      return;
    }
    if (place.kind === 'draft') {
      showDraft();
      return;
    }
    setSettingsOpen(false);
    setError(null);
    activeId.current = place.id;
    try {
      const session = await getSession(place.id);
      if (activeId.current !== place.id || navigationVersion.current !== version) return;
      setDraftProfile(null);
      setDraftEffort(null);
      setDraftServiceTier(null);
      activeMessagesRef.current = session.messages.length;
      setActive(session);
      setWorkspace(session.bot || session.botConversation ? 'bots' : 'chats');
      writeLocation({ kind: 'chat', id: session.id, ...(session.bot || session.botConversation ? { workspace: 'bots' as const } : {}) }, 'replace');
      setPlanPanelOpen(false);
      setPlanView(null);
      setChangedFileList([]);
      void getPlan(place.id)
        .then((activePlan) => {
          if (activeId.current !== place.id || navigationVersion.current !== version) return;
          setPlans((current) => {
            const next = { ...current };
            if (activePlan) next[place.id] = activePlan;
            else delete next[place.id];
            return next;
          });
          if (activePlan && !planPanelDismissedRef.current[place.id]) {
            setPlanPanelOpen(true);
            void loadPlanPanel(place.id);
          }
        })
        .catch(() => undefined);
      const dialogs = await listSessionDialogs(place.id);
      if (activeId.current !== place.id || navigationVersion.current !== version) return;
      const pending = dialogs[0];
      if (pending) {
        setStreams((current) => {
          const existing = current[place.id];
          if (!existing || existing.dialog) return current;
          return { ...current, [place.id]: { ...existing, dialog: pending } };
        });
      }
      // A turn may still be running on the host (e.g. right after a refresh);
      // reattach so the live stream resumes from where it left off.
      void resumeLive(place.id);
    } catch (cause) {
      if (activeId.current !== place.id) return;
      setActive(null);
      setError(cause instanceof Error ? cause.message : t("Session not found"));
    }
  }, [showDraft, showSettings, resumeLive]);

  const openChat = useCallback(async (id: string) => {
    setDraftProjectId(null);
    const bot = sessionsRef.current.find((session) => session.id === id);
    const place: AppLocation = { kind: 'chat', id, ...(bot?.bot || bot?.botConversation ? { workspace: 'bots' as const } : {}) };
    writeLocation(place, 'push');
    await applyLocation(place);
  }, [applyLocation]);

  const {
    assignChatToProject,
    createBot,
    createChat,
    createProject,
    deleteChat,
    deleteProject,
    renameChat,
    renameProject,
    setProjectPinned,
    updateBotProfile,
    updateChatOrganization,
  } = useProjectChatActions({
    removeDraft,
    activeId,
    sessionsRef,
    draftProjectIdRef,
    projectPageIdRef,
    streamsRef,
    abortsRef,
    setSessions,
    setProjects,
    setActive,
    setDraftProjectId,
    setSidebarOpen,
    setError,
    showDraft,
    showBots: () => { writeLocation({ kind: 'bots' }, 'replace'); void applyLocation({ kind: 'bots' }); },
    openChat,
    rememberSummary,
    clearTerminal,
  });

  useEffect(() => {
    let cancelled = false;
    void bootApp()
      .then(async (loaded) => {
        if (cancelled) return;
        setSessions(loaded.sessions);
        setProjects(loaded.projects);
        // The ref sync runs on render, after this await; a direct /p/<id> load
        // would otherwise validate the project against an empty list.
        projectsRef.current = loaded.projects;
        setSettings(loaded.settings);
        setProviders(loaded.providers);
        setCatalog(loaded.catalog);
        setAgents(loaded.agents);
        const place = readLocation();
        if (place.kind === 'settings' && place.tab === 'customize' && routePath().endsWith('/agent')) {
          writeLocation(place, 'replace');
        }
        await applyLocation(place);
        setReady(true);
        void refreshReasoningEffortFlags(loaded.providers).then((entries) => {
          if (!cancelled && entries) setCatalog(entries);
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : t("Failed to load"));
      });
    return () => {
      cancelled = true;
    };
  }, [applyLocation]);

  useEffect(() => {
    const onPop = () => {
      void applyLocation(readLocation());
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, [applyLocation]);

  const openBots = useCallback(() => {
    writeLocation({ kind: 'bots' }, 'push');
    void applyLocation({ kind: 'bots' });
  }, [applyLocation]);

  const { runSend, send } = useMessageSender({
    active,
    settings,
    sessionRefs: senderSessionRefs,
    draftRefs: senderDraftRefs,
    streamRuntime: senderStreamRuntime,
    setters: senderSetters,
    rememberSummary,
    reloadAfterAbort,
  });
  const enqueueMessage = useCallback((content: string) => {
    const sessionId = activeId.current;
    const trimmed = content.trim();
    if (!sessionId || !trimmed) return;

    const message: QueuedMessage = {
      id: String(nextQueuedMessageId.current),
      content: trimmed,
    };
    nextQueuedMessageId.current += 1;
    setQueuedMessagesBySession((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] ?? []), message],
    }));
  }, []);

  const removeQueuedMessage = useCallback((messageId: string) => {
    const sessionId = activeId.current;
    if (!sessionId) return;

    setQueuedMessagesBySession((current) => {
      const existing = current[sessionId];
      if (!existing) return current;

      const remaining = existing.filter((message) => message.id !== messageId);
      if (remaining.length === existing.length) return current;

      const next = { ...current };
      if (remaining.length === 0) delete next[sessionId];
      else next[sessionId] = remaining;
      return next;
    });
  }, []);

  const queuedMessages = active ? queuedMessagesBySession[active.id] ?? [] : [];

  const streaming = active ? streams[active.id] ?? null : null;


  const streamingIds = Object.keys(streams);

  useEffect(() => {
    const sessionId = active?.id;
    if (!sessionId || streams[sessionId] || drainingQueuedSessions[sessionId]) return;

    const nextMessage = queuedMessagesBySession[sessionId]?.[0];
    if (!nextMessage) return;

    setDrainingQueuedSessions((current) => ({ ...current, [sessionId]: true }));
    setQueuedMessagesBySession((current) => {
      const messages = current[sessionId] ?? [];
      if (messages[0]?.id !== nextMessage.id) return current;

      const remaining = messages.slice(1);
      const next = { ...current };
      if (remaining.length === 0) delete next[sessionId];
      else next[sessionId] = remaining;
      return next;
    });

    void runSend(nextMessage.content, false).finally(() => {
      setDrainingQueuedSessions((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    });
  }, [active?.id, drainingQueuedSessions, queuedMessagesBySession, runSend, streams]);
  const plan = active ? plans[active.id] ?? null : null;
  const selectedAgent = agents.find((agent) => agent.id === (active?.agentId || draftAgentId));
  const policyId: SessionPolicyId = active?.policyId || selectedAgent?.defaultPolicy || '';
  const planSurface = selectedAgent?.plan ?? false;
  const offerBuild = planSurface && policyId !== '' && policyId !== (selectedAgent?.defaultPolicy ?? '');

  const sessionMoods = useMemo<Record<string, BotMood>>(() => {
    const now = Date.now();
    const moods: Record<string, BotMood> = {};
    for (const [sessionId, stream] of Object.entries(streams)) {
      moods[sessionId] = moodForSignal(
        {
          phase: stream.phase,
          reasoning: stream.reasoning,
          content: stream.content,
          hasPendingActivity: stream.activity.some((item) => item.pending),
          hasPendingDialog: Boolean(stream.dialog),
          hasRateLimitWait: Boolean(stream.rateLimit),
        },
        // A plan step in progress is the clearest sign that work is happening;
        // a blocked step means the chat is waiting on something else.
        planMood(plans[sessionId]),
      );
    }
    for (const [sessionId, terminal] of Object.entries(terminals)) {
      if (terminal.expiresAt <= now) continue;
      if (!moods[sessionId]) moods[sessionId] = moodForTerminal(terminal.mood);
    }
    return moods;
  }, [streams, terminals, plans]);

  const activeMood: BotMood = active ? (sessionMoods[active.id] ?? 'idle') : 'idle';

  const retry = useCallback(async () => {
    const last = active?.messages.at(-1);
    const content = last?.role === 'user' ? last.content : streaming?.userContent;
    if (!content) return;
    setError(null);
    await runSend(content);
  }, [active, runSend, streaming]);

  const stop = useCallback(() => {
    const sessionId = active?.id;
    if (!sessionId) return;
    const existing = streamsRef.current[sessionId];
    // Second press while already stopping: the host did not finish the turn
    // (network stall, provider hang). Tear down the local stream so the UI is
    // never stuck; the catch path polls the persisted session to avoid the
    // rewind-to-last-prompt bug.
    if (existing?.stopping) {
      abortsRef.current.get(sessionId)?.abort();
      return;
    }
    // Do NOT abort the local fetch here. The host persists the partial turn and
    // reports it through `done {aborted:true, session}`; aborting first would
    // discard that authoritative event and a single immediate re-read would
    // return the pre-turn snapshot (the rewind bug). Mark the bubble so the UI
    // shows "stopping" until `done` arrives.
    setStreams((current) => {
      const stream = current[sessionId];
      if (!stream || stream.stopping) return current;
      return { ...current, [sessionId]: { ...stream, stopping: true } };
    });
    void cancelChat(sessionId)
      .catch(() => undefined)
      .then(() => {
        // Safety net: if the host never reports `done` (connection lost after
        // cancel), do not leave the bubble spinning forever. Give the turn a
        // few seconds to report, then detach and let the catch path poll the
        // persisted session.
        window.setTimeout(() => {
          if (streamsRef.current[sessionId]?.stopping) abortsRef.current.get(sessionId)?.abort();
        }, 8000);
      });
  }, [active]);

  const saveSettings = useCallback((patch: Partial<Settings>) => {
    const saving = settingsSaveRef.current.catch(() => undefined).then(async () => {
      const next = await putSettings(patch);
      setSettings(displaySettings(next));
    });
    settingsSaveRef.current = saving;
    return saving;
  }, []);

  const openSettings = useCallback((tab: SettingsTab = 'general') => {
    // Like any navigation, opening settings closes the mobile drawer so it never covers the page.
    navigationVersion.current += 1;
    setSidebarOpen(false);
    setProjectPageId(null);
    writeLocation({ kind: 'settings', tab }, 'push');
    showSettings(tab);
  }, [showSettings]);

  const openProjectPage = useCallback((id: string) => {
    writeLocation({ kind: 'project', id }, 'push');
    void applyLocation({ kind: 'project', id });
  }, [applyLocation]);

  const openMigration = useCallback(() => {
    writeLocation({ kind: 'migration' }, 'push');
    void applyLocation({ kind: 'migration' });
  }, [applyLocation]);

  const openChats = useCallback(() => {
    const current = activeId.current;
    const existing = sessionsRef.current.find((session) => session.id === current && !session.bot && !session.botConversation);
    if (existing) void openChat(existing.id);
    else createChat();
  }, [openChat, createChat]);

  const closeSettings = useCallback(() => {
    const id = activeId.current;
    if (workspace === 'bots') openBots();
    else if (id && !sessionsRef.current.find((session) => session.id === id)?.bot) void openChat(id);
    else createChat();
  }, [workspace, openBots, openChat, createChat]);

  const setPolicyId = useCallback(async (next: string) => {
    const current = activeId.current;
    if (!current || policyBusy) return;
    setPolicyBusy(true);
    try {
      const session = await putSessionPolicy(current, next);
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the policy"));
    } finally {
      setPolicyBusy(false);
    }
  }, [policyBusy, rememberSummary]);

  const buildPlan = useCallback(async () => {
    const current = activeId.current;
    if (!current) return;
    const agentDef = agentsRef.current.find((agent) => agent.id === (active?.agentId ?? draftAgentIdRef.current));
    if (agentDef?.defaultPolicy) await setPolicyId(agentDef.defaultPolicy);
    await send(BUILD_PLAN_MESSAGE);
  }, [setPolicyId, send, agents, active?.agentId]);

  const respondDialog = useCallback(
    async (dialogId: string, response: { approved?: boolean; response?: string; selections?: string[]; other?: string }) => {
      const currentActive = activeId.current;
      if (!currentActive) return;
      await respondToDialog(currentActive, dialogId, response);
      setStreams((current) => {
        const existing = current[currentActive];
        if (!existing) return current;
        return { ...current, [currentActive]: { ...existing, dialog: null } };
      });
    },
    [],
  );

  const value: AppStateValue = {
    ready,
    loadError,
    sessions,
    projects,
    active,
    settings,
    providers,
    sidebarOpen,
    setSidebarOpen,
    debugOpen,
    setDebugOpen,
    settingsOpen,
    migrationOpen,
    openMigration,
    settingsTab,
    openSettings,
    botsOpen,
    workspace,
    openChats,
    botCreateOpen,
    setBotCreateOpen,
    botProfileId,
    setBotProfileId,
    ...botGroupState,
    openBots,
    createBot,
    projectPageId,
    openProjectPage,
    closeSettings,
    draft,
    setDraft,
    agents,
    draftAgentId,
    setDraftAgentId,
    draftPolicyId,
    setDraftPolicyId,
    draftProjectId,
    streaming,
    error,
    catalog,
    configuredModels,
    draftProfile,
    draftEffort,
    draftServiceTier,
    streamingIds,
    activeMood,
    sessionMoods,
    plan,
    policyId,
    planSurface,
    offerBuild,
    policyBusy,
    planPanelOpen,
    planView,
    changedFiles: changedFileList,
    artifactTab,
    setArtifactTab,
    planPanelLoading,
    setPolicyId,
    togglePlanTodo,
    openPlanPanel,
    closePlanPanel,
    buildPlan,
    createChat,
    createProject,
    renameProject,
    deleteProject,
    setProjectPinned,
    assignChatToProject,
    openChat,
    renameChat,
    updateBotProfile,
    updateChatOrganization,
    deleteChat,
    setSessionModel,
    setSessionEffort,
    setSessionServiceTier,
    queuedMessages,
    enqueueMessage,
    removeQueuedMessage,
    send,
    retry,
    stop,
    respondDialog,
    saveSettings,
    saveProvider,
    addCatalogModel,
    removeCatalogModel,
    updateCatalogContextLength: updateCatalogContextLimit,
    updateCatalogMaxContext: updateCatalogMaxContextMode,
    refreshModels,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

