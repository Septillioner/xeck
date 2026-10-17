import type { FileChange, TerminalResult } from '../../../../shared/types.ts';

export interface ActivityLine {
  label: string;
  pending?: boolean;
  callId?: string;
  change?: FileChange;
  terminal?: TerminalResult;
}

export interface RateLimitWait {
  attempt: number;
  delayMs: number;
  retryAt: number;
  reason?: string;
}
