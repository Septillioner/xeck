import { t } from '../../i18n/index.ts';
import type { ToolUsageViewMode, TranscriptBlock, TranscriptMessage, TranscriptToolBlock } from '../../../../shared/types.ts';
import { messageBlocks } from '../../../../shared/transcript.ts';
import { Markdown } from '../Markdown.tsx';
import type { ActivityCall } from '../activity-calls.ts';
import { InteractiveDialogCard } from './DialogCard.tsx';
import { PlanCard } from './PlanCard.tsx';
import { Reasoning } from './StatusLine.tsx';
import { SubagentCard } from './SubagentCard.tsx';
import { revealedBlockText } from './reveal-text.ts';
import { CompactToolUsage, ToolUsage, type ToolInspectionProps } from './ToolUsage.tsx';

export interface ToolViewProps {
  hideToolUsages?: boolean;
  toolUsageViewMode?: ToolUsageViewMode;
  toolCalls?: ActivityCall[];
}

export function MessageView({
  message,
  showReasoning,
  debug,
  selectedCallId,
  onSelectCall,
  onRespondDialog,
  onOpenSubagent,
  hideToolUsages,
  toolUsageViewMode,
  toolCalls,
}: {
  message: TranscriptMessage;
  showReasoning: boolean;
  debug: boolean;
  selectedCallId: string | null;
  onSelectCall: (callId: string) => void;
  onOpenSubagent: (sessionId: string) => void;
  onRespondDialog?: (dialogId: string, response: { approved?: boolean; response?: string; selections?: string[]; other?: string }) => void;
} & ToolViewProps) {
  if (message.role === 'user') {
    const source = message.source;
    return (
      <article className="user-row">
        <div className="user-bubble">
          {source && (
            <button type="button" className="mb-2 block max-w-full truncate text-small text-muted hover:text-ink" onClick={() => onOpenSubagent(source.sessionId)}>
              {t("From")} {source.title}
            </button>
          )}
          <p>{message.content}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="assistant">
      {message.source && <button type="button" className="mb-2 text-small font-medium text-muted hover:text-ink" onClick={() => onOpenSubagent(message.source!.sessionId)}>{message.source.title}</button>}
      <TimelineBlocks
        blocks={messageBlocks(message)}
        showReasoning={showReasoning}
        debug={debug}
        selectedCallId={selectedCallId}
        onSelectCall={onSelectCall}
        onRespondDialog={onRespondDialog}
        onOpenSubagent={onOpenSubagent}
        hideToolUsages={hideToolUsages}
        toolUsageViewMode={toolUsageViewMode}
        toolCalls={toolCalls}
      />
    </article>
  );
}

export function TimelineBlocks({
  blocks,
  showReasoning,
  streaming,
  revealChars,
  debug,
  selectedCallId,
  onSelectCall,
  onRespondDialog,
  onOpenSubagent,
  hideToolUsages = false,
  toolUsageViewMode = 'balanced',
  toolCalls = [],
}: {
  blocks: TranscriptBlock[];
  showReasoning: boolean;
  streaming?: boolean;
  /** Characters of the text stream to show; the rest is still being typed. */
  revealChars?: number;
  debug: boolean;
  selectedCallId: string | null;
  onSelectCall: (callId: string) => void;
  onOpenSubagent: (sessionId: string) => void;
  onRespondDialog?: (dialogId: string, response: { approved?: boolean; response?: string; selections?: string[]; other?: string }) => void;
} & ToolViewProps) {
  // The streamed answer is typed out: text blocks are cut at the revealed
  // character count, in block order.
  const visibleText = revealChars === undefined ? null : revealedBlockText(blocks, revealChars);
  const hasSubagentCard = blocks.some((block) => block.kind === 'subagent');
  const visibleTool = (block: TranscriptBlock): block is TranscriptToolBlock =>
    block.kind === 'tool' && !(hasSubagentCard && block.label.startsWith('Subagent · Delegate tasks'));
  const tools = blocks.filter(visibleTool);
  const firstTool = blocks.findIndex(visibleTool);
  const inspection: ToolInspectionProps = { debug, selectedCallId, onSelectCall };
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'reasoning') {
          if (!showReasoning || !block.text) return null;
          const last = index === blocks.length - 1;
          return <Reasoning key={`reasoning-${index}`} text={block.text} live={streaming && last} />;
        }
        if (block.kind === 'tool') {
          if (!visibleTool(block)) return null;
          return (
            <div key={`tool-${block.callId}-${index}`}>
              {!hideToolUsages && (toolUsageViewMode === 'compact'
                ? index === firstTool && <CompactToolUsage tools={tools} calls={toolCalls} {...inspection} />
                : <ToolUsage key={`${toolUsageViewMode}:${block.callId}`} tool={block} call={toolCalls.find((call) => call.id === block.callId)} mode={toolUsageViewMode} {...inspection} />)}
              {block.plan ? <PlanCard plan={block.plan} /> : null}
            </div>
          );
        }
        if (block.kind === 'dialog') {
          // The question stays where it arrived in the tool sequence. While the
          // turn is live the card is interactive; after resolve (or in history)
          // it locks and shows the answer line instead of accepting input.
          const interactive = streaming && !block.resolved && Boolean(onRespondDialog);
          return (
            <InteractiveDialogCard
              key={`dialog-${block.dialogId}-${index}`}
              dialog={block.dialog}
              onRespond={interactive && onRespondDialog ? onRespondDialog : undefined}
              answered={!interactive}
              answer={block.answer}
            />
          );
        }
        if (block.kind === 'subagent') {
          return <SubagentCard key={`subagent-${block.sessionId}`} subagent={block} onOpen={onOpenSubagent} />;
        }
        const text = visibleText ? visibleText[index] : block.text;
        if (!text) return null;
        return <Markdown key={`text-${index}`} content={text} />;
      })}
    </>
  );
}
