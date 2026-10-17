import { CONTEXT_PART_KEYS, type ContextParts, type TokenUsage } from '../../../shared/types.ts';

/** How full the window is, so the UI can warn before the provider refuses a request. */
export type ContextPressureLevel = 'ok' | 'elevated' | 'critical';

const ELEVATED_RATIO = 0.7;
const CRITICAL_RATIO = 0.9;

export function contextMeterValues(
  usage: TokenUsage,
  limit: number | undefined,
  contextParts: ContextParts | undefined,
) {
  const current = count(usage.promptTokens);
  const maximum = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : undefined;
  const ratio = maximum ? Math.min(1, current / maximum) : null;
  const parts = CONTEXT_PART_KEYS.map((key) => ({ key, tokens: count(contextParts?.[key] ?? 0) }))
    .filter((part) => part.tokens > 0);
  const sum = parts.reduce((total, part) => total + part.tokens, 0);
  // Keep the breakdown and ring on the same scale even for legacy/stale parts.
  const normalized = sum > 0
    ? parts.map((part) => ({ ...part, tokens: part.tokens * current / sum }))
    : current > 0 ? [{ key: 'conversation' as const, tokens: current }] : [];
  return {
    current,
    maximum,
    ratio,
    percent: ratio === null ? null : Math.round(ratio * 1000) / 10,
    level: pressureLevel(ratio),
    parts: normalized.map((part) => ({
      ...part,
      fraction: ratio !== null && current > 0 ? part.tokens / current * ratio : 0,
    })),
  };
}

/** `null` when the window size is unknown - there is nothing to compare against. */
function pressureLevel(ratio: number | null): ContextPressureLevel | null {
  if (ratio === null) return null;
  if (ratio > CRITICAL_RATIO) return 'critical';
  if (ratio >= ELEVATED_RATIO) return 'elevated';
  return 'ok';
}

function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}