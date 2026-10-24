import { activityLabel, markActivityFailed } from '../../../shared/activity.ts';
import type { PlanSnapshot, SessionSummary, StoredSession, TranscriptBlock } from '../../../shared/types.ts';
import type { StreamEvent } from '../api/client.ts';
import { sessionWithUsage } from '../lib/format-tokens.ts';
import type { LiveActivity, StreamingState } from './live-types.ts';
import { appendLiveDialog, appendLiveReasoning, appendLiveText, appendLiveTool, patchLiveTool, resolveLiveDialog, upsertLiveSubagent } from './stream-blocks.ts';

export interface StreamEventDeps {
  /** Reads the currently open session id without re-creating the callback. */
  readActiveId: () => string | null;
  setSessions: (updater: (current: SessionSummary[]) => SessionSummary[]) => void;
  setActive: (updater: (current: StoredSession | null) => StoredSession | null) => void;
  setStreams: (updater: (current: Record<string, StreamingState>) => Record<string, StreamingState>) => void;
  setError: (message: string | null) => void;
  rememberSummary: (session: StoredSession) => void;
  markTerminal: (sessionId: string, mood: 'completed' | 'error' | 'cancelled') => void;
  /** Stores the latest plan of a session; the card, mood and panel read it. */
  setPlan: (sessionId: string, plan: PlanSnapshot) => void;
}

/**
 * Reduces one host stream event into the live view. Shared by the send path and
 * by reattaching to a turn that is already running (e.g. after a refresh).
 */
export function createStreamEventApplier(deps: StreamEventDeps) {
  const { setSessions, setActive, setStreams, setError, rememberSummary, markTerminal } = deps;
  return function applyStreamEvent(sessionId: string, startedAt: number, event: StreamEvent): void {
    if (event.event === 'meta') {
      if (event.data.session) rememberSummary(event.data.session);
      setSessions((current) =>
        current.map((item) => (item.id === event.data.id ? { ...item, title: event.data.title } : item)),
      );
      setActive((current) =>
        current && current.id === event.data.id ? { ...current, title: event.data.title } : current,
      );
      return;
    }
    if (event.event === 'text.delta') {
      const delta = event.data.delta;
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        return { ...current, [sessionId]: { ...existing, content: existing.content + delta, blocks: appendLiveText(existing.blocks, delta), rateLimit: null } };
      });
      return;
    }
    if (event.event === 'reasoning.delta') {
      const delta = event.data.delta;
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        return { ...current, [sessionId]: { ...existing, reasoning: existing.reasoning + delta, blocks: appendLiveReasoning(existing.blocks, delta) } };
      });
      return;
    }
    if (event.event === 'subagent.update') {
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        return { ...current, [sessionId]: { ...existing, blocks: upsertLiveSubagent(existing.blocks, event.data) } };
      });
      return;
    }
    if (event.event === 'lifecycle') {
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        return { ...current, [sessionId]: { ...existing, phase: event.data.phase, rateLimit: null } };
      });
      return;
    }
    if (event.event === 'context.usage') {
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        const data = event.data;
        return {
          ...current,
          [sessionId]: {
            ...existing,
            contextUsage: {
              promptTokens: data.promptTokens,
              completionTokens: data.completionTokens,
              totalTokens: data.totalTokens,
              ...(data.cachedTokens ? { cachedTokens: data.cachedTokens } : {}),
            },
            ...(data.parts ? { contextParts: data.parts } : {}),
          },
        };
      });
      return;
    }
    if (event.event === 'rate_limit.wait') {
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        return {
          ...current,
          [sessionId]: {
            ...existing,
            rateLimit: {
              attempt: event.data.attempt,
              delayMs: event.data.delayMs,
              retryAt: event.data.retryAt,
              reason: event.data.reason,
            },
          },
        };
      });
      return;
    }
    if (event.event === 'rate_limit.resumed') {
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing?.rateLimit) return current;
        return { ...current, [sessionId]: { ...existing, rateLimit: null } };
      });
      return;
    }
    if (event.event === 'tool.call.start') {
      const label = activityLabel(event.data.toolName, event.data.args) ?? event.data.toolName;
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing || existing.activity.some((item) => item.id === event.data.toolCallId)) return current;
        return {
          ...current,
          [sessionId]: {
            ...existing,
            blocks: appendLiveTool(existing.blocks, event.data.toolCallId, label),
            activity: [
              ...existing.activity,
              { id: event.data.toolCallId, label, pending: true, args: event.data.args ?? {}, result: null },
            ],
          },
        };
      });
      return;
    }
    if (event.event === 'tool.call.result') {
      if (event.data.plan) deps.setPlan(sessionId, event.data.plan);
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        const failed = !event.data.ok;
        const patch = {
          pending: false,
          result: event.data.content,
          change: event.data.change,
          terminal: event.data.terminal,
          plan: event.data.plan,
          failed,
        };
        return {
          ...current,
          [sessionId]: {
            ...existing,
            blocks: patchLiveTool(existing.blocks, event.data.toolCallId, patch),
            activity: existing.activity.map((item) =>
              item.id === event.data.toolCallId
                ? {
                    ...item,
                    pending: false,
                    result: event.data.content ?? item.result,
                    change: event.data.change ?? item.change,
                    terminal: event.data.terminal ?? item.terminal,
                    plan: event.data.plan ?? item.plan,
                    label: event.data.ok ? item.label : markActivityFailed(item.label),
                  }
                : item,
            ),
          },
        };
      });
      return;
    }
    if (event.event === 'plan.updated') {
      deps.setPlan(sessionId, event.data.plan);
      return;
    }
    if (event.event === 'dialog.request') {
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        return {
          ...current,
          [sessionId]: {
            ...existing,
            dialog: event.data,
            blocks: appendLiveDialog(existing.blocks, event.data),
          },
        };
      });
      return;
    }
    if (event.event === 'dialog.resolved') {
      setStreams((current) => {
        const existing = current[sessionId];
        if (!existing) return current;
        return {
          ...current,
          [sessionId]: {
            ...existing,
            dialog: null,
            blocks: resolveLiveDialog(existing.blocks, event.data.id, event.data.resolution),
          },
        };
      });
      return;
    }
    if (event.event === 'done') {
      // The host reports what the turn consumed on every path, abort included, so
      // the session it sends back is authoritative here.
      const finished = sessionWithUsage(event.data.session, event.data.usage, startedAt);
      rememberSummary(finished);
      markTerminal(sessionId, event.data.aborted ? 'cancelled' : 'completed');
      setStreams((current) => {
        if (!current[sessionId]) return current;
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      return;
    }
    if (event.event === 'error') {
      markTerminal(sessionId, 'error');
      // Keep whatever streamed before the failure (tool calls, partial text).
      // The host persists that partial turn and returns it here so the chat
      // does not reset to the start of the turn on a rate-limit/TPM error.
      if (event.data.session) rememberSummary(event.data.session);
      if (deps.readActiveId() === sessionId) setError(event.data.message);
    }

  }
}
