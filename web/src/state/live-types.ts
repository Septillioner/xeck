import type {
  ContextParts,
  FileChange,
  PlanSnapshot,
  TerminalResult,
  TokenUsage,
  TranscriptBlock,
  UserDialog,
} from '../../../shared/types.ts';
import type { TerminalMood } from './mood.ts';

export interface LiveActivity {
  id: string;
  label: string;
  pending: boolean;
  args: Record<string, unknown>;
  result: string | null;
  change?: FileChange;
  terminal?: TerminalResult;
  /** Plan snapshot returned by a plan tool, drawn as the plan card. */
  plan?: PlanSnapshot;
}

export interface RateLimitWaitState {
  attempt: number;
  delayMs: number;
  retryAt: number;
  reason?: string;
}

export interface StreamingState {
  sessionId: string;
  userContent: string;
  content: string;
  reasoning: string;
  phase: string | null;
  activity: LiveActivity[];
  blocks: TranscriptBlock[];
  dialog?: UserDialog | null;
  /** Set while the provider waits out a TPM/RPM window before retrying. */
  rateLimit?: RateLimitWaitState | null;
  /** Live occupancy reported after each model request of the running turn. */
  contextUsage?: TokenUsage;
  contextParts?: ContextParts;
  /**
   * The user asked to stop the turn; the client keeps the SSE stream open so the
   * host can persist the partial turn and report it through `done {aborted}`.
   */
  stopping?: boolean;
}

export interface TerminalEntry {
  mood: TerminalMood;
  expiresAt: number;
}
