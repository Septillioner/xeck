import type { FileChange, PlanSnapshot, TerminalResult } from '../../../../../shared/types.ts';

interface ToolResultDetails {
  change?: FileChange;
  terminal?: TerminalResult;
  plan?: PlanSnapshot;
}

/** Decode a tool result once, then extract the structured cards the host understands. */
export function parseToolResult(content?: string): ToolResultDetails {
  if (!content) return {};
  let payload: unknown;
  try { payload = JSON.parse(content); }
  catch { return {}; }
  if (!payload || typeof payload !== 'object') return {};

  const details: ToolResultDetails = {};
  const change = (payload as { change?: unknown }).change;
  if (change && typeof change === 'object' && 'operation' in change && 'path' in change) {
    details.change = change as FileChange;
  }
  const plan = (payload as { plan?: Partial<PlanSnapshot> }).plan;
  if (plan && typeof plan === 'object' && typeof plan.name === 'string'
    && typeof plan.revision === 'number' && Array.isArray(plan.todos)) {
    details.plan = plan as PlanSnapshot;
  }
  const terminal = payload as Partial<TerminalResult>;
  if (typeof terminal.command === 'string' && typeof terminal.cwd === 'string'
    && typeof terminal.stdout === 'string' && typeof terminal.stderr === 'string'
    && typeof terminal.ok === 'boolean' && typeof terminal.timedOut === 'boolean') {
    details.terminal = terminal as TerminalResult;
  }
  return details;
}
