import { t } from '../i18n/core.ts';
import { activityBaseLabel } from '../../../shared/activity.ts';
import type { ToolUsageViewMode, TranscriptBlock, TranscriptToolBlock } from '../../../shared/types.ts';
import type { ActivityCall } from './activity-calls.ts';
import type { BotMood } from '../state/mood.ts';

export function toolFailed(tool: TranscriptToolBlock): boolean {
  return tool.label.endsWith(' failed') || Boolean(tool.terminal && !tool.terminal.ok);
}

export function toolDefaultOpen(tool: TranscriptToolBlock, mode: ToolUsageViewMode): boolean {
  return mode === 'detailed' || (mode === 'balanced' && (Boolean(tool.change) || toolFailed(tool)));
}

/** Counts only observable activity; shell commands and opaque MCP reads aren't guessed. */
export function toolUsageSummary(tools: TranscriptToolBlock[], calls: ActivityCall[] = []): string {
  const reads = new Set<string>();
  let added = 0;
  let removed = 0;
  let addedPartial = false;
  let removedPartial = false;
  let failures = 0;
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.callId)) continue;
    seen.add(tool.callId);
    const call = calls.find((item) => item.id === tool.callId);
    if (toolFailed({ ...tool, terminal: tool.terminal ?? call?.terminal })) { failures++; continue; }
    if (tool.pending) continue;
    const label = activityBaseLabel(tool.label);
    if (/^File · (?:read file|read_file)(?: · |$)/i.test(label)) {
      const path = call?.args.path;
      const labelPath = label.split(' · ').slice(2).filter((part) => !/^(?:L\d|from line |through line )/.test(part)).join(' · ');
      const readPath = typeof path === 'string' && path.trim() ? path.trim() : labelPath;
      if (readPath) reads.add(readPath);
    }
    const change = tool.change ?? call?.change;
    if (!change) continue;
    const lines = change.diff?.split('\n') ?? [];
    added += change.addedLines ?? lines.filter((line) => line.startsWith('+') && !line.startsWith('+++ ')).length;
    removed += change.removedLines ?? lines.filter((line) => line.startsWith('-') && !line.startsWith('--- ')).length;
    addedPartial ||= change.addedLines === undefined && Boolean(change.truncated);
    removedPartial ||= change.removedLines === undefined && Boolean(change.truncated);
  }
  const parts = [t(seen.size === 1 ? '{count} tool' : '{count} tools', { count: seen.size })];
  if (reads.size) parts.push(t(reads.size === 1 ? '{count} file read' : '{count} files read', { count: reads.size }));
  if (added) parts.push(t(added === 1 ? '{count} line added' : '{count} lines added', { count: `${added}${addedPartial ? '+' : ''}` }));
  if (removed) parts.push(t(removed === 1 ? '{count} line removed' : '{count} lines removed', { count: `${removed}${removedPartial ? '+' : ''}` }));
  if (failures) parts.push(t('{count} failed', { count: failures }));
  return parts.join(' · ');
}

export interface ActivitySignal {
  phase: string | null;
  blocks: TranscriptBlock[];
  stopping?: boolean;
  rateLimit?: { retryAt: number } | null;
}

export function currentActivity(signal: ActivitySignal): { label: string; mood: BotMood } {
  if (signal.stopping) return { label: "Stopping · saving progress", mood: 'waiting' };
  if (signal.blocks.some((block) => block.kind === 'dialog' && !block.resolved)) {
    return { label: "Waiting for your input", mood: 'waiting' };
  }
  if (signal.rateLimit) return { label: "Waiting to retry", mood: 'waiting' };
  if (signal.phase === 'summarizing' || signal.phase === 'summarized') {
    return { label: "Summarizing context", mood: 'thinking' };
  }
  const pending = signal.blocks.filter((block): block is TranscriptToolBlock => block.kind === 'tool' && block.pending).at(-1);
  if (pending) {
    const label = activityBaseLabel(pending.label);
    let description = 'Using tools';
    if (pending.change || /^File · (?:Write|Replace|Move|Delete|Create)/i.test(label)) description = 'Editing files';
    else if (/^File · (?:Read|read_file)/i.test(label)) description = 'Reading files';
    else if (label.startsWith('File · ')) description = 'Exploring files';
    else if (label.startsWith('Terminal · ')) description = 'Running a command';
    else if (label.startsWith('Skill · ')) description = 'Loading skills';
    else if (label.startsWith('Memory · ')) description = /search|read|list|get/i.test(label) ? 'Exploring memories' : 'Updating memory';
    else if (label.startsWith('Rule · ')) description = 'Working with rules';
    else if (/plan/i.test(label)) description = 'Updating the plan';
    return { label: description, mood: 'working' };
  }
  const last = signal.blocks.at(-1);
  if (last?.kind === 'text' && last.text) return { label: "Writing a response", mood: 'thinking' };
  return { label: "Thinking", mood: 'thinking' };
}
