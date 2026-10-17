import { formatDialogAnswer } from '../../../shared/transcript.ts';
import { markActivityFailed } from '../../../shared/activity.ts';
import type { DialogResolution, SubagentUpdate, TranscriptBlock, UserDialog } from '../../../shared/types.ts';
import type { LiveActivity } from './live-types.ts';

export function appendLiveText(blocks: TranscriptBlock[], delta: string): TranscriptBlock[] {
  if (!delta) return blocks;
  const next = [...blocks];
  const last = next.at(-1);
  if (last?.kind === 'text') next[next.length - 1] = { kind: 'text', text: last.text + delta };
  else next.push({ kind: 'text', text: delta });
  return next;
}

export function appendLiveReasoning(blocks: TranscriptBlock[], delta: string): TranscriptBlock[] {
  if (!delta) return blocks;
  const next = [...blocks];
  const last = next.at(-1);
  if (last?.kind === 'reasoning') next[next.length - 1] = { kind: 'reasoning', text: last.text + delta };
  else next.push({ kind: 'reasoning', text: delta });
  return next;
}

export function appendLiveTool(blocks: TranscriptBlock[], callId: string, label: string): TranscriptBlock[] {
  return [...blocks, { kind: 'tool', callId, label, pending: true }];
}

export function upsertLiveSubagent(blocks: TranscriptBlock[], update: SubagentUpdate): TranscriptBlock[] {
  const index = blocks.findIndex((block) => block.kind === 'subagent' && block.sessionId === update.sessionId);
  const block = { kind: 'subagent' as const, ...update };
  if (index < 0) return [...blocks, block];
  return blocks.map((item, itemIndex) => itemIndex === index ? block : item);
}

/** A dialog interrupts the tool sequence: keep it where it arrived, not pinned on top. */
export function appendLiveDialog(blocks: TranscriptBlock[], dialog: UserDialog): TranscriptBlock[] {
  if (blocks.some((block) => block.kind === 'dialog' && block.dialogId === dialog.id)) return blocks;
  return [
    ...blocks,
    {
      kind: 'dialog',
      dialogId: dialog.id,
      dialog: { ...dialog, details: dialog.details ? { ...dialog.details } : undefined },
      resolved: false,
    },
  ];
}

/** Mark the chronological dialog block resolved so it renders as answered history. */
export function resolveLiveDialog(
  blocks: TranscriptBlock[],
  dialogId: string,
  resolution?: DialogResolution,
): TranscriptBlock[] {
  return blocks.map((block) => {
    if (block.kind !== 'dialog' || block.dialogId !== dialogId) return block;
    return { ...block, resolved: true, answer: formatDialogAnswer(resolution) };
  });
}

export function patchLiveTool(
  blocks: TranscriptBlock[],
  callId: string,
  patch: {
    pending: boolean;
    result?: string;
    change?: LiveActivity['change'];
    terminal?: LiveActivity['terminal'];
    plan?: LiveActivity['plan'];
    failed: boolean;
  },
): TranscriptBlock[] {
  return blocks.map((block) => {
    if (block.kind !== 'tool' || block.callId !== callId) return block;
    return {
      ...block,
      pending: patch.pending,
      label: patch.failed ? markActivityFailed(block.label) : block.label,
      ...(patch.change ? { change: patch.change } : {}),
      ...(patch.terminal ? { terminal: patch.terminal } : {}),
      ...(patch.plan ? { plan: patch.plan } : {}),
    };
  });
}
