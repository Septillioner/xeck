import type { DialogResolution, FileChange, TranscriptBlock, TranscriptMessage } from './types.ts';

export interface LegacyTranscript {
  content: string;
  reasoning: string;
  activity: string[];
  changes: FileChange[];
}

/** Split blocks back into the legacy flat fields (kept for backwards compat). */
export function blocksToLegacy(blocks: TranscriptBlock[]): LegacyTranscript {
  const content = blocks
    .filter((block) => block.kind === 'text')
    .map((block) => (block.kind === 'text' ? block.text : ''))
    .join('');
  const reasoning = blocks
    .filter((block) => block.kind === 'reasoning')
    .map((block) => (block.kind === 'reasoning' ? block.text : ''))
    .join('');
  const activity: string[] = [];
  const changes: FileChange[] = [];
  for (const block of blocks) {
    // Dialog blocks are chronological UI records; they belong to `blocks` only
    // and are deliberately absent from the legacy flat fields.
    if (block.kind !== 'tool') continue;
    activity.push(block.label);
    if (block.change) changes.push(block.change);
  }
  return { content, reasoning, activity, changes };
}

/** Old messages (no blocks) fall back to reasoning -> tools -> text order. */
export function legacyToBlocks(
  content: string,
  reasoning: string | undefined,
  activity: string[] | undefined,
  changes: FileChange[] | undefined,
): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  if (reasoning?.trim()) blocks.push({ kind: 'reasoning', text: reasoning });
  (activity ?? []).forEach((label, index) => {
    blocks.push({
      kind: 'tool',
      callId: `legacy:${index}`,
      label,
      pending: false,
      ...(changes?.[index] ? { change: changes[index] } : {}),
    });
  });
  if (content) blocks.push({ kind: 'text', text: content });
  return blocks;
}

/** Human-readable answer line for a dialog resolution; undefined is dismissed. */
export function formatDialogAnswer(resolution: DialogResolution | undefined): string {
  if (!resolution) return 'Dismissed';
  if (resolution.approved !== undefined) return resolution.approved ? 'Approved' : 'Rejected';
  const parts: string[] = [];
  if (resolution.response) parts.push(resolution.response);
  if (resolution.selections?.length) parts.push(resolution.selections.join(', '));
  if (resolution.other) parts.push(resolution.other);
  return parts.length > 0 ? parts.join(' · ') : 'Dismissed';
}

/** Return blocks for a message, deriving them for pre-timeline sessions. */
export function messageBlocks(message: TranscriptMessage): TranscriptBlock[] {
  if (message.blocks && message.blocks.length > 0) return message.blocks;
  return legacyToBlocks(message.content, message.reasoning, message.activity, message.changes);
}

export function snapshotBlocks(blocks: TranscriptBlock[]): TranscriptBlock[] {
  return blocks.map((block) => {
    if (block.kind === 'dialog') {
      const copy: TranscriptBlock = {
        kind: 'dialog',
        dialogId: block.dialogId,
        dialog: { ...block.dialog, details: block.dialog.details ? { ...block.dialog.details } : undefined },
        resolved: block.resolved,
        ...(block.answer ? { answer: block.answer } : {}),
      };
      return copy;
    }
    if (block.kind !== 'tool') return { ...block };
    const copy: TranscriptBlock = { ...block };
    if (block.change) copy.change = { ...block.change };
    if (block.terminal) copy.terminal = { ...block.terminal };
    // The plan snapshot is copied too, so a later live edit cannot rewrite history.
    if (block.plan) copy.plan = { ...block.plan, todos: block.plan.todos.map((todo) => ({ ...todo })) };
    return copy;
  });
}
