import { activityBaseLabel, activityLabel } from '../../../shared/activity.ts';
import type { FileChange, LibraryMessage, TerminalResult, TranscriptMessage } from '../../../shared/types.ts';
import { messageBlocks } from '../../../shared/transcript.ts';

export interface ActivityCall {
  id: string;
  label: string;
  args: Record<string, unknown>;
  result: string | null;
  pending: boolean;
  change?: FileChange;
  terminal?: TerminalResult;
}

export function callsForMessages(messages: TranscriptMessage[], library: LibraryMessage[]): Map<string, ActivityCall[]> {
  const libraryCalls = callsFromLibrary(library);
  const libraryByLabel = new Map<string, ActivityCall[]>();
  for (const call of libraryCalls) {
    const rows = libraryByLabel.get(call.label) ?? [];
    rows.push(call);
    libraryByLabel.set(call.label, rows);
  }
  const assigned = new Map<string, ActivityCall[]>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    // New timeline messages carry their own call ids + results; only enrich
    // args/terminal from the library when the ids line up.
    if (message.blocks?.length) {
      const blocks = messageBlocks(message);
      const rows: ActivityCall[] = [];
      blocks.forEach((block) => {
        if (block.kind !== 'tool') return;
        const enriched = libraryCalls.find((call) => call.id === block.callId);
        rows.push({
          id: block.callId,
          label: block.label,
          args: enriched?.args ?? {},
          result: enriched?.result ?? null,
          pending: block.pending,
          change: block.change ?? enriched?.change ?? message.changes?.[rows.length],
          terminal: block.terminal ?? enriched?.terminal,
        });
      });
      if (rows.length > 0) assigned.set(message.id, rows);
      continue;
    }
    if (!message.activity?.length) continue;
    const rows: ActivityCall[] = [];
    const used = new Set<ActivityCall>();
    for (const label of message.activity) {
      const base = activityBaseLabel(label);
      const candidate = (libraryByLabel.get(base) ?? []).find((call) => !used.has(call));
      if (!candidate) {
        rows.push({ id: `${message.id}:${rows.length}`, label, args: {}, result: null, pending: false, change: message.changes?.[rows.length] });
        continue;
      }
      used.add(candidate);
      rows.push({ ...candidate, label, change: candidate.change ?? message.changes?.[rows.length] });
    }
    assigned.set(message.id, rows);
  }
  return assigned;
}

function callsFromLibrary(messages: LibraryMessage[]): ActivityCall[] {
  const calls: ActivityCall[] = [];
  const byId = new Map<string, ActivityCall>();
  for (const message of messages) {
    for (const call of readToolCalls(message.tool_calls)) {
      const label = activityLabel(call.name, call.args) ?? call.name;
      const row: ActivityCall = { id: call.id, label, args: call.args, result: null, pending: true };
      calls.push(row);
      byId.set(call.id, row);
    }
    if (message.role === 'tool' && message.tool_call_id) {
      const row = byId.get(message.tool_call_id);
      if (row) {
        row.result = message.content ?? '';
        row.pending = false;
        row.change = parseFileChange(row.result);
        row.terminal = parseTerminalResult(row.result);
      }
    }
  }
  return calls;
}

function parseFileChange(content: string): FileChange | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || !('change' in parsed)) return undefined;
    const change = (parsed as { change?: unknown }).change;
    if (!change || typeof change !== 'object' || !('operation' in change) || !('path' in change)) return undefined;
    return change as FileChange;
  } catch {
    return undefined;
  }
}

function parseTerminalResult(content: string): TerminalResult | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { command?: unknown }).command !== 'string') return undefined;
    const result = parsed as Partial<TerminalResult>;
    if (typeof result.cwd !== 'string' || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') return undefined;
    if (typeof result.ok !== 'boolean' || typeof result.timedOut !== 'boolean') return undefined;
    return result as TerminalResult;
  } catch {
    return undefined;
  }
}

function readToolCalls(value: unknown): { id: string; name: string; args: Record<string, unknown> }[] {
  if (!Array.isArray(value)) return [];
  const calls: { id: string; name: string; args: Record<string, unknown> }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    const name = typeof row.function?.name === 'string' ? row.function.name : '';
    const id = typeof row.id === 'string' ? row.id : '';
    if (!name || !id) continue;
    calls.push({ id, name, args: readArgs(row.function?.arguments) });
  }
  return calls;
}

function readArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}
