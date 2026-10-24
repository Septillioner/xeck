import { randomUUID } from 'node:crypto';
import { messageBlocks } from '../../../shared/transcript.ts';
import { isLocalProvider, type ModelProfile, type SessionOrigin, type SessionSummary, type StoredSession, type TranscriptMessage, type TranscriptSubagentBlock } from '../../../shared/types.ts';
import { ChatOriginAgentSchema } from '../agent/core/chat.ts';
import { AGENT_BY_ID } from '../agent/catalog/agents.ts';
import { agentWorkspaceRef, findWorkspace, resolveAgentId } from '../agent/workspaces/resolve.ts';
import { canonicalizeProfile } from '../domain/profiles.ts';
import { apiKeyForProfile, configuredModels } from './provider-store.ts';
import { readSettings } from './settings-store.ts';
import {
  readIndex,
  readSessionFile,
  removedSessionIds,
  sortByUpdated,
  titleFromContent,
  upsertSummary,
  withSessionLock,
  writeSessionFile,
  isSessionId,
} from './session-record.ts';
import { hooksRegistered, notifySessionStarted } from '../agent/runtime/hooks.ts';

const INTERRUPTED_SUBAGENT_ERROR = 'Subagent interrupted because the host stopped.';
const INTERRUPTED_SUBAGENT_ACTIVITY = 'Failed';
const MISSING_PARENT_ERROR = 'Parent session is missing or cannot create subagents.';

type AgentChild = StoredSession & { origin: Extract<SessionOrigin, { by: 'agent' }> };

/** A child is an ordinary persisted session with its own agent and history. */
export async function createSubagentSession(input: {
  parentId: string;
  agentId: string;
  task: string;
  toolGrant: string[];
}): Promise<StoredSession> {
  const resolvedAgentId = resolveAgentId(input.agentId);
  if (!AGENT_BY_ID[resolvedAgentId]?.startableBy.includes('agent')) {
    throw new Error(`Agent '${resolvedAgentId}' cannot be started by another agent.`);
  }
  const workspace = agentWorkspaceRef(resolvedAgentId);
  const workspaceDef = findWorkspace(workspace);
  const selectedProfile = await profileSelectedFor(resolvedAgentId);
  const session = await withSessionLock(async () => {
    const parent = await readSessionFile(input.parentId);
    if (!parent || parent.origin?.by === 'agent' || removedSessionIds.has(parent.id)) {
      throw new Error(MISSING_PARENT_ERROR);
    }
    const created = newChildSession(input, parent, resolvedAgentId, workspace, workspaceDef.defaultPolicy, selectedProfile);
    await writeSessionFile(created);
    await upsertSummary(created);
    return created;
  });
  if (hooksRegistered('SessionStart')) await notifySessionStarted(session.id, session.agentId);
  return session;
}

export async function listChildSessions(parentId: string): Promise<SessionSummary[]> {
  if (!isSessionId(parentId)) return [];
  return withSessionLock(async () => {
    const index = await readIndex();
    return sortByUpdated(index.sessions.filter((session) => session.parentId === parentId));
  });
}

/** Called once before serving: an old process cannot still own a running child. */
export async function recoverInterruptedSubagents(): Promise<number> {
  return withSessionLock(async () => {
    const index = await readIndex();
    let recovered = 0;
    for (const summary of index.sessions.filter((item) => item.parentId && item.subagentStatus === 'running')) {
      const child = await readSessionFile(summary.id);
      if (!isRunningAgentChild(child)) continue;
      const updatedAt = new Date().toISOString();
      failInterruptedChild(child, updatedAt);
      await writeSessionFile(child);
      await upsertSummary(child);
      const parent = await readSessionFile(child.origin.parent);
      if (parent) {
        recordInterruptedChild(parent, child, updatedAt);
        await writeSessionFile(parent);
        await upsertSummary(parent);
      }
      recovered += 1;
    }
    return recovered;
  });
}

