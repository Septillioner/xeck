import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { ChatMessage } from 'poyraz';
import { messageBlocks } from '../../../shared/transcript.ts';
import { sessionDir, sessionFilePath } from '../infra/data-dir.ts';
import { canonicalizeProfile, emptyProfile } from '../domain/profiles.ts';
import { AGENT_BY_ID, XECKBOT_AGENT } from '../agent/catalog/agents.ts';
import {
  agentWorkspaceRef,
  chatIdentityFromSession,
  defaultAgentId,
  defaultWorkspaceRef,
  findWorkspace,
  resolveAgentId,
} from '../agent/workspaces/resolve.ts';
import {
  isSessionPolicyId,
  type AgentMessageSource,
  type BotColor,
  type ContextParts,
  type LibraryMessage,
  type ModelProfile,
  type ReasoningEffort,
  type ServiceTier,
  type SessionSummary,
  type StoredSession,
  type TranscriptMessage,
  type XeckBotProfile,
} from '../../../shared/types.ts';
import { hooksRegistered, notifySessionEnded, notifySessionStarted } from '../agent/runtime/hooks.ts';
import { botConversationFor, listBotConversations } from './session-bots.ts';
import { createSubagentSession, listChildSessions, recoverInterruptedSubagents } from './session-children.ts';
import {
  DEFAULT_SESSION_TITLE,
  TITLE_EDIT_MAX_CHARS,
  TITLE_MAX_CHARS,
  isSessionId,
  normalizePolicyId,
  policyCache,
  readIndex,
  readSessionFile,
  removedSessionIds,
  sortByUpdated,
  titleFromContent,
  toSummary,
  upsertSummary,
  withSessionLock,
  writeIndex,
  writeSessionFile,
} from './session-record.ts';

export { isSessionId, normalizePolicyId };
export { botConversationFor, listBotConversations };
export { createSubagentSession, listChildSessions, recoverInterruptedSubagents };

export interface SessionPatch {
  title?: string;
  profile?: ModelProfile;
  reasoningEffort?: ReasoningEffort | null;
  serviceTier?: ServiceTier | null;
  projectId?: string | null;
  botSystemPrompt?: string;
  botBadges?: string[];
  botColor?: BotColor;
  botPurpose?: string;
  pinned?: boolean;
  archived?: boolean;
}

type StartedBot = { name: string } & XeckBotProfile;

export async function listSessions(includeBotConversations = false): Promise<SessionSummary[]> {
  return withSessionLock(async () => {
    const index = await readIndex();
    return sortByUpdated(index.sessions.filter((session) => listedSession(session, includeBotConversations)));
  });
}

export async function createSession(
  profile: ModelProfile | null,
  reasoningEffort?: ReasoningEffort,
  serviceTier?: ServiceTier,
  agentId?: string,
  policyId?: string,
  projectId?: string,
  bot?: StartedBot,
): Promise<StoredSession> {
  const resolvedAgentId = resolveAgentId(bot ? XECKBOT_AGENT.id : agentId);
  if (!AGENT_BY_ID[resolvedAgentId]?.startableBy.includes(bot ? 'bot' : 'user')) {
    throw new Error(`Agent '${resolvedAgentId}' cannot be started by a user.`);
  }
  const workspace = agentWorkspaceRef(resolvedAgentId);
  const workspaceDef = findWorkspace(workspace);
  const resolvedPolicyId = isSessionPolicyId(policyId) && workspaceDef.policies.includes(policyId)
    ? policyId
    : workspaceDef.defaultPolicy;
  const session = await withSessionLock(async () => {
    const created = newUserSession({
      profile,
      reasoningEffort,
      serviceTier,
      projectId,
      bot,
      workspace,
      agentId: resolvedAgentId,
      policyId: resolvedPolicyId,
    });
    await writeSessionFile(created);
    const index = await readIndex();
    index.sessions.push(toSummary(created));
    await writeIndex(index);
    return created;
  });
  if (hooksRegistered('SessionStart')) await notifySessionStarted(session.id, session.agentId);
  return session;
}

