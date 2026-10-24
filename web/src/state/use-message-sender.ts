import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  AgentPublic,
  CatalogEntry,
  ModelProfile,
  ReasoningEffort,
  ServiceTier,
  SessionSummary,
  Settings,
  StoredSession,
} from '../../../shared/types.ts';
import { isContextSummary } from '../../../shared/commands.ts';
import { ApiError, createSession, getSession, listSessions, streamMessage, type StreamEvent } from '../api/client.ts';
import { t } from '../i18n/index.ts';
import { catalogSupportsEffort, toSummary } from './session-summary.ts';
import type { StreamingState } from './live-types.ts';
import type { TerminalMood } from './mood.ts';
import { writeLocation } from './location.ts';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useMessageSender({
  active,
  settings,
  sessionRefs,
  draftRefs,
  streamRuntime,
  setters,
  rememberSummary,
  reloadAfterAbort,
}: {
  active: StoredSession | null;
  settings: Settings;
  sessionRefs: {
    activeId: MutableRefObject<string | null>;
    activeMessages: MutableRefObject<number>;
    navigationVersion: MutableRefObject<number>;
    agents: MutableRefObject<AgentPublic[]>;
    catalog: MutableRefObject<CatalogEntry[]>;
  };
  draftRefs: {
    content: MutableRefObject<string>;
    profile: MutableRefObject<ModelProfile | null>;
    effort: MutableRefObject<ReasoningEffort | null>;
    serviceTier: MutableRefObject<ServiceTier | null>;
    projectId: MutableRefObject<string | null>;
    agentId: MutableRefObject<string>;
    policyId: MutableRefObject<string>;
  };
  streamRuntime: {
    aborts: MutableRefObject<Map<string, AbortController>>;
    streams: MutableRefObject<Record<string, StreamingState>>;
    applyEvent: (sessionId: string, startedAt: number, event: StreamEvent) => void;
    clearTerminal: (sessionId: string) => void;
    markTerminal: (sessionId: string, mood: TerminalMood) => void;
    resumeLive: (sessionId: string) => Promise<boolean>;
  };
  setters: {
    setDraft: StateSetter<string>;
    setDraftProjectId: StateSetter<string | null>;
    setDraftProfile: StateSetter<ModelProfile | null>;
    setDraftEffort: StateSetter<ReasoningEffort | null>;
    setDraftServiceTier: StateSetter<ServiceTier | null>;
    setSessions: StateSetter<SessionSummary[]>;
    setActive: StateSetter<StoredSession | null>;
    setStreams: StateSetter<Record<string, StreamingState>>;
    setError: StateSetter<string | null>;
  };
  rememberSummary: (session: StoredSession) => void;
  reloadAfterAbort: (sessionId: string) => Promise<void>;
}) {
  const creating = useRef(false);
  const runSend = useCallback(async (content: string, clearDraft = true, feedback?: { onAccepted?: () => void; onError?: (message: string) => void }) => {
    if (creating.current || (active && sessionRefs.activeId.current !== active.id)) { feedback?.onError?.(t('Wait for the current reply to finish')); return; }
    const version = sessionRefs.navigationVersion.current;
    let draftCleared = false;
    const trimmed = content.trim();
    if (!trimmed || active?.botConversation) return;
    if (active && streamRuntime.streams.current[active.id]) { feedback?.onError?.(t('Wait for the current reply to finish')); return; }
    setters.setError(null);

    let session = active;
    try {
      if (!session) {
        creating.current = true;
        const chosen = draftRefs.profile.current?.model ? draftRefs.profile.current : settings.defaultProfile;
        if (!chosen?.model) {
          creating.current = false;
          feedback?.onError?.(t('Choose a model for this chat'));
          setters.setError(t('Choose a model for this chat'));
          if (clearDraft) setters.setDraft(trimmed);
          return;
        }
        const effort = draftRefs.effort.current;
        const reasoningEffort =
          effort && catalogSupportsEffort(chosen.provider, chosen.model, sessionRefs.catalog.current) ? effort : undefined;
        const serviceTier = draftRefs.serviceTier.current ?? undefined;
        session = await createSession({
          provider: chosen.provider,
          model: chosen.model,
          reasoningEffort,
          serviceTier,
          projectId: draftRefs.projectId.current ?? undefined,
          agentId: draftRefs.agentId.current || undefined,
          policyId: (() => {
            const chosenAgent = sessionRefs.agents.current.find((agent) => agent.id === draftRefs.agentId.current);
            if (!chosenAgent || chosenAgent.policies.length < 2) return undefined;
            return draftRefs.policyId.current || chosenAgent.defaultPolicy;
          })(),
        });
        creating.current = false;
        setters.setSessions((current) => [toSummary(session as StoredSession), ...current]);
        if (sessionRefs.navigationVersion.current !== version || sessionRefs.activeId.current !== null) return;
        if (clearDraft) { setters.setDraft(''); draftCleared = true; }
        setters.setDraftProjectId(null);
        setters.setDraftProfile(null);
        setters.setDraftEffort(null);
        setters.setDraftServiceTier(null);

        sessionRefs.activeId.current = session.id;
        setters.setActive(session);
        writeLocation({ kind: 'chat', id: session.id }, 'push');
      }
    } catch (cause) {
      creating.current = false;
      if (sessionRefs.navigationVersion.current !== version) return;
      const message = cause instanceof Error ? cause.message : t('Could not start a chat');
      feedback?.onError?.(message);
      setters.setError(message);
      return;
    }
    if (!session.profile.model.trim()) {
      feedback?.onError?.(t('Choose a model for this chat'));
      setters.setError(t('Choose a model for this chat'));
      if (clearDraft) setters.setDraft(trimmed);
      return;
    }

    const sessionId = session.id;
    const startedAt = Date.now();
    const contextSummary = isContextSummary(trimmed);
    sessionRefs.activeMessages.current = session.messages.length;
    const controller = new AbortController();
    streamRuntime.aborts.current.set(sessionId, controller);
    streamRuntime.clearTerminal(sessionId);
    if (clearDraft && !draftCleared) setters.setDraft('');
    setters.setStreams((current) => ({
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
    let accepted = false;

    try {
      await streamMessage(sessionId, trimmed, controller.signal, (event) => {
        if (!accepted) { accepted = true; feedback?.onAccepted?.(); }
        if (event.event === 'done' && event.data.aborted) stoppedByUser = true;
        streamRuntime.applyEvent(sessionId, startedAt, event);
      });
    } catch (cause) {
      if (!accepted) feedback?.onError?.(cause instanceof Error ? cause.message : t('Request failed'));
      if (controller.signal.aborted) {
        streamRuntime.markTerminal(sessionId, 'cancelled');
        try {
          await reloadAfterAbort(sessionId);
        } catch {
          // Keep the stopped turn in memory when the persisted reload fails.
        }
      } else if (cause instanceof ApiError && cause.status === 409) {
        resume = true;
        if (clearDraft && sessionRefs.activeId.current === sessionId) setters.setDraft((current) => current || trimmed);
      } else {
        streamRuntime.markTerminal(sessionId, 'error');
        if (sessionRefs.activeId.current === sessionId) {
          setters.setError(cause instanceof Error ? cause.message : 'Chat failed');
        }
        try {
          const fresh = await getSession(sessionId);
          rememberSummary(fresh);
        } catch {
          // Keep the optimistic view if the reload fails.
        }
      }
    } finally {
      setters.setStreams((current) => {
        if (!current[sessionId]) return current;
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      if (streamRuntime.aborts.current.get(sessionId) === controller) {
        streamRuntime.aborts.current.delete(sessionId);
      }
      void listSessions().then(setters.setSessions).catch(() => undefined);
    }

    if (resume) await streamRuntime.resumeLive(sessionId);
  }, [
    active,
    settings.defaultProfile,
    sessionRefs,
    draftRefs,
    streamRuntime,
    setters,
    rememberSummary,
    reloadAfterAbort,
  ]);

  const send = useCallback(async (content?: string, options?: { preserveDraft?: boolean; onAccepted?: () => void; onError?: (message: string) => void }) => {
    await runSend(typeof content === 'string' ? content : draftRefs.content.current, !options?.preserveDraft, options);
  }, [runSend, draftRefs]);

  return { runSend, send };
}
