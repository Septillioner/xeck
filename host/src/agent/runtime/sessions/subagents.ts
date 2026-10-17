import { LOAD_SKILL_TOOL_NAME } from 'poyraz';
import type { StoredSession, SubagentUpdate } from '../../../../../shared/types.ts';
import {
  createSubagentSession,
  listChildSessions,
  readSession,
  saveSession,
} from '../../../stores/sessions.ts';
import { getLiveChat, publishLive } from '../events/live-chat.ts';
import { refreshMcp } from '../../../stores/mcp-store.ts';
import { AGENTS, AGENT_BY_ID } from '../../catalog/agents.ts';
import { WORKSPACE_BY_REF } from '../../catalog/workspaces.ts';
import { filterToolsForPolicy } from '../../tools/policy-context.ts';
import { getToolLabel } from '../../tools/tool-labels.ts';
import { isBuiltinHostTool, serverSideName } from '../../tools/builtin/identity.ts';
import { selectedBuiltinNames } from '../../workspaces/definitions.ts';
import { agentWorkspaceRef } from '../../workspaces/resolve.ts';
import { abortChat } from '../agents/pool.ts';
import { startSessionTurn } from './turn.ts';
import { readSettings } from '../../../stores/settings-store.ts';
import { readSkills } from '../../../stores/instruction-store.ts';

const MAX_CHILDREN_PER_CALL = 4;
const MAX_TASK_CHARS = 10_000;
const NON_DELEGABLE_TOOLS = new Set(['delegate_agents', 'list_subagents', 'cancel_subagent', 'ask_question']);
const DELEGABLE_AGENT_IDS = AGENTS.filter((agent) => agent.startableBy.includes('agent')).map((agent) => agent.id);

export interface DelegatedTask {
  agentId: string;
  task: string;
}

export interface DelegatedResult {
  sessionId: string;
  agentId: string;
  status: 'done' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
}

/** The master receives only tools it could use itself, minus user-facing dialogs and delegation. */
async function delegableTools(parent: StoredSession): Promise<string[]> {
  const storedWorkspace = parent.workspace ? WORKSPACE_BY_REF[parent.workspace] : undefined;
  const workspace = storedWorkspace?.agents.includes(parent.agentId ?? '')
    ? storedWorkspace
    : WORKSPACE_BY_REF[agentWorkspaceRef(parent.agentId ?? '')];
  if (!workspace) throw new Error('Parent workspace is unavailable.');
  const selected = new Set(selectedBuiltinNames(workspace.toolset.builtin));
  const mcp = await refreshMcp();
  const names = Object.keys(mcp.tools).filter((name) => !isBuiltinHostTool(name) || selected.has(serverSideName(name)));
  if (workspace.toolset.skills && (await readSkills()).length > 0) names.unshift(LOAD_SKILL_TOOL_NAME);
  const settings = await readSettings();
  return filterToolsForPolicy(names, parent.policyId ?? workspace.defaultPolicy, { fullFileAccess: settings.fullFileAccess }).filter((name) => {
    if (isBuiltinHostTool(name) && NON_DELEGABLE_TOOLS.has(serverSideName(name))) return false;
    return !getToolLabel(name)?.requires?.includes('user');
  });
}

export async function delegateAgents(parentId: string, tasks: DelegatedTask[], signal?: AbortSignal): Promise<DelegatedResult[]> {
  if (tasks.length < 1 || tasks.length > MAX_CHILDREN_PER_CALL) {
    throw new Error(`Supply 1 to ${MAX_CHILDREN_PER_CALL} tasks.`);
  }
  const parent = await readSession(parentId);
  if (!parent || parent.origin?.by === 'agent') throw new Error('Only a user session can delegate agents.');
  if (signal?.aborted) throw new Error('Parent turn was cancelled.');
  for (const item of tasks) {
    if (!AGENT_BY_ID[item.agentId]) {
      throw new Error(`Unknown agent '${item.agentId}'. Available agent IDs: ${DELEGABLE_AGENT_IDS.join(', ')}.`);
    }
    if (!AGENT_BY_ID[item.agentId]?.startableBy.includes('agent')) {
      throw new Error(`Agent '${item.agentId}' cannot be started by another agent.`);
    }
    if (!item.task.trim() || item.task.length > MAX_TASK_CHARS) throw new Error('Each task needs a bounded prompt.');
  }
  const toolGrant = await delegableTools(parent);
  return Promise.all(tasks.map(async (item): Promise<DelegatedResult> => {
    let child: StoredSession | undefined;
    try {
      child = await createSubagentSession({ parentId, agentId: item.agentId, task: item.task.trim(), toolGrant });
      const { completion } = await startSessionTurn(child, item.task.trim(), signal);
      const outcome = await completion;
      return {
        sessionId: child.id,
        agentId: item.agentId,
        status: outcome.session.subagentStatus === 'running' ? 'failed' : outcome.session.subagentStatus ?? 'failed',
        ...(outcome.content ? { result: outcome.content } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
      };
    } catch (error) {
      const message = messageOf(error);
      if (child) {
        child.subagentStatus = 'failed';
        child.subagentError = message;
        try { await saveSession(child); } catch { /* One failed save must not discard sibling results. */ }
        const live = getLiveChat(parentId);
        if (live) publishLive(live, 'subagent.update', {
          sessionId: child.id, agentId: item.agentId, task: item.task,
          status: 'failed', activity: 'Failed', error: message,
        } satisfies SubagentUpdate);
      }
      return { sessionId: child?.id ?? '', agentId: item.agentId, status: 'failed', error: message };
    }
  }));
}

export async function listSubagents(parentId: string) {
  const parent = await readSession(parentId);
  if (!parent || parent.origin?.by === 'agent') throw new Error('Parent session is unavailable.');
  return listChildSessions(parentId);
}

export async function cancelSubagent(parentId: string, childId: string): Promise<boolean> {
  const child = await readSession(childId);
  if (child?.origin?.by !== 'agent' || child.origin.parent !== parentId) return false;
  return abortChat(childId);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