export async function readSession(id: string): Promise<StoredSession | null> {
  if (!isSessionId(id)) return null;
  return withSessionLock(() => readSessionFile(id));
}

/**
 * Stores the context breakdown of a session without touching anything else. Used to
 * fill a session that has usage but no breakdown yet; `updatedAt` stays as it was.
 */
export async function setSessionContextParts(id: string, parts: ContextParts): Promise<void> {
  if (!isSessionId(id)) return;
  await withSessionLock(async () => {
    const session = await readSessionFile(id);
    if (!session) return;
    session.contextParts = parts;
    await writeSessionFile(session);
  });
}

export async function saveSession(session: StoredSession): Promise<StoredSession> {
  return withSessionLock(async () => {
    if (removedSessionIds.has(session.id)) return session;
    session.updatedAt = new Date().toISOString();
    if (session.bot) Object.assign(session, chatIdentityFromSession(session));
    session.profile = canonicalizeProfile(session.profile);
    await keepStoredActivePlan(session);
    await keepStoredTitle(session);
    copyStoredOrganization(session, await readSessionFile(session.id));
    attachAssistantBlocks(session);
    await writeSessionFile(session);
    await upsertSummary(session);
    return session;
  });
}

/**
 * Records the chat's active plan on the stored session. Written under the lock
 * and never through a copy held by a turn, so a turn that saves later cannot
 * erase it.
 */
export async function setSessionActivePlan(id: string, slug: string): Promise<void> {
  if (!isSessionId(id)) return;
  await withSessionLock(async () => {
    const session = await readSessionFile(id);
    if (!session) return;
    session.activePlan = slug;
    await writeSessionFile(session);
    await upsertSummary(session);
  });
}

/**
 * Replaces an auto title (heuristic or model) with the one the session list
 * should show. A title the user typed is never touched.
 */
export async function setSessionTitle(id: string, title: string): Promise<void> {
  if (!isSessionId(id)) return;
  const next = title.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX_CHARS);
  if (!next) return;
  await withSessionLock(async () => {
    const session = await readSessionFile(id);
    if (!session || session.bot || session.titleSource === 'user') return;
    session.title = next;
    session.titleSource = 'auto';
    await writeSessionFile(session);
    await upsertSummary(session);
  });
}

/**
 * Reads the opaque policy id without touching the transcript. Missing means
 * the supplied fallback.
 */
export async function readSessionPolicyId(id: string, fallback: string): Promise<string> {
  const cached = policyCache.get(id);
  if (cached) return cached;
  if (!isSessionId(id)) return fallback;
  const session = await readSession(id);
  const resolved = session ? normalizePolicyId(session, fallback) : fallback;
  policyCache.set(id, resolved);
  return resolved;
}

/** The chat identity (workspace ref + agent) behind a session id. */
export async function readSessionIdentity(id: string): Promise<{ workspace: string; agentId: string }> {
  const fallback = { workspace: defaultWorkspaceRef(), agentId: defaultAgentId() };
  if (!isSessionId(id)) return fallback;
  const session = await readSessionFile(id);
  if (!session) return fallback;
  const { workspace, agentId } = chatIdentityFromSession(session);
  return { workspace, agentId };
}

/**
 * Switches a session to an opaque policy id and tells the model in one
 * appended line. Returns null when the session does not exist or the policy
 * id is blank.
 */
export async function setSessionPolicyId(
  id: string,
  policyId: string,
  entryLine?: string,
): Promise<StoredSession | null> {
  if (!isSessionId(id) || !isSessionPolicyId(policyId)) return null;
  return withSessionLock(async () => {
    const session = await readSessionFile(id);
    if (!session) return null;
    if (normalizePolicyId(session, policyId) !== policyId) {
      session.policyId = policyId;
      policyCache.set(id, policyId);
      if (entryLine) session.libraryMessages.push({ role: 'user', content: entryLine });
      session.updatedAt = new Date().toISOString();
      await writeSessionFile(session);
      await upsertSummary(session);
    }
    return session;
  });
}

