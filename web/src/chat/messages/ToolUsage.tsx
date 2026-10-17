import { useState } from 'react';
import { activityBaseLabel, isSkillOrMcpLabel } from '../../../../shared/activity.ts';
import type { ToolUsageViewMode, TranscriptToolBlock } from '../../../../shared/types.ts';
import { IconChat, IconChevron, IconFileText, IconFolder, IconMemory, IconServer, IconSpark, IconTerminal, IconWand } from '../../ui/icons.tsx';
import { BUTTON } from '../../ui/button-styles.ts';
import type { ActivityCall } from '../activity-calls.ts';
import { toolDefaultOpen, toolFailed, toolUsageSummary } from '../tool-usage.ts';
import { FileChangeCard } from './FileChangeCard.tsx';
import { TerminalCard } from './TerminalCard.tsx';

export interface ToolInspectionProps {
  debug: boolean;
  selectedCallId: string | null;
  onSelectCall: (callId: string) => void;
}

export function CompactToolUsage({ tools, calls = [], ...inspection }: ToolInspectionProps & {
  tools: TranscriptToolBlock[];
  calls?: ActivityCall[];
}) {
  const [open, setOpen] = useState(false);
  const summary = toolUsageSummary(tools, calls);
  return (
    <details className="tool-usage tool-usage-compact" open={open}>
      <summary onClick={(event) => { event.preventDefault(); setOpen(!open); }}>
        <IconWand className="activity-icon" />
        <span className="tool-summary-text" title={summary}>{summary}</span>
        {tools.some((tool) => tool.pending) && <span className="tool-running-dot" aria-label="Tools running" />}
        <IconChevron className="tool-chevron" />
      </summary>
      <div className="tool-usage-body">
        {tools.map((tool) => <ToolUsage key={tool.callId} tool={tool} call={calls.find((call) => call.id === tool.callId)} mode="compact" {...inspection} />)}
      </div>
    </details>
  );
}

export function ToolUsage({ tool, call, mode, debug, selectedCallId, onSelectCall }: ToolInspectionProps & {
  tool: TranscriptToolBlock;
  call?: ActivityCall;
  mode: ToolUsageViewMode;
}) {
  // A user toggle wins over defaults, including when a streamed result arrives.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const change = tool.change ?? call?.change;
  const terminal = tool.terminal ?? call?.terminal;
  const enrichedTool = { ...tool, change, terminal };
  const open = userOpen ?? toolDefaultOpen(enrichedTool, mode);
  const ToolIcon = activityIcon(tool.label);
  const failed = toolFailed(enrichedTool);
  const result = call?.result;
  return (
    <details className="tool-usage" open={open} data-failed={failed ? 'true' : undefined} data-active={selectedCallId === tool.callId ? 'true' : undefined}>
      <summary onClick={(event) => { event.preventDefault(); setUserOpen(!open); }}>
        <ToolIcon className="activity-icon" />
        <span className={tool.pending ? 'activity-line-label shimmer-text' : 'activity-line-label'}>{tool.label}</span>
        <IconChevron className="tool-chevron" />
      </summary>
      <div className="tool-usage-body">
        {change && <FileChangeCard change={change} defaultOpen />}
        {terminal && <TerminalCard terminal={terminal} pending={tool.pending} />}
        {call && Object.keys(call.args).length > 0 && (
          <details className="tool-payload" open={mode === 'detailed'}>
            <summary>Arguments</summary>
            <pre>{JSON.stringify(call.args, null, 2)}</pre>
          </details>
        )}
        {!change && !terminal && result && <pre className="tool-output">{result.slice(0, 12000)}{result.length > 12000 ? '\n… Output truncated for display' : ''}</pre>}
        {!change && !terminal && !result && <p className="tool-result-state">{tool.pending ? 'Running…' : failed ? 'Tool failed' : 'Completed'}</p>}
        {debug && isSkillOrMcpLabel(tool.label) && (
          <button type="button" className={BUTTON.ghost} onClick={() => onSelectCall(tool.callId)}>Inspect tool call</button>
        )}
      </div>
    </details>
  );
}

function activityIcon(label: string) {
  const base = activityBaseLabel(label);
  if (base.startsWith('File · ')) return IconFolder;
  if (base.startsWith('Terminal · ')) return IconTerminal;
  if (base.startsWith('Skill · ')) return IconSpark;
  if (base.startsWith('Memory · ')) return IconMemory;
  if (base.startsWith('Rule · ')) return IconFileText;
  if (base.startsWith('Ask · ')) return IconChat;
  if (base.startsWith('MCP · ')) return IconServer;
  return IconWand;
}
