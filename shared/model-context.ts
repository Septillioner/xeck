import rules from './max-context-rules.json';

const overrides = rules.overrides.map(({ pattern, threshold }) => ({
  pattern: new RegExp(pattern, 'i'),
  threshold,
}));

/** Shared MAX thresholds for the switch, context meter and agent setup. */
export function maxContextThreshold(model: string): number | undefined {
  const modelId = model.trim().split('/').at(-1);
  if (!modelId) return undefined;
  return overrides.find(({ pattern }) => pattern.test(modelId))?.threshold ?? rules.defaultThreshold;
}

export function effectiveContextLength(
  model: string,
  contextLength: number | undefined,
  maxContextEnabled: boolean | undefined,
): number | undefined {
  const threshold = maxContextThreshold(model);
  if (!threshold || maxContextEnabled || !contextLength) return contextLength;
  return Math.min(contextLength, threshold);
}