export async function patchSession(id: string, patch: SessionPatch): Promise<StoredSession | null> {
  if (!isSessionId(id)) return null;
  return withSessionLock(async () => {
    const session = await readSessionFile(id);
    if (!session) return null;
    applySessionPatch(session, patch);
    session.updatedAt = new Date().toISOString();
    await writeSessionFile(session);
    await upsertSummary(session);
    return session;
  });
}

export async function unassignProjectSessions(projectId: string): Promise<void> {
  if (!projectId) return;
  await withSessionLock(async () => {
    const index = await readIndex();
    const assignedSessions = index.sessions.filter((session) => session.projectId === projectId);
    const updatedAt = new Date().toISOString();
    for (const summary of assignedSessions) {
      const session = await readSessionFile(summary.id);
      if (!session || session.projectId !== projectId) continue;
      delete session.projectId;
      session.updatedAt = updatedAt;
      await writeSessionFile(session);
    }
    index.sessions = index.sessions.map((summary) => summary.projectId === projectId
      ? { ...summary, projectId: undefined, updatedAt }
      : summary);
    await writeIndex(index);
  });
}

export async function deleteSession(id: string): Promise<boolean> {
  if (!isSessionId(id)) return false;
  const removed = await withSessionLock(async () => {
    const session = await readSessionFile(id);
    if (!session) return [];
    const index = await readIndex();
    const ids = idsRemovedWith(index.sessions, id);
    for (const sessionId of ids) {
      removedSessionIds.add(sessionId);
      policyCache.delete(sessionId);
      await rm(sessionFilePath(sessionId), { force: true });
      await rm(sessionDir(sessionId), { recursive: true, force: true });
    }
    index.sessions = index.sessions.filter((item) => !ids.has(item.id));
    await writeIndex(index);
    return [...ids];
  });
  if (removed.length === 0) return false;
  if (hooksRegistered('SessionEnd')) {
    for (const sessionId of removed) await notifySessionEnded(sessionId);
  }
  return true;
}

export function applyUserTurn(session: StoredSession, content: string, source?: AgentMessageSource): TranscriptMessage {
  const last = session.messages.at(-1);
  if (last?.role === 'user' && last.content === content && last.source?.messageId === source?.messageId) return last;

  const message: TranscriptMessage = {
    id: randomUUID(),
    role: 'user',
    content,
    ...(source ? { source } : {}),
    createdAt: new Date().toISOString(),
  };
  session.messages.push(message);
  if (!session.bot && session.title === DEFAULT_SESSION_TITLE) {
    session.title = titleFromContent(content);
    session.titleSource = 'auto';
  }
  return message;
}

export function libraryForReplay(session: StoredSession, content: string): LibraryMessage[] {
  const library = session.libraryMessages;
  const last = library.at(-1);
  if (last?.role === 'user' && last.content === content) return library.slice(0, -1);
  return library;
}

export function messagesFromAgent(history: ChatMessage[]): LibraryMessage[] {
  return history
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role,
      content: message.content,
      tool_calls: message.tool_calls,
      tool_call_id: message.tool_call_id,
      providerMeta: message.providerMeta,
    }));
}

function listedSession(session: SessionSummary, includeBotConversations: boolean): boolean {
  return !session.parentId && (includeBotConversations || !session.botConversation);
}

