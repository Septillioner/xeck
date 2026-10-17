import { MAX_FILE_TOOL_RETURNED_BYTES } from '../../../infra/limits.ts';
import { InstructionRejected } from '../../../stores/instruction-store.ts';
import { MemoryRejected } from '../../../stores/memory-store.ts';
import { PlanRejected } from '../../../plans/plan-store.ts';
import { FileToolRejected } from '../../../tools/file-access.ts';
import type { ServerToolResult } from './types.ts';

/** Runs a store or tool call and turns a domain rejection into an error result. */
export async function runTool(task: () => Promise<unknown>): Promise<ServerToolResult> {
  try {
    return serverToolResult(await task());
  } catch (error) {
    if (
      error instanceof InstructionRejected
      || error instanceof FileToolRejected
      || error instanceof MemoryRejected
      || error instanceof PlanRejected
    ) {
      return serverToolResult({ error: error.message }, true);
    }
    throw error;
  }
}

/** MCP answers with content blocks, not a plain string. */
export function serverToolResult(value: unknown, isError = false): ServerToolResult {
  return {
    content: [{ type: 'text' as const, text: boundedJson(value) }],
    isError,
  };
}

/**
 * Tool output is fed back to the model, so an oversized payload has to shrink instead of
 * failing the turn. Diffs are trimmed first, then list-shaped results, before giving up.
 */
function boundedJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_FILE_TOOL_RETURNED_BYTES) return serialized;
  if (value && typeof value === 'object' && 'change' in value && value.change && typeof value.change === 'object') {
    const change = value.change as { diff?: unknown };
    if (typeof change.diff === 'string') {
      let diff = change.diff;
      while (diff.length > 0) {
        const candidate = JSON.stringify({ ...value, change: { ...change, diff, truncated: true } });
        if (Buffer.byteLength(candidate, 'utf8') <= MAX_FILE_TOOL_RETURNED_BYTES) return candidate;
        diff = diff.slice(0, Math.floor(diff.length * 0.8));
      }
    }
  }
  if (value && typeof value === 'object') {
    const shrunk = shrinkBoundedArray(value);
    if (shrunk) return shrunk;
  }
  return JSON.stringify({ error: 'Tool response exceeds the output limit.', truncated: true });
}

const BOUNDED_ARRAY_KEYS = ['entries', 'results', 'memories'] as const;

function shrinkBoundedArray(value: object): string | null {
  const record = value as Record<string, unknown>;
  for (const key of BOUNDED_ARRAY_KEYS) {
    const rows = record[key];
    if (!Array.isArray(rows)) continue;
    const next = [...rows];
    while (next.length > 0) {
      const candidate = JSON.stringify({ ...record, [key]: next, truncated: true });
      if (Buffer.byteLength(candidate, 'utf8') <= MAX_FILE_TOOL_RETURNED_BYTES) return candidate;
      next.pop();
    }
    return JSON.stringify({ [key]: [], truncated: true });
  }
  return null;
}

/** The MCP `$schema` keyword is noise for the model; everything else is passed through. */
export function parametersSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...schema };
  delete copy.$schema;
  return copy;
}

export function formatBlocks(content: unknown): string {
  if (!Array.isArray(content)) {
    return typeof content === 'string' ? content : JSON.stringify(content ?? '');
  }
  return content
    .map((block: { type?: string; text?: string; resource?: { text?: string; uri?: string } }) => {
      if (block?.type === 'text') return block.text ?? '';
      if (block?.type === 'resource' && block.resource) {
        return block.resource.text ?? `[resource: ${block.resource.uri}]`;
      }
      return `[${block?.type ?? 'unknown'} content]`;
    })
    .join('\n');
}
