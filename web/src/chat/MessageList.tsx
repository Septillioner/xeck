import type { ToolUsageViewMode, TranscriptBlock, TranscriptMessage } from '../../../shared/types.ts';
import { MessageView, TimelineBlocks } from './messages/MessageView.tsx';
import type { ActivityCall } from './activity-calls.ts';
import type { ActivityLine, RateLimitWait } from './messages/types.ts';
import type { ComponentProps } from 'react';
import { useStreamRevealLength } from '../ui/use-typed-text.ts';

export function MessageList({
  messages,
  showReasoning,
  streaming,
  revealChars,
  debug,
  selectedCallId,
  onSelectCall,
  onRespondDialog,
  onOpenSubagent,
  hideToolUsages,
  toolUsageViewMode,
  calls,
}: {
  messages: TranscriptMessage[];
  showReasoning: boolean;
  hideToolUsages: boolean;
  toolUsageViewMode: ToolUsageViewMode;
  calls: Map<string, ActivityCall[]>;
  streaming: {
    content: string;
    reasoning: string;
    phase: string | null;
    activity: ActivityLine[];
    toolCalls?: ActivityCall[];
    blocks: TranscriptBlock[];
    rateLimit?: RateLimitWait | null;
    stopping?: boolean;
  } | null;
  /** Characters of the streamed text to show; the answer is typed out. */
  revealChars?: number;
  debug: boolean;
  selectedCallId: string | null;
  onSelectCall: (callId: string) => void;
  onOpenSubagent: (sessionId: string) => void;
  onRespondDialog?: (dialogId: string, response: { approved?: boolean; response?: string }) => void;
}) {
  return (
    <div className="messages">
      {messages.map((message) => (
        <MessageView
          key={message.id}
          message={message}
          showReasoning={showReasoning}
          debug={debug}
          selectedCallId={selectedCallId}
          onSelectCall={onSelectCall}
          onRespondDialog={onRespondDialog}
          onOpenSubagent={onOpenSubagent}
          hideToolUsages={hideToolUsages}
          toolUsageViewMode={toolUsageViewMode}
          toolCalls={calls.get(message.id)}
        />
      ))}
      {streaming && (
          <StreamingResponse
            content={streaming.content}
            blocks={streaming.blocks}
            showReasoning={showReasoning}
            streaming
            revealChars={revealChars}
            debug={debug}
            selectedCallId={selectedCallId}
            onSelectCall={onSelectCall}
            onRespondDialog={onRespondDialog}
            onOpenSubagent={onOpenSubagent}
            hideToolUsages={hideToolUsages}
            toolUsageViewMode={toolUsageViewMode}
            toolCalls={streaming.toolCalls}
          />
      )}
    </div>
  );
}

/** Reveal ticks only redraw the live response, leaving the chat shell alone. */
function StreamingResponse({ content, revealChars, ...props }: ComponentProps<typeof TimelineBlocks> & { content: string }) {
  const revealed = useStreamRevealLength(content);
  return (
    <article className={content ? 'assistant streaming' : 'assistant'}>
      <TimelineBlocks {...props} revealChars={revealChars ?? revealed} />
    </article>
  );
}
