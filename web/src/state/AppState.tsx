import { t } from '../i18n/index.ts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AgentPublic,
  CatalogEntry,
  ChangedFile,
  ModelProfile,
  PlanSnapshot,
  PlanStatus,
  PlanView,
  Project,
  ProviderKind,
  ProviderPublic,
  ProviderUpdate,
  ReasoningEffort,
  ServiceTier,
  SessionPolicyId,
  SessionSummary,
  Settings,
  SettingsTab,
  StoredSession,
} from '../../../shared/types.ts';
import { ACCENT_COLORS, DEFAULT_SETTINGS, isLocalProvider } from '../../../shared/types.ts';
import {
  ApiError,
  addCatalogEntry,
  attachToStream,
  cancelChat,
  createSession,
  createProject as createProjectRequest,
  deleteProject as deleteProjectRequest,
  renameProject as renameProjectRequest,

  deleteSession,
  getSession,
  getChangedFiles,
  getPlan,
  listCatalog,
  listProviders,
  listProviderModels,
  listSessionDialogs,
  listSessions,
  patchSession,
  putPlanTodo,
  putSessionPolicy,
  putProvider,
  putSettings,
  removeCatalogEntry,
  updateCatalogContextLength,
  updateCatalogMaxContext,
  respondToDialog,
  streamMessage,
} from '../api/client.ts';

import { isContextSummary } from '../../../shared/commands.ts';
import { readLocation, routePath, writeLocation, type AppLocation } from './location.ts';
import {
  moodForSignal,
  moodForTerminal,
  planMood,
  terminalDuration,
  type BotMood,
  type TerminalMood,
} from './mood.ts';
import type { StreamingState, TerminalEntry } from './live-types.ts';
import { setLanguage } from '../i18n/index.ts';
import { AppStateContext, reportError, type AppStateValue, type ArtifactTab, type QueuedMessage } from './context.ts';

