import type { PlanTodo } from '../../../shared/types.ts';

/**
 * A turn that stops with open steps is continued, but only a fixed number of
 * times. After that the open list is handed back to the user instead of looping.
 *
 * Policy satırındaki `loop` yalnızca `continue-open-steps` adını taşır.
 */
export const MAX_TODO_CONTINUATIONS = 2;

/** Policy `loop` adının taşıdığı devam adı. */
export const CONTINUE_OPEN_STEPS_HOOK = 'continue-open-steps';

export type ContinuationDecision =
  | { kind: 'stop' }
  | { kind: 'continue'; message: string }
  | { kind: 'handoff'; open: string[] };

export interface ContinuationInput {
  /** Ids of todos that are still pending or in progress, in plan order. */
  open: string[];
  /** Continuations already spent in this turn. */
  continuations: number;
  /** Policy `loop` name. Absent means this policy does not continue open steps. */
  loop?: string;
  /** False once every client dropped the stream. */
  listening: boolean;
  /** Plan tail line such as "Plan 2/5, next t3", null when absent. */
  planLine: string | null;
}

export function todoContinuation(input: ContinuationInput): ContinuationDecision {
  if (input.loop !== CONTINUE_OPEN_STEPS_HOOK) return { kind: 'stop' };
  if (input.open.length === 0) return { kind: 'stop' };
  if (!input.listening) return { kind: 'stop' };
  if (input.continuations >= MAX_TODO_CONTINUATIONS) return { kind: 'handoff', open: input.open };
  return { kind: 'continue', message: openStepsMessage(input.open, input.planLine) };
}

export function openStepsMessage(open: string[], planLine: string | null): string {
  const steps = `Open steps: ${open.join(', ')}. Finish them or mark blocked/cancelled with a note.`;
  return planLine ? `${planLine}. ${steps}` : steps;
}

/**
 * The single line added to the summary message after the context was summarized
 * (`summarization.onSummarized`). It never goes into the system prompt, because the
 * plan is not part of every turn's prompt.
 */
export function planTailLine(todos: PlanTodo[], done: number, total: number): string | null {
  if (total === 0) return null;
  const next = todos.find((todo) => todo.status === 'in_progress')
    ?? todos.find((todo) => todo.status === 'pending');
  return next ? `Plan ${done}/${total}, next ${next.id}` : `Plan ${done}/${total}`;
}
