export type BotMood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'completed'
  | 'error'
  | 'cancelled';

export type TerminalMood = 'completed' | 'error' | 'cancelled';

export const COMPLETED_GLOW_MS = 4000;
export const ERROR_GLOW_MS = 6000;
export const CANCELLED_FADE_MS = 3000;

const THINKING_PHASE = 'thinking';

export interface MoodSignal {
  phase: string | null;
  reasoning: string;
  content: string;
  hasPendingActivity: boolean;
  hasPendingDialog: boolean;
  /** Provider is waiting out a rate-limit window and will retry on its own. */
  hasRateLimitWait?: boolean;
}

export function isTerminalMood(mood: BotMood): mood is TerminalMood {
  return mood === 'completed' || mood === 'error' || mood === 'cancelled';
}

export function terminalDuration(mood: TerminalMood): number {
  if (mood === 'completed') return COMPLETED_GLOW_MS;
  if (mood === 'error') return ERROR_GLOW_MS;
  return CANCELLED_FADE_MS;
}

// Single place that decides the live mood. A future annotate_lifecycle
// tool can feed an explicit override through this same function.
export function moodForSignal(signal: MoodSignal, annotated?: BotMood): BotMood {
  if (annotated && !isTerminalMood(annotated)) return annotated;
  if (signal.hasPendingDialog) return 'waiting';
  if (signal.hasRateLimitWait) return 'waiting';
  if (signal.hasPendingActivity) return 'working';
  if (signal.phase === THINKING_PHASE) return 'thinking';
  if (signal.phase !== null) return 'thinking';
  if (signal.reasoning.trim().length > 0 && signal.content.length === 0) return 'thinking';
  return 'thinking';
}

export function moodForTerminal(mood: TerminalMood): BotMood {
  return mood;
}

/**
 * The mood a plan step implies. A blocked step waits on something outside the
 * chat, a step in progress means the agent is working on it.
 */
export function planMood(plan: { todos: { status: string }[] } | null | undefined): BotMood | undefined {
  if (!plan) return undefined;
  if (plan.todos.some((todo) => todo.status === 'blocked')) return 'waiting';
  if (plan.todos.some((todo) => todo.status === 'in_progress')) return 'working';
  return undefined;
}


/** Live moods: the chat is running, so the row shows the busy spinner. */
export function isActiveMood(mood: BotMood): boolean {
  return mood === 'thinking' || mood === 'working' || mood === 'waiting';
}

/** Row label for a mood. The dot alone is enough in a narrow row, not in text. */
export function moodLabel(mood: BotMood): string {
  if (mood === 'thinking') return 'Thinking';
  if (mood === 'working') return 'Working';
  if (mood === 'waiting') return 'Waiting for input';
  if (mood === 'completed') return 'Completed';
  if (mood === 'error') return 'Failed';
  if (mood === 'cancelled') return 'Stopped';
  return 'Generating';
}