function newUserSession(input: {
  profile: ModelProfile | null;
  reasoningEffort?: ReasoningEffort;
  serviceTier?: ServiceTier;
  projectId?: string;
  bot?: StartedBot;
  workspace: string;
  agentId: string;
  policyId: string;
}): StoredSession {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    origin: { by: 'user' },
    title: input.bot?.name ?? DEFAULT_SESSION_TITLE,
    ...(input.bot ? storedBot(input.bot) : {}),
    createdAt: now,
    updatedAt: now,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    profile: input.profile ? canonicalizeProfile(input.profile) : emptyProfile(),
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
    policyId: input.policyId,
    workspace: input.workspace,
    agentId: input.agentId,
    messages: [],
    libraryMessages: [],
  };
}

function storedBot(bot: StartedBot): Pick<StoredSession, 'bot' | 'titleSource'> {
  return {
    bot: {
      color: bot.color,
      ...(bot.purpose ? { purpose: bot.purpose } : {}),
      ...(bot.systemPrompt ? { systemPrompt: bot.systemPrompt } : {}),
    },
    titleSource: 'user',
  };
}

/** The stored active plan wins over whatever copy the caller holds. */
async function keepStoredActivePlan(session: StoredSession): Promise<void> {
  const stored = await readSessionFile(session.id);
  if (stored?.activePlan) session.activePlan = stored.activePlan;
  else delete session.activePlan;
}

/**
 * The stored title wins over the copy a turn holds: an auto title is written
 * while the turn runs, and a rename must not be lost either.
 */
async function keepStoredTitle(session: StoredSession): Promise<void> {
  const stored = await readSessionFile(session.id);
  if (!stored) return;
  if (stored.titleSource === 'user') {
    session.title = stored.title;
    session.titleSource = 'user';
    return;
  }
  if (stored.titleSource === 'auto' && stored.title !== session.title) {
    session.title = stored.title;
    session.titleSource = 'auto';
  }
}

function copyStoredOrganization(session: StoredSession, stored: StoredSession | null): void {
  session.pinned = stored?.pinned;
  session.archived = stored?.archived;
  if (stored?.bot) session.bot = stored.bot;
}

function attachAssistantBlocks(session: StoredSession): void {
  for (const message of session.messages) {
    if (message.role !== 'assistant') continue;
    const blocks = messageBlocks(message);
    if (blocks.length > 0) message.blocks = blocks;
  }
}

function applySessionPatch(session: StoredSession, patch: SessionPatch): void {
  if (typeof patch.title === 'string') {
    const title = patch.title.trim();
    if (title) {
      session.title = title.slice(0, TITLE_EDIT_MAX_CHARS);
      session.titleSource = 'user';
    }
  }
  if (patch.profile) session.profile = canonicalizeProfile(patch.profile);
  if (patch.reasoningEffort === null) delete session.reasoningEffort;
  else if (patch.reasoningEffort) session.reasoningEffort = patch.reasoningEffort;
  if (patch.serviceTier === null) delete session.serviceTier;
  else if (patch.serviceTier) session.serviceTier = patch.serviceTier;
  if (patch.projectId === null) delete session.projectId;
  else if (patch.projectId !== undefined) session.projectId = patch.projectId;
  if (patch.botSystemPrompt !== undefined && session.bot) session.bot.systemPrompt = patch.botSystemPrompt;
  if (patch.botBadges !== undefined && session.bot) session.bot.badges = patch.botBadges;
  if (patch.botColor !== undefined && session.bot) session.bot.color = patch.botColor;
  if (patch.botPurpose !== undefined && session.bot) session.bot.purpose = patch.botPurpose;
  if (patch.pinned !== undefined) session.pinned = patch.pinned;
  if (patch.archived !== undefined) session.archived = patch.archived;
}

function idsRemovedWith(sessions: SessionSummary[], id: string): Set<string> {
  const ids = new Set([
    id,
    ...sessions.filter((item) => item.botConversation?.participants.includes(id)).map((item) => item.id),
  ]);
  let added = true;
  while (added) {
    added = false;
    for (const item of sessions) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        added = true;
      }
    }
  }
  return ids;
}
