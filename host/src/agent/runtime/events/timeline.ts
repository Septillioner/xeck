import { randomUUID } from 'node:crypto';
import { activityLabel, markActivityFailed } from '../../../../../shared/activity.ts';
import { blocksToLegacy, snapshotBlocks, formatDialogAnswer } from '../../../../../shared/transcript.ts';
import type {
  DialogResolution,
  FileChange,
  LibraryMessage,
  PlanSnapshot,
  StoredSession,
  SubagentUpdate,
  TerminalResult,
  TranscriptBlock,
  TranscriptMessage,
  UserDialog,
} from '../../../../../shared/types.ts';
import { saveSession } from '../../../stores/sessions.ts';

/**
 * Accumulates the streamed turn into transcript blocks. One builder per turn: text and
 * reasoning deltas extend the last block of their kind, and tool calls are placed by the
 * index captured when they started so a result can find its call again.
 */
export interface TimelineBuilder {
  blocks: TranscriptBlock[];
  appendText(delta: string): void;
  appendReasoning(delta: string): void;
  toolStart(toolCallId: string, toolName: string, args?: Record<string, unknown>): void;
  toolResult(
    toolCallId: string,
    failed: boolean,
    change?: FileChange & { toolCallId?: string },
    terminal?: TerminalResult,
    plan?: PlanSnapshot,
  ): void;
  dialogRequest(dialog: UserDialog): void;
  dialogResolved(dialogId: string, resolution?: DialogResolution): void;
  subagentUpdate(update: SubagentUpdate): void;
}

export function createTimeline(): TimelineBuilder {
  const blocks: TranscriptBlock[] = [];
  const toolIndex = new Map<string, number>();

  const appendText = (delta: string): void => {
    if (!delta) return;
    const last = blocks.at(-1);
    if (last?.kind === 'text') last.text += delta;
    else blocks.push({ kind: 'text', text: delta });
  };

  const appendReasoning = (delta: string): void => {
    if (!delta) return;
    const last = blocks.at(-1);
    if (last?.kind === 'reasoning') last.text += delta;
    else blocks.push({ kind: 'reasoning', text: delta });
  };

  const toolStart = (toolCallId: string, toolName: string, args?: Record<string, unknown>): void => {
    const label = activityLabel(toolName, args) ?? toolName;
    toolIndex.set(toolCallId, blocks.length);
    blocks.push({ kind: 'tool', callId: toolCallId, label, pending: true });
  };

  const toolResult = (
    toolCallId: string,
    failed: boolean,
    change?: FileChange & { toolCallId?: string },
    terminal?: TerminalResult,
    plan?: PlanSnapshot,
  ): void => {
    const index = toolIndex.get(toolCallId);
    if (index === undefined) return;
    const block = blocks[index];
    if (!block || block.kind !== 'tool') return;
    block.pending = false;
    if (failed) block.label = markActivityFailed(block.label);
    if (change) block.change = change;
    if (terminal) block.terminal = terminal;
    if (plan) block.plan = plan;
  };

  /**
   * A dialog (ask_question/approval) interrupts the tool sequence, so it is
   * recorded as its own block at the position it arrived. The block survives
   * finalize/persist, which is what keeps the question visible in its
   * chronological spot after the turn ends.
   */
  const dialogRequest = (dialog: UserDialog): void => {
    if (blocks.some((block) => block.kind === 'dialog' && block.dialogId === dialog.id)) return;
    blocks.push({
      kind: 'dialog',
      dialogId: dialog.id,
      dialog: { ...dialog, details: dialog.details ? { ...dialog.details } : undefined },
      resolved: false,
    });
  };

  const dialogResolved = (dialogId: string, resolution?: DialogResolution): void => {
    for (const block of blocks) {
      if (block.kind === 'dialog' && block.dialogId === dialogId) {
        block.resolved = true;
        block.answer = formatDialogAnswer(resolution);
      }
    }
  };

  const subagentUpdate = (update: SubagentUpdate): void => {
    const index = blocks.findIndex((block) => block.kind === 'subagent' && block.sessionId === update.sessionId);
    const block = { kind: 'subagent' as const, ...update };
    if (index < 0) blocks.push(block);
    else blocks[index] = block;
  };

  return { blocks, appendText, appendReasoning, toolStart, toolResult, dialogRequest, dialogResolved, subagentUpdate };
}

/**
 * The provider's final content is authoritative: streamed text blocks are dropped and the
 * resolved text is put back at the position the last one occupied, so tool calls that ran
 * after the text keep their order.
 */
export function finalizeBlocks(blocks: TranscriptBlock[], finalContent: string): TranscriptBlock[] {
  const next = snapshotBlocks(blocks);
  const streamedText = next
    .filter((block) => block.kind === 'text')
    .map((block) => (block.kind === 'text' ? block.text : ''))
    .join('');
  let lastTextAt = -1;
  next.forEach((block, index) => {
    if (block.kind === 'text') lastTextAt = index;
  });
  const cleaned: TranscriptBlock[] = next.filter((block) => block.kind !== 'text');
  const resolvedText = finalContent || streamedText;
  if (resolvedText) {
    const insertAt = lastTextAt < 0 ? cleaned.length : Math.min(Math.max(lastTextAt, 0), cleaned.length);
    cleaned.splice(insertAt, 0, { kind: 'text', text: resolvedText });
  }
  return cleaned;
}

export function assistantMessage(blocks: TranscriptBlock[]): TranscriptMessage {
  const { content, reasoning, activity, changes } = blocksToLegacy(blocks);
  return {
    id: randomUUID(),
    role: 'assistant',
    content,
    reasoning: reasoning.trim() ? reasoning : undefined,
    activity: activity.length > 0 ? activity : undefined,
    changes: changes.length > 0 ? changes : undefined,
    blocks: snapshotBlocks(blocks),
    createdAt: new Date().toISOString(),
  };
}

/** Stores a stopped or failed turn, keeping the assistant text the client already saw. */
export async function persistPartial(
  session: StoredSession,
  blocks: TranscriptBlock[],
  libraryMessages: LibraryMessage[],
): Promise<StoredSession> {
  const { content } = blocksToLegacy(blocks);
  const visible = blocks.some((block) => block.kind !== 'text' ? true : block.text.trim().length > 0);
  const nextLibrary = [...libraryMessages];
  if (visible && content.trim() && nextLibrary.at(-1)?.role !== 'assistant') {
    nextLibrary.push({ role: 'assistant', content });
  }
  session.libraryMessages = nextLibrary;
  if (visible) session.messages.push(assistantMessage(blocks));
  return saveSession(session);
}
