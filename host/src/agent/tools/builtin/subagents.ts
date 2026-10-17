import { z } from 'zod';
import { AGENTS } from '../../catalog/agents.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const DELEGATE_AGENTS_TOOL = 'delegate_agents';
export const LIST_SUBAGENTS_TOOL = 'list_subagents';
export const CANCEL_SUBAGENT_TOOL = 'cancel_subagent';

const taskSchema = z.object({
  agentId: z.string().min(1),
  task: z.string().trim().min(1).max(10_000).describe('A self-contained brief: goal, necessary context and source paths, scope or constraints, expected deliverable, and verification or success criteria. The child does not receive the parent conversation.'),
});
const delegableAgentIds = AGENTS.filter((agent) => agent.startableBy.includes('agent')).map((agent) => agent.id);

/** Host-owned tools keep the caller's session identity at the MCP bridge. */
export const SUBAGENT_TOOLS: BuiltinToolDef[] = [
  {
    name: DELEGATE_AGENTS_TOOL,
    description: `Delegate one to four independent tasks in one call. Valid agentId values: ${delegableAgentIds.join(', ')}. Write each task as a self-contained brief with the goal, relevant context/source paths, scope/constraints, expected output and success criteria; children cannot read the parent conversation. They run concurrently in separate child sessions and this call waits for all results. Read every child's status and result/error, integrate the deliverables, and report blockers accurately.`,
    inputSchema: { tasks: z.array(taskSchema).min(1).max(4) },
    hostMessage: 'Agent delegation is managed by the host.',
    execute: async (args, context) => {
      const parsed = z.array(taskSchema).min(1).max(4).safeParse(args.tasks);
      if (!parsed.success) return failure('Supply one to four valid agent tasks.');
      if (!context.sessionId) return failure('No active parent session.');
      try {
        const { delegateAgents } = await import('../../runtime/sessions/subagents.ts');
        const results = await delegateAgents(context.sessionId, parsed.data, context.abortSignal);
        return { content: JSON.stringify({ results }) };
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  },
  {
    name: LIST_SUBAGENTS_TOOL,
    description: 'List the child agent sessions created by this chat and their current status.',
    inputSchema: {},
    hostMessage: 'Child sessions are listed by the host.',
    execute: async (_args, context) => {
      if (!context.sessionId) return failure('No active parent session.');
      try {
        const { listSubagents } = await import('../../runtime/sessions/subagents.ts');
        return { content: JSON.stringify({ sessions: await listSubagents(context.sessionId) }) };
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  },
  {
    name: CANCEL_SUBAGENT_TOOL,
    description: 'Cancel a running child agent created by this chat.',
    inputSchema: { sessionId: z.string().min(1) },
    hostMessage: 'Child cancellation is managed by the host.',
    execute: async (args, context) => {
      if (!context.sessionId || typeof args.sessionId !== 'string') return failure('A parent and child session id are required.');
      try {
        const { cancelSubagent } = await import('../../runtime/sessions/subagents.ts');
        return { content: JSON.stringify({ cancelled: await cancelSubagent(context.sessionId, args.sessionId) }) };
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  },
];

function failure(message: string): ToolResult {
  return { content: JSON.stringify({ error: message }), isError: true };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
