import type { ContinuationPolicy } from 'poyraz';
import { getLiveChat } from '../agent/runtime/events/live-chat.ts';
import { openTodoIds, planSnapshot } from './plan-store.ts';
import { readPlanDocument } from './plan-service.ts';
import {
  CONTINUE_OPEN_STEPS_HOOK,
  MAX_TODO_CONTINUATIONS,
  planTailLine,
  todoContinuation,
} from './continuation.ts';

/** `ContinuationOutcome.reason` of a turn that ended with open steps handed back to the user. */
export const OPEN_STEPS_HANDOFF = 'open-steps-handoff';

export interface OpenStepsState {
  /** Ids of todos that are still pending or in progress, in plan order. */
  open: string[];
  /** Plan tail line such as "Plan 2/5, next t3", null when absent. */
  planLine: string | null;
}

export interface OpenStepsDeps {
  /** The session's active plan, or null when it has none. */
  readState(sessionId: string): Promise<OpenStepsState | null>;
  /** False once every client dropped the stream. */
  isListening(sessionId: string): boolean;
  /** Called with the finished reply of a round the policy decided to continue. */
  onContinue?(sessionId: string, reply: string): void;
}

export async function readOpenStepsState(sessionId: string): Promise<OpenStepsState | null> {
  const stored = await readPlanDocument(sessionId);
  if (!stored) return null;
  const snapshot = planSnapshot(stored.plan);
  return {
    open: openTodoIds(stored.plan),
    planLine: planTailLine(stored.plan.todos, snapshot.done, stored.plan.todos.length),
  };
}

/**
 * The plan as one line for the summary message (`summarization.onSummarized`): the library
 * appends it to the end of the summary, so the plan survives the history it replaced.
 * Null when the session has no plan; the plan is never part of the system prompt.
 */
export async function readPlanSummaryLine(sessionId: string): Promise<string | null> {
  const stored = await readPlanDocument(sessionId);
  if (!stored) return null;
  const snapshot = planSnapshot(stored.plan);
  return planTailLine(snapshot.todos, snapshot.done, snapshot.total);
}

export function isLiveChatListening(sessionId: string): boolean {
  return (getLiveChat(sessionId)?.listeners.size ?? 0) > 0;
}

/**
 * The host's own continuation rule (plan follow-up) as a library `ContinuationPolicy`.
 * The library owns the loop and the `maxContinuations` cap; the decision itself is
 * still `todoContinuation`, so the rule and its tests did not move.
 */
export function createOpenStepsContinuation(
  deps: OpenStepsDeps = { readState: readOpenStepsState, isListening: isLiveChatListening },
): ContinuationPolicy {
  return {
    maxContinuations: MAX_TODO_CONTINUATIONS,
    async evaluate(context) {
      const sessionId = context.sessionId;
      if (!sessionId || context.signal?.aborted) return { kind: 'stop' };
      const state = await deps.readState(sessionId);
      const decision = todoContinuation({
        open: state?.open ?? [],
        continuations: context.continuations,
        loop: CONTINUE_OPEN_STEPS_HOOK,
        listening: deps.isListening(sessionId),
        planLine: state?.planLine ?? null,
      });
      if (decision.kind === 'continue') {
        deps.onContinue?.(sessionId, context.content);
        return { kind: 'continue', notice: decision.message };
      }
      if (decision.kind === 'handoff') {
        return { kind: 'stop', reason: OPEN_STEPS_HANDOFF, data: { open: decision.open } };
      }
      return { kind: 'stop' };
    },
  };
}