async function profileSelectedFor(agentId: string): Promise<ModelProfile | undefined> {
  const selected = (await readSettings()).agentProfiles[agentId];
  if (!selected) return undefined;
  const selectedProfile = (await configuredModels()).find((profile) =>
    profile.provider === selected.provider && profile.model === selected.model);
  if (!selectedProfile || (!isLocalProvider(selectedProfile.provider) && !(await apiKeyForProfile(selectedProfile)))) {
    throw new Error(`Selected model '${selected.provider}:${selected.model}' for '${agentId}' is unavailable. Configure the model/provider or choose inherit.`);
  }
  return selectedProfile;
}

function newChildSession(
  input: { parentId: string; task: string; toolGrant: string[] },
  parent: StoredSession,
  resolvedAgentId: string,
  workspace: string,
  policyId: string,
  selectedProfile: ModelProfile | undefined,
): StoredSession {
  const origin: SessionOrigin = ChatOriginAgentSchema.parse({
    by: 'agent',
    parent: parent.id,
    task: input.task,
    grant: { tools: input.toolGrant },
  });
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: titleFromContent(input.task),
    createdAt: now,
    updatedAt: now,
    ...(parent.projectId ? { projectId: parent.projectId } : {}),
    origin,
    subagentStatus: 'running',
    profile: canonicalizeProfile(selectedProfile ?? parent.profile),
    ...(parent.reasoningEffort ? { reasoningEffort: parent.reasoningEffort } : {}),
    ...(parent.serviceTier ? { serviceTier: parent.serviceTier } : {}),
    policyId,
    workspace,
    agentId: resolvedAgentId,
    messages: [{ id: randomUUID(), role: 'user', content: input.task, createdAt: now }],
    libraryMessages: [],
  };
}

function isRunningAgentChild(session: StoredSession | null): session is AgentChild {
  return !!session && session.origin?.by === 'agent' && session.subagentStatus === 'running';
}

function failInterruptedChild(child: StoredSession, updatedAt: string): void {
  child.subagentStatus = 'failed';
  child.subagentError = INTERRUPTED_SUBAGENT_ERROR;
  child.updatedAt = updatedAt;
  child.messages.push({
    id: randomUUID(),
    role: 'assistant',
    content: INTERRUPTED_SUBAGENT_ERROR,
    blocks: [{ kind: 'text', text: INTERRUPTED_SUBAGENT_ERROR }],
    createdAt: updatedAt,
  });
}

function recordInterruptedChild(parent: StoredSession, child: AgentChild, updatedAt: string): void {
  const update = interruptedUpdate(child);
  if (replaceExistingSubagentBlock(parent, child.id, update)) {
    parent.updatedAt = updatedAt;
    return;
  }
  const message = assistantMessageFor(parent, updatedAt);
  message.blocks = [...messageBlocks(message), update];
  parent.updatedAt = updatedAt;
}

function interruptedUpdate(child: AgentChild): TranscriptSubagentBlock {
  return {
    kind: 'subagent',
    sessionId: child.id,
    agentId: child.agentId ?? '',
    task: child.origin.task,
    status: 'failed',
    activity: INTERRUPTED_SUBAGENT_ACTIVITY,
    error: INTERRUPTED_SUBAGENT_ERROR,
  };
}

function replaceExistingSubagentBlock(parent: StoredSession, childId: string, update: TranscriptSubagentBlock): boolean {
  let found = false;
  for (const message of parent.messages) {
    const blocks = messageBlocks(message);
    const at = blocks.findIndex((block) => block.kind === 'subagent' && block.sessionId === childId);
    if (at < 0) continue;
    blocks[at] = update;
    message.blocks = blocks;
    found = true;
  }
  return found;
}

function assistantMessageFor(parent: StoredSession, updatedAt: string): TranscriptMessage {
  const last = parent.messages.at(-1);
  if (last?.role === 'assistant') return last;
  const message: TranscriptMessage = { id: randomUUID(), role: 'assistant', content: '', blocks: [], createdAt: updatedAt };
  parent.messages.push(message);
  return message;
}