import { bootApp, displaySettings } from './boot.ts';
import { createStreamEventApplier } from './stream-events.ts';
import { toSummary, catalogSupportsEffort, refreshReasoningEffortFlags } from './session-summary.ts';

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
  const [agents, setAgents] = useState<AgentPublic[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(() => readLocation().kind === 'migration');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [botsOpen, setBotsOpen] = useState(false);
  const [projectPageId, setProjectPageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [draftProfile, setDraftProfile] = useState<ModelProfile | null>(null);
  const [draftEffort, setDraftEffort] = useState<ReasoningEffort | null>(null);
  const [draftServiceTier, setDraftServiceTier] = useState<ServiceTier | null>(null);
  // Project the draft will be created in; null for a plain new chat.
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  // Picker selection for the empty state. Defaults to coder/build, the backend default.
  const [draftAgentId, setDraftAgentIdState] = useState('');
  const [draftPolicyId, setDraftPolicyId] = useState('');
  const [streams, setStreams] = useState<Record<string, StreamingState>>({});
  const [queuedMessagesBySession, setQueuedMessagesBySession] = useState<Record<string, QueuedMessage[]>>({});
  const [drainingQueuedSessions, setDrainingQueuedSessions] = useState<Record<string, true>>({});
  const [plans, setPlans] = useState<Record<string, PlanSnapshot>>({});
  const [policyBusy, setPolicyBusy] = useState(false);
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [planView, setPlanView] = useState<PlanView | null>(null);

  const [changedFileList, setChangedFileList] = useState<ChangedFile[]>([]);
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>('plans');
  const [planPanelLoading, setPlanPanelLoading] = useState(false);
  // Chats whose plan pane the user closed. A plan is opened automatically, but
  // only until the user puts it away; after that it stays away for that chat.
  const [planPanelDismissed, setPlanPanelDismissed] = useState<Record<string, true>>({});
  const [terminals, setTerminals] = useState<Record<string, TerminalEntry>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready) setLanguage(settings.language);
  }, [ready, settings.language]);

  const activeId = useRef<string | null>(null);
  const draftProjectIdRef = useRef<string | null>(null);
  const nextQueuedMessageId = useRef(FIRST_QUEUED_MESSAGE_ID);
  const settingsOpenRef = useRef(false);
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
  const streamsRef = useRef(streams);
  const activeMessagesRef = useRef(0);
  const terminalsRef = useRef(terminals);
  const terminalTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const catalogRef = useRef(catalog);
  const abortsRef = useRef(new Map<string, AbortController>());
  // Read by the stream applier, which must not be re-created when the user
  // closes a pane, so it reads the current value instead of capturing one.
  const planPanelDismissedRef = useRef(planPanelDismissed);

  settingsOpenRef.current = settingsOpen || migrationOpen;
  draftRef.current = draft;
  draftProfileRef.current = draftProfile;
  draftEffortRef.current = draftEffort;
  draftServiceTierRef.current = draftServiceTier;
  draftAgentIdRef.current = draftAgentId;
  draftPolicyIdRef.current = draftPolicyId;
  draftProjectIdRef.current = draftProjectId;
  agentsRef.current = agents;
  streamsRef.current = streams;
  terminalsRef.current = terminals;
  catalogRef.current = catalog;
  sessionsRef.current = sessions;
  projectPageIdRef.current = projectPageId;
  projectsRef.current = projects;
  planPanelDismissedRef.current = planPanelDismissed;

  const markTerminal = useCallback((sessionId: string, mood: TerminalMood) => {
    const existing = terminalTimersRef.current.get(sessionId);
    if (existing) clearTimeout(existing);
    setTerminals((current) => ({ ...current, [sessionId]: { mood, expiresAt: Date.now() + terminalDuration(mood) } }));
    const timer = setTimeout(() => {
      terminalTimersRef.current.delete(sessionId);
      setTerminals((current) => {
        if (!current[sessionId]) return current;
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    }, terminalDuration(mood));
    terminalTimersRef.current.set(sessionId, timer);
  }, []);
  const clearTerminal = useCallback((sessionId: string) => {
    const existing = terminalTimersRef.current.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      terminalTimersRef.current.delete(sessionId);
    }
    setTerminals((current) => {
      if (!current[sessionId]) return current;
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
  }, []);

  // Reads the active plan and changed files for the artifacts pane.
  const loadPlanPanel = useCallback(async (sessionId: string) => {
    setPlanPanelLoading(true);
    try {
      const [activePlan, files] = await Promise.all([getPlan(sessionId), getChangedFiles(sessionId)]);
      setChangedFileList(files);
      setPlanView(activePlan);
      setPlans((existing) => {
        const next = { ...existing };
        if (activePlan) next[sessionId] = activePlan;
        else delete next[sessionId];
        return next;
      });
    } catch (cause) {
      setPlanView(null);
      setError(reportError(cause));
    } finally {
      setPlanPanelLoading(false);
    }
  }, []);


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

  // Reduces one host stream event into the live view. Shared by the send path and
  // by reattaching to a turn that is already running (e.g. after a refresh).
  const applyStreamEvent = useMemo(
    () =>
      createStreamEventApplier({
        readActiveId: () => activeId.current,
        setSessions,
        setActive,
        setStreams,
        setError,
        rememberSummary,
        markTerminal,
        setPlan: (sessionId, plan) => {
          setPlans((current) => (current[sessionId]?.revision === plan.revision ? current : { ...current, [sessionId]: plan }));
          // A rewritten plan is the thing the pane exists to show, so it opens
          // itself and reloads. A chat the user closed keeps it closed.
          if (activeId.current !== sessionId || planPanelDismissedRef.current[sessionId]) return;
          setPlanPanelOpen(true);
          void loadPlanPanel(sessionId);
        },
      }),
    [rememberSummary, markTerminal, loadPlanPanel],
  );

  // Reattach to a turn the host is still running (page refreshed mid-turn, or a
  // send raced an already-running turn). Opens the replay stream only when a
  // turn is live, so opening a finished chat does not flash an empty bubble.
  const resumeLive = useCallback(async (sessionId: string): Promise<boolean> => {
    // abortsRef tracks every live stream synchronously, so a send or another
    // attach that is already running is never duplicated.
    if (abortsRef.current.has(sessionId)) return true;
    const controller = new AbortController();
    abortsRef.current.set(sessionId, controller);
    let opened = false;
    let finished = false;
    let terminalReceived = false;
    let startedAt = Date.now();
    try {
      return await attachToStream(
        sessionId,
        controller.signal,
        (event) => {
          // Mark this before applying the terminal snapshot: the initial GET
          // may resolve between `done` and the stream connection closing.
          if (event.event === 'done' || event.event === 'error') terminalReceived = true;
          applyStreamEvent(sessionId, startedAt, event);
        },
        () => {
          opened = true;
          startedAt = Date.now();
          clearTerminal(sessionId);
          setStreams((current) => ({
            ...current,
            [sessionId]: {
              sessionId,
              userContent: '',
              content: '',
              reasoning: '',
              phase: null,
              activity: [],
              blocks: [],
            },
          }));
          // The running turn's user message is already persisted; reload it so it
          // shows next to the streamed assistant blocks.
          void getSession(sessionId)
            .then((session) => {
              if (!finished && !terminalReceived && activeId.current === sessionId) rememberSummary(session);
            })
            .catch(() => undefined);
        },
      );
    } catch (cause) {
      if (!terminalReceived && !controller.signal.aborted && activeId.current === sessionId) {
        setError(reportError(cause));
      }
      return false;
    } finally {
      finished = true;
      // The turn can finish after the first GET but before attaching (404), or
      // the connection can close without a terminal event. Read its persisted
      // transcript once so opening a child never freezes the earlier snapshot.
      if (!terminalReceived && !controller.signal.aborted && activeId.current === sessionId) {
        try {
          const session = await getSession(sessionId);
          if (activeId.current === sessionId) rememberSummary(session);
          if (session.subagentStatus === 'running' && activeId.current === sessionId) {
            setError('Live connection closed. Reopen this chat to reconnect.');
          }
        } catch (cause) {
          if (activeId.current === sessionId) setError(reportError(cause));
        }
      }
      if (opened) {
        setStreams((current) => {
          if (!current[sessionId]) return current;
          const next = { ...current };
          delete next[sessionId];
          return next;
        });
      }
      if (abortsRef.current.get(sessionId) === controller) abortsRef.current.delete(sessionId);
    }
  }, [applyStreamEvent, clearTerminal, rememberSummary]);

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
    setMigrationOpen(false);
    setSettingsOpen(false);
    // The project page owns the main pane, so opening a draft has to release it:
    // without this the New chat buttons change the address and leave the page up.
    setProjectPageId(null);
    setError(null);
    activeId.current = null;
    setActive(null);
    setDraft('');
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
    setBotsOpen(place.kind === 'bots');
    if (place.kind === 'bots') {
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
      if (activeId.current !== place.id) return;
      setDraftProfile(null);
      setDraftEffort(null);
      setDraftServiceTier(null);
      activeMessagesRef.current = session.messages.length;
      setActive(session);
      setPlanPanelOpen(false);
      setPlanView(null);
      setChangedFileList([]);
      void getPlan(place.id)
        .then((activePlan) => {
          if (activeId.current !== place.id) return;
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
      if (activeId.current !== place.id) return;
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
    writeLocation({ kind: 'chat', id }, 'push');
    await applyLocation({ kind: 'chat', id });
  }, [applyLocation]);

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

  const createBot = useCallback(async (bot: import('../../../shared/types.ts').XeckBotCreateInput) => {
    const session = await createSession({ bot, agentId: agentsRef.current[0]?.id });
    rememberSummary(session);
    await openChat(session.id);
  }, [rememberSummary, openChat]);

  const createProject = useCallback(async (name: string) => {
    const project = await createProjectRequest(name);
    setProjects((existing) => [...existing, project]);
    return project;
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    const project = await renameProjectRequest(id, name);
    setProjects((existing) => existing.map((item) => item.id === project.id ? project : item));
    return project;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await deleteProjectRequest(id);
    const updatedAt = new Date().toISOString();
    setProjects((existing) => existing.filter((project) => project.id !== id));
    setSessions((existing) => existing.map((session) => session.projectId === id
      ? { ...session, projectId: undefined, updatedAt }
      : session));
    setActive((existing) => existing?.projectId === id
      ? { ...existing, projectId: undefined, updatedAt }
      : existing);
    if (draftProjectIdRef.current === id) setDraftProjectId(null);
    if (projectPageIdRef.current === id) {
      // The page of a deleted project has nothing left to show, and showDraft
      // releases the pane the page owned.
      showDraft();
      writeLocation({ kind: 'draft' }, 'replace');
    }
  }, [showDraft]);

  const assignChatToProject = useCallback(async (sessionId: string, projectId: string | null) => {
    const session = await patchSession(sessionId, { projectId });
    rememberSummary(session);
  }, [rememberSummary]);

  const createChat = useCallback((projectId?: string) => {
    setSidebarOpen(false);
    writeLocation({ kind: 'draft' }, 'push');
    showDraft(projectId ?? null);
  }, [showDraft]);

  const renameChat = useCallback(async (id: string, title: string) => {
    try {
      const session = await patchSession(id, { title });
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not rename the chat"));
    }
  }, [rememberSummary]);

  const deleteChat = useCallback(async (id: string) => {
    try {
      if (streamsRef.current[id]) {
        abortsRef.current.get(id)?.abort();
        void cancelChat(id);
      }
      clearTerminal(id);
      await deleteSession(id);
      const remaining = sessionsRef.current.filter((item) => item.id !== id && !item.botConversation?.participants.includes(id));
      setSessions(remaining);
      if (activeId.current && !remaining.some((item) => item.id === activeId.current)) {
        if (remaining[0]) {
          const nextId = remaining[0].id;
          activeId.current = nextId;
          const next = await getSession(nextId);
          if (activeId.current !== nextId) return;
          setActive(next);
          if (!settingsOpenRef.current) writeLocation({ kind: 'chat', id: nextId }, 'push');
        } else {
          activeId.current = null;
          setActive(null);
          if (!settingsOpenRef.current) writeLocation({ kind: 'draft' }, 'push');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not delete the chat"));
    }
  }, [clearTerminal]);

  const setSessionModel = useCallback(async (provider: ProviderKind, model: string) => {
    if (!active) {
      setDraftProfile({ provider, model, host: '' });
      return;
    }
    try {
      const session = await patchSession(active.id, { profile: { provider, model } });
      if (activeId.current !== session.id) {
        setSessions((current) =>
          [toSummary(session), ...current.filter((item) => item.id !== session.id)].sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt),
          ),
        );
        return;
      }
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the model"));
    }
  }, [active, rememberSummary]);

  const setSessionEffort = useCallback(async (effort: ReasoningEffort | null) => {
    if (!active) {
      setDraftEffort(effort);
      return;
    }
    try {
      const session = await patchSession(active.id, { reasoningEffort: effort });
      if (activeId.current !== session.id) return;
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change reasoning effort"));
    }
  }, [active, rememberSummary]);

  const setSessionServiceTier = useCallback(async (tier: ServiceTier | null) => {
    if (!active) {
      setDraftServiceTier(tier);
      return;
    }
    try {
      const session = await patchSession(active.id, { serviceTier: tier });
      if (activeId.current !== session.id) return;
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change service tier"));
    }
  }, [active, rememberSummary]);

  const runSend = useCallback(async (content: string, clearDraft = true) => {
    const trimmed = content.trim();
    if (!trimmed || active?.botConversation) return;
    if (active && streamsRef.current[active.id]) return;
    setError(null);

    let session = active;
    try {
      if (!session) {
        const chosen = draftProfileRef.current?.model ? draftProfileRef.current : settings.defaultProfile;
        if (!chosen?.model) {
          setError(t("Choose a model for this chat"));
          setDraft(trimmed);
          return;
        }
        const effort = draftEffortRef.current;
        const reasoningEffort =
          effort && catalogSupportsEffort(chosen.provider, chosen.model, catalogRef.current) ? effort : undefined;
        const serviceTier = draftServiceTierRef.current ?? undefined;
        session = await createSession({
          provider: chosen.provider,
          model: chosen.model,
          reasoningEffort,
          serviceTier,
          projectId: draftProjectIdRef.current ?? undefined,
          // Picker choice, applied once when the session is born.
          agentId: draftAgentIdRef.current || undefined,
          policyId: (() => {
            const chosen = agentsRef.current.find((agent) => agent.id === draftAgentIdRef.current);
            if (!chosen || chosen.policies.length < 2) return undefined;
            return draftPolicyIdRef.current || chosen.defaultPolicy;
          })(),
        });
        setDraftProjectId(null);
        setDraftProfile(null);
        setDraftEffort(null);
        setDraftServiceTier(null);
        setSessions((current) => [toSummary(session as StoredSession), ...current]);
        if (activeId.current !== null) return;
        activeId.current = session.id;
        setActive(session);
        writeLocation({ kind: 'chat', id: session.id }, 'push');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not start a chat"));
      return;
    }
    if (!session.profile.model.trim()) {
      setError(t("Choose a model for this chat"));
      setDraft(trimmed);
      return;
    }

    const sessionId = session.id;
    const startedAt = Date.now();
    const contextSummary = isContextSummary(trimmed);
    activeMessagesRef.current = session.messages.length;
    const controller = new AbortController();
    abortsRef.current.set(sessionId, controller);
    clearTerminal(sessionId);
    if (clearDraft) setDraft('');
    setStreams((current) => ({
      ...current,
      [sessionId]: {
        sessionId,
        userContent: contextSummary ? '' : trimmed,
        content: '',
        reasoning: '',
        phase: contextSummary ? 'summarizing' : null,
        activity: [],
        blocks: [],
      },
    }));

    let resume = false;
    let stoppedByUser = false;

    try {
      // Failures mid-turn are handled by applyStreamEvent; the host persists the
      // partial turn so the transcript never resets to the start of the turn.
      await streamMessage(sessionId, trimmed, controller.signal, (event) => {
        if (event.event === 'done' && event.data.aborted) stoppedByUser = true;
        applyStreamEvent(sessionId, startedAt, event);
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        // The local fetch was torn down (navigation, chat delete, or the
        // force-stop escape hatch) before the host's `done {aborted}` arrived,
        // so that authoritative event was missed. Poll the persisted session
        // instead of trusting a single read: the host may still be writing the
        // partial turn, and one immediate read usually returns the pre-turn
        // snapshot - which is exactly the "rewound to my last prompt" bug.
        markTerminal(sessionId, 'cancelled');
        try {
          await reloadAfterAbort(sessionId);
        } catch {
          // the stopped turn stays in memory until the next open
        }
      } else if (cause instanceof ApiError && cause.status === 409) {
        // A turn is already running for this session (the page was refreshed
        // mid-turn before reattaching). Keep the typed message and resume the
        // running turn instead of surfacing "Chat already running".
        resume = true;
        setDraft((current) => current || trimmed);
      } else {
        markTerminal(sessionId, 'error');
        if (activeId.current === sessionId) setError(cause instanceof Error ? cause.message : 'Chat failed');
        try {
          const fresh = await getSession(sessionId);
          rememberSummary(fresh);
        } catch {
          // keep the optimistic view if the reload fails
        }
      }
    } finally {
      // `done`/`error` already removed the live bubble via applyStreamEvent, so
      // this is a no-op for a normally finished turn. It only clears the
      // optimistic entry when we detached early (force-stop, navigation) or when
      // reattaching to an already-running turn (the resume path recreates it).
      setStreams((current) => {
        if (!current[sessionId]) return current;
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      if (abortsRef.current.get(sessionId) === controller) abortsRef.current.delete(sessionId);
      // A generated title may land after the turn closed its live chat, so the
      // catalog is re-read once from the host index.
      void listSessions().then(setSessions).catch(() => undefined);
    }

    // Reattach outside the send lifecycle so the cleanup above does not cancel
    // the resumed stream.
    if (resume) await resumeLive(sessionId);
  }, [active, agents, applyStreamEvent, rememberSummary, reloadAfterAbort, resumeLive, settings.defaultProfile, markTerminal, clearTerminal]);

  const send = useCallback(async (content?: string) => {
    await runSend(typeof content === 'string' ? content : draftRef.current);
  }, [runSend]);

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

  const saveProvider = useCallback(async (kind: ProviderKind, patch: ProviderUpdate) => {
    const updated = await putProvider(kind, patch);
    setProviders((current) => current.map((item) => (item.kind === kind ? updated : item)));
  }, []);

  const addCatalogModel = useCallback(async (
    provider: ProviderKind,
    model: string,
    name: string,
    contextLength?: number,
    supportsReasoningEffort?: boolean,
  ) => {
    setCatalog(await addCatalogEntry(provider, model, name, contextLength, supportsReasoningEffort));
  }, []);

  const removeCatalogModel = useCallback(async (slug: string) => {
    setCatalog(await removeCatalogEntry(slug));
  }, []);

  const updateCatalogContextLimit = useCallback(async (slug: string, contextLength: number | null) => {
    setCatalog(await updateCatalogContextLength(slug, contextLength));
  }, []);

  const updateCatalogMaxContextMode = useCallback(async (slug: string, enabled: boolean) => {
    setCatalog(await updateCatalogMaxContext(slug, enabled));
  }, []);

  const refreshModels = useCallback(async (kind: ProviderKind, draftKeys?: { apiKey?: string; host?: string }) => {
    const models = await listProviderModels(kind, draftKeys);
    if (kind === 'ollama') {
      const refreshedProviders = await listProviders();
      setProviders(refreshedProviders);
    }
    setCatalog(await listCatalog());
    return models;
  }, []);

  const configuredModels = useMemo(() => {
    const rows: ModelProfile[] = [];
    for (const provider of providers) {
      if (!provider.enabled) continue;
      if (isLocalProvider(provider.kind)) {
        if (!provider.model.trim()) continue;
        rows.push({ provider: provider.kind, model: provider.model, host: provider.host });
        continue;
      }
      for (const entry of catalog) {
        if (entry.provider !== provider.kind) continue;
        rows.push({ provider: entry.provider, model: entry.model, host: provider.host });
      }
    }
    return rows;
  }, [providers, catalog]);

  const openSettings = useCallback((tab: SettingsTab = 'general') => {
    // Like any navigation, opening settings closes the mobile drawer so it never covers the page.
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

  const closeSettings = useCallback(() => {
    const id = activeId.current;
    writeLocation(id ? { kind: 'chat', id } : { kind: 'draft' }, 'push');
    setSettingsOpen(false);
  }, []);

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

  const togglePlanTodo = useCallback(async (todoId: string, status: PlanStatus) => {
    const current = activeId.current;
    const snapshot = current ? plans[current] : null;
    if (!current || !snapshot) return;

    try {
      const next = await putPlanTodo(current, todoId, { status, revision: snapshot.revision });
      setPlans((existing) => ({ ...existing, [current]: next }));
    } catch (cause) {
      setError(reportError(cause));
      // A stale revision means the model or another window moved the plan on. The
      // local snapshot is now behind, so re-read it: without this the next click
      // would send the same stale revision and fail the same way, leaving the
      // checkbox unusable until the chat was reopened.
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const view = await getPlan(current);
          if (activeId.current === current) {
            if (view) setPlans((existing) => ({ ...existing, [current]: view }));
            else setPlans((existing) => {
              const next = { ...existing };
              delete next[current];
              return next;
            });
          }
        } catch {
          // The plan could not be re-read; the message above already says what went wrong.
        }
      }
    }
  }, [plans]);

  const openPlanPanel = useCallback(async () => {
    const current = activeId.current;
    if (!current) return;
    setPlanPanelOpen(true);
    setPlanPanelDismissed((dismissed) => {
      const next = { ...dismissed };
      delete next[current];
      return next;
    });
    await loadPlanPanel(current);
  }, [loadPlanPanel]);

  const closePlanPanel = useCallback(() => {
    const current = activeId.current;
    setPlanPanelOpen(false);
    // Closing is remembered per chat, so the panel does not keep re-opening
    // itself on the next plan write of a chat the user has put away.
    if (current) setPlanPanelDismissed((existing) => ({ ...existing, [current]: true }));
  }, []);

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
    assignChatToProject,
    openChat,
    renameChat,
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

