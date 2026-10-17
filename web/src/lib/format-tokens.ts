import type { StoredSession, TokenUsage } from '../../../shared/types.ts';

const TOKEN_SCALE = 1000;
const TOKEN_TENTHS = 10;
const MS_PER_SECOND = 1000;

export function formatTokenCount(value: number): string {
  if (value < TOKEN_SCALE) return String(Math.round(value));
  const scaled = value / TOKEN_SCALE;
  const rounded = scaled >= TOKEN_TENTHS ? Math.round(scaled) : Math.round(scaled * TOKEN_TENTHS) / TOKEN_TENTHS;
  return `${rounded}k`;
}

export function formatTokenSpeed(completionTokens: number, durationMs: number): string | null {
  if (durationMs <= 0) return null;
  const perSecond = completionTokens / (durationMs / MS_PER_SECOND);
  return `${Math.round(perSecond)} tok/s`;
}

export function sessionWithUsage(session: StoredSession, reported: TokenUsage | undefined, startedAt: number): StoredSession {
  if (session.lastUsage || !reported) return session;
  const turn = normalizeTurn(reported);
  return {
    ...session,
    lastUsage: turn,
    usage: session.usage ?? turn,
    lastDurationMs: session.lastDurationMs && session.lastDurationMs > 0 ? session.lastDurationMs : Date.now() - startedAt,
  };
}

function normalizeTurn(usage: TokenUsage): TokenUsage {
  const next: TokenUsage = {
    promptTokens: count(usage.promptTokens),
    completionTokens: count(usage.completionTokens),
    totalTokens: count(usage.totalTokens),
  };
  const cached = count(usage.cachedTokens);
  if (cached > 0) next.cachedTokens = cached;
  return next;
}

function count(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}
