import type { TokenUsage } from '../../../shared/types.ts';

export function normalizeUsage(usage: TokenUsage): TokenUsage {
  const next: TokenUsage = {
    promptTokens: count(usage.promptTokens),
    completionTokens: count(usage.completionTokens),
    totalTokens: count(usage.totalTokens),
  };
  const cached = count(usage.cachedTokens);
  if (cached > 0) next.cachedTokens = cached;
  return next;
}

export function addUsage(current: TokenUsage | undefined, turn: TokenUsage): TokenUsage {
  const base = current ?? emptyUsage();
  const cached = count(base.cachedTokens) + count(turn.cachedTokens);
  const next: TokenUsage = {
    promptTokens: base.promptTokens + turn.promptTokens,
    completionTokens: base.completionTokens + turn.completionTokens,
    totalTokens: base.totalTokens + turn.totalTokens,
  };
  if (cached > 0) next.cachedTokens = cached;
  return next;
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function count(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}
