import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { attachToStream, getSession } from '../api/client.ts';
import type { PlanSnapshot, SessionSummary, StoredSession } from '../../../shared/types.ts';
import { terminalDuration, type TerminalMood } from './mood.ts';
import type { StreamingState } from './live-types.ts';
import { reportError } from './context.ts';
import { createStreamEventApplier } from './stream-events.ts';

type ActiveSessionRef = { current: string | null };
type DismissedPlanRef = { current: Record<string, true> };
type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface UseStreamRuntimeOptions {
  activeId: ActiveSessionRef;
  streams: Record<string, StreamingState>;
  setStreams: StateSetter<Record<string, StreamingState>>;
  setSessions: StateSetter<SessionSummary[]>;
  setActive: StateSetter<StoredSession | null>;
  setError: StateSetter<string | null>;
  setPlans: StateSetter<Record<string, PlanSnapshot>>;
  setPlanPanelOpen: StateSetter<boolean>;
  planPanelDismissedRef: DismissedPlanRef;
  rememberSummary: (session: StoredSession) => void;
  loadPlanPanel: (sessionId: string) => Promise<void>;
}

/** Owns the lifetime of live streams, terminal moods, and host reattachments. */
export function useStreamRuntime({
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
}: UseStreamRuntimeOptions) {
  const [terminals, setTerminals] = useState<Record<string, { mood: TerminalMood; expiresAt: number }>>({});
  const abortsRef = useRef(new Map<string, AbortController>());
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  const terminalTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => () => {
    for (const timer of terminalTimersRef.current.values()) clearTimeout(timer);
    for (const controller of abortsRef.current.values()) controller.abort();
  }, []);

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

  const applyStreamEvent = useMemo(
    () => createStreamEventApplier({
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
    [activeId, loadPlanPanel, markTerminal, planPanelDismissedRef, rememberSummary, setActive, setError, setPlanPanelOpen, setPlans, setSessions, setStreams],
  );

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
      // A turn can finish before attach completes, or the connection can close
      // without a terminal event. Refresh the persisted transcript in either case.
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
  }, [activeId, applyStreamEvent, clearTerminal, rememberSummary, setError, setStreams]);

  return { abortsRef, applyStreamEvent, clearTerminal, markTerminal, resumeLive, streamsRef, terminals };
}
