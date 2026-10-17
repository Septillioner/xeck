import type { AgentStreamEvent } from 'poyraz';
import type { ContextParts } from '../../../shared/types.ts';

type LibraryContextUsage = Extract<AgentStreamEvent, { type: 'context.usage' }>;

/**
 * A `context.usage` event enriched by the host with a per-part breakdown of the
 * prompt window. `parts` is host data: the library reports token totals, the host
 * owns what the prompt is made of (system prompt, rules, skills, MCP schemas).
 */
export type ContextUsageEvent = LibraryContextUsage & { parts?: ContextParts };

/** Every event the host streams to the browser. */
export type HostStreamEvent = ContextUsageEvent | Exclude<AgentStreamEvent, { type: 'context.usage' }>;

/** Attach the context breakdown to a library usage event. */
export function withContextParts(event: LibraryContextUsage, parts: ContextParts): ContextUsageEvent {
  return { ...event, parts };
}