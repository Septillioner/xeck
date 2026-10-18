import { migrateSessionBrand } from '../domain/legacy-brand.ts';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { ChatMessage } from 'poyraz';
import { sessionDir, sessionFilePath, sessionIndexPath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { messageBlocks } from '../../../shared/transcript.ts';
import { canonicalizeProfile, emptyProfile } from '../domain/profiles.ts';
import { ChatOriginAgentSchema, ChatOriginSchema } from '../agent/core/chat.ts';
import { AGENT_BY_ID } from '../agent/catalog/agents.ts';
import { readSettings } from './settings-store.ts';
import { apiKeyForProfile, configuredModels } from './provider-store.ts';
import { isLocalProvider } from '../../../shared/types.ts';
import {
  agentWorkspaceRef,
  chatIdentityFromSession,
  defaultAgentId,
  defaultWorkspaceRef,
  findWorkspace,
  resolveAgentId,
} from '../agent/workspaces/resolve.ts';
import {
  CONTEXT_PART_KEYS,
  isReasoningEffort,
  isServiceTier,
  isSessionPolicyId,
  type ContextParts,
  type AgentMessageSource,
  type LibraryMessage,
  type ModelProfile,
  type ReasoningEffort,
  type ServiceTier,
  type SessionPolicyId,
  type SessionSummary,
  type SessionOrigin,
  type SubagentStatus,
  type StoredSession,
  type TranscriptMessage,
} from '../../../shared/types.ts';

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_SESSION_TITLE = 'New chat';
const TITLE_MAX_CHARS = 48;
const TITLE_EDIT_MAX_CHARS = 120;

/** Opaque policy id behind a session. Missing means the supplied default. */
export function normalizePolicyId(session: { policyId?: unknown }, fallback: string): string {
  if (isSessionPolicyId(session.policyId)) return session.policyId;
  return fallback;
}

/** First message becomes the title, trimmed to what the session list can show. */
function titleFromContent(content: string): string {
  const singleLine = content.trim().replace(/\s+/g, ' ');
  if (!singleLine) return DEFAULT_SESSION_TITLE;
  return singleLine.slice(0, TITLE_MAX_CHARS);
}

interface SessionIndexFile {
  sessions: SessionSummary[];
}

const exclusive = createMutex();
const removedSessionIds = new Set<string>();
const policyCache = new Map<string, SessionPolicyId>();

export function isSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

export async function listSessions(includeBotConversations = false): Promise<SessionSummary[]> {
  return exclusive(async () => {
    const index = await readIndex();
    return sortByUpdated(index.sessions.filter((session) => !session.parentId && (includeBotConversations || !session.botConversation)));
  });
}

export async function listBotConversations(botId?: string): Promise<SessionSummary[]> {
  return (await listSessions(true)).filter((session) => session.botConversation && (!botId || session.botConversation.participants.includes(botId)));
}

/** A shared pair has its own history; personal user/bot histories are never copied. */
export async function botConversationFor(sourceId: string, targetId: string): Promise<StoredSession> {
  return exclusive(async () => {
    const source = await readSessionFile(sourceId);
    const target = await readSessionFile(targetId);
    if (!source?.bot || !target?.bot || source.origin?.by === 'agent' || target.origin?.by === 'agent' || source.botConversation || target.botConversation || sourceId === targetId) throw new Error('Messaging participants must be distinct XeckBots.');
    const participants = [sourceId, targetId].sort() as [string, string];
    const index = await readIndex();
    const summary = index.sessions.find((item) => item.botConversation?.participants[0] === participants[0] && item.botConversation.participants[1] === participants[1]);
    const existing = summary ? await readSessionFile(summary.id) : null;
    const now = new Date().toISOString();
    const session: StoredSession = existing ?? {
      id: randomUUID(), origin: { by: 'user' },
      title: `${source.title} ↔ ${target.title}`, titleSource: 'user',
      createdAt: now, updatedAt: now,
      profile: target.profile, messages: [], libraryMessages: [],
    };
    if (existing && existing.botConversation?.responderId !== targetId) {
      // When the direction changes, each bot's own prior messages are assistant turns.
      session.libraryMessages = session.messages.filter((message) => message.content.trim()).map((message) => ({
        role: message.source?.sessionId === targetId ? 'assistant' : 'user',
        content: message.content,
      }));
    }
    session.botConversation = { participants, responderId: targetId, responderTitle: target.title };
    session.bot = { ...target.bot };
    session.agentId = target.agentId;
    session.workspace = target.workspace;
    session.policyId = target.policyId;
    session.profile = { ...target.profile };
    session.reasoningEffort = target.reasoningEffort;
    session.serviceTier = target.serviceTier;
    await writeSessionFile(session);
    const position = index.sessions.findIndex((item) => item.id === session.id);
    if (position < 0) index.sessions.push(toSummary(session));
    else index.sessions[position] = toSummary(session);
    await writeIndex(index);
    return session;
  });
}

export async function listChildSessions(parentId: string): Promise<SessionSummary[]> {
  if (!isSessionId(parentId)) return [];
  return exclusive(async () => {
    const index = await readIndex();
    return sortByUpdated(index.sessions.filter((session) => session.parentId === parentId));
  });
}

/** Called once before serving: an old process cannot still own a running child. */
export async function recoverInterruptedSubagents(): Promise<number> {
  return exclusive(async () => {
    const index = await readIndex();
    let recovered = 0;
    for (const summary of index.sessions.filter((item) => item.parentId && item.subagentStatus === 'running')) {
      const child = await readSessionFile(summary.id);
      if (!child || child.origin?.by !== 'agent' || child.subagentStatus !== 'running') continue;
      const error = 'Subagent interrupted because the host stopped.';
      child.subagentStatus = 'failed';
      child.subagentError = error;
      child.updatedAt = new Date().toISOString();
      child.messages.push({ id: randomUUID(), role: 'assistant', content: error,
        blocks: [{ kind: 'text', text: error }], createdAt: child.updatedAt });
      await writeSessionFile(child);
      await upsertSummary(child);
      const parent = await readSessionFile(child.origin.parent);
      if (parent) {
        const update = { kind: 'subagent' as const, sessionId: child.id, agentId: child.agentId ?? '',
          task: child.origin.task, status: 'failed' as const, activity: 'Failed', error };
        let found = false;
        for (const message of parent.messages) {
          const blocks = messageBlocks(message);
          const at = blocks.findIndex((block) => block.kind === 'subagent' && block.sessionId === child.id);
          if (at < 0) continue;
          blocks[at] = update;
          message.blocks = blocks;
          found = true;
        }
        if (!found) {
          let message = parent.messages.at(-1);
          if (message?.role !== 'assistant') {
            message = { id: randomUUID(), role: 'assistant', content: '', blocks: [], createdAt: child.updatedAt };
            parent.messages.push(message);
          }
          message.blocks = [...messageBlocks(message), update];
        }
        parent.updatedAt = child.updatedAt;
        await writeSessionFile(parent);
        await upsertSummary(parent);
      }
      recovered += 1;
    }
    return recovered;
  });
}

export async function createSession(
  profile: ModelProfile | null,
  reasoningEffort?: ReasoningEffort,
  serviceTier?: ServiceTier,
  agentId?: string,
  policyId?: string,
  projectId?: string,
  bot?: { name: string } & import('../../../shared/types.ts').XeckBotProfile,
): Promise<StoredSession> {
  const resolvedAgentId = resolveAgentId(agentId);
  if (!AGENT_BY_ID[resolvedAgentId]?.startableBy.includes('user')) {
    throw new Error(`Agent '${resolvedAgentId}' cannot be started by a user.`);
  }
  const workspace = agentWorkspaceRef(resolvedAgentId);
  const workspaceDef = findWorkspace(workspace);
  const resolvedPolicyId = isSessionPolicyId(policyId) && workspaceDef.policies.includes(policyId)
    ? policyId
    : workspaceDef.defaultPolicy;
  return exclusive(async () => {
    const now = new Date().toISOString();
    const session: StoredSession = {
      id: randomUUID(),
      origin: { by: 'user' },
      title: bot?.name ?? DEFAULT_SESSION_TITLE,
      ...(bot ? { bot: { color: bot.color, ...(bot.purpose ? { purpose: bot.purpose } : {}), ...(bot.systemPrompt ? { systemPrompt: bot.systemPrompt } : {}) }, titleSource: 'user' as const } : {}),
      createdAt: now,
      updatedAt: now,
      ...(projectId ? { projectId } : {}),
      profile: profile ? canonicalizeProfile(profile) : emptyProfile(),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(serviceTier ? { serviceTier } : {}),
      policyId: resolvedPolicyId,
      workspace,
      agentId: resolvedAgentId,
      messages: [],
      libraryMessages: [],
    };
    await writeSessionFile(session);
    const index = await readIndex();
    index.sessions.push(toSummary(session));
    await writeIndex(index);
    return session;
  });
}

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
  const selected = (await readSettings()).agentProfiles[resolvedAgentId];
  let selectedProfile: ModelProfile | undefined;
  if (selected) {
    selectedProfile = (await configuredModels()).find((profile) =>
      profile.provider === selected.provider && profile.model === selected.model);
    if (!selectedProfile || (!isLocalProvider(selectedProfile.provider) && !(await apiKeyForProfile(selectedProfile)))) {
      throw new Error(`Selected model '${selected.provider}:${selected.model}' for '${resolvedAgentId}' is unavailable. Configure the model/provider or choose inherit.`);
    }
  }
  return exclusive(async () => {
    const parent = await readSessionFile(input.parentId);
    if (!parent || parent.origin?.by === 'agent' || removedSessionIds.has(parent.id)) {
      throw new Error('Parent session is missing or cannot create subagents.');
    }
    const origin: SessionOrigin = ChatOriginAgentSchema.parse({
      by: 'agent',
      parent: parent.id,
      task: input.task,
      grant: { tools: input.toolGrant },
    });
    const now = new Date().toISOString();
    const session: StoredSession = {
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
      policyId: workspaceDef.defaultPolicy,
      workspace,
      agentId: resolvedAgentId,
      messages: [{ id: randomUUID(), role: 'user', content: input.task, createdAt: now }],
      libraryMessages: [],
    };
    await writeSessionFile(session);
    await upsertSummary(session);
    return session;
  });
}

export async function readSession(id: string): Promise<StoredSession | null> {
  if (!isSessionId(id)) return null;
  return exclusive(() => readSessionFile(id));
}

/**
 * Stores the context breakdown of a session without touching anything else. Used to
 * fill a session that has usage but no breakdown yet; `updatedAt` stays as it was.
 */
export async function setSessionContextParts(id: string, parts: ContextParts): Promise<void> {
  if (!isSessionId(id)) return;
  await exclusive(async () => {
    const session = await readSessionFile(id);
    if (!session) return;
    session.contextParts = parts;
    await writeSessionFile(session);
  });
}

export async function saveSession(session: StoredSession): Promise<StoredSession> {
  return exclusive(async () => {
    if (removedSessionIds.has(session.id)) return session;
    session.updatedAt = new Date().toISOString();
    session.profile = canonicalizeProfile(session.profile);
    await keepStoredActivePlan(session);
    await keepStoredTitle(session);
    for (const message of session.messages) {
      if (message.role !== 'assistant') continue;
      const blocks = messageBlocks(message);
      if (blocks.length > 0) message.blocks = blocks;
    }
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
  await exclusive(async () => {
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
  await exclusive(async () => {
    const session = await readSessionFile(id);
    if (!session || session.bot || session.titleSource === 'user') return;
    session.title = next;
    session.titleSource = 'auto';
    await writeSessionFile(session);
    await upsertSummary(session);
  });
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
  return exclusive(async () => {
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

export async function patchSession(
  id: string,
  patch: {
    title?: string;
    profile?: ModelProfile;
    reasoningEffort?: ReasoningEffort | null;
    serviceTier?: ServiceTier | null;
    projectId?: string | null;
  },
): Promise<StoredSession | null> {
  if (!isSessionId(id)) return null;
  return exclusive(async () => {
    const session = await readSessionFile(id);
    if (!session) return null;
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
    session.updatedAt = new Date().toISOString();
    await writeSessionFile(session);
    await upsertSummary(session);
    return session;
  });
}

export async function unassignProjectSessions(projectId: string): Promise<void> {
  if (!projectId) return;
  await exclusive(async () => {
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
  return exclusive(async () => {
    const session = await readSessionFile(id);
    if (!session) return false;
    const index = await readIndex();
    const ids = new Set([id, ...index.sessions.filter((item) => item.botConversation?.participants.includes(id)).map((item) => item.id)]);
    let added = true;
    while (added) {
      added = false;
      for (const item of index.sessions) {
        if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); added = true; }
      }
    }
    for (const sessionId of ids) {
      removedSessionIds.add(sessionId);
      policyCache.delete(sessionId);
      await rm(sessionFilePath(sessionId), { force: true });
      await rm(sessionDir(sessionId), { recursive: true, force: true });
    }
    index.sessions = index.sessions.filter((item) => !ids.has(item.id));
    await writeIndex(index);
    return true;
  });
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

async function readIndex(): Promise<SessionIndexFile> {
  const file = await readJson<SessionIndexFile>(sessionIndexPath(), { sessions: [] });
  if (!Array.isArray(file.sessions)) return { sessions: [] };
  return migrateSessionBrand(file);
}

async function writeIndex(index: SessionIndexFile): Promise<void> {
  await writeJson(sessionIndexPath(), { sessions: sortByUpdated(index.sessions) });
}

async function readSessionFile(id: string): Promise<StoredSession | null> {
  try {
    const session = migrateSessionBrand(await readJson<StoredSession | null>(sessionFilePath(id), null));
    if (!session || session.id !== id) return null;
    session.messages ??= [];
    session.libraryMessages ??= [];
    if (session.reasoningEffort !== undefined && !isReasoningEffort(session.reasoningEffort)) {
      delete session.reasoningEffort;
    }
    if (session.serviceTier !== undefined && !isServiceTier(session.serviceTier)) {
      delete session.serviceTier;
    }
    if (session.projectId !== undefined && typeof session.projectId !== 'string') {
      delete session.projectId;
    }
    if (session.origin !== undefined) {
      const parsed = ChatOriginSchema.safeParse(session.origin);
      if (!parsed.success) return null;
      session.origin = parsed.data;
    } else {
      session.origin = { by: 'user' };
    }
    if (session.subagentStatus !== undefined && !(['running', 'done', 'failed', 'cancelled'] satisfies SubagentStatus[]).includes(session.subagentStatus)) {
      delete session.subagentStatus;
    }
    if (session.policyId !== undefined && !isSessionPolicyId(session.policyId)) {
      delete session.policyId;
    }
    // CWAP katkısal alanları: bozuksa sil, eksikse varsay (migration Faz-2).
    if (session.workspace !== undefined && typeof session.workspace !== 'string') {
      delete session.workspace;
    }
    if (session.agentId !== undefined && typeof session.agentId !== 'string') {
      delete session.agentId;
    }
    if (session.activePlan !== undefined && typeof session.activePlan !== 'string') {
      delete session.activePlan;
    }
    if (session.contextParts !== undefined) {
      const parts = normalizeContextParts(session.contextParts);
      if (parts) session.contextParts = parts;
      else delete session.contextParts;
    }
    if (session.titleSource !== 'user' && session.titleSource !== 'auto') {
      delete session.titleSource;
    }
    const workspace = session.workspace || defaultWorkspaceRef();
    policyCache.set(session.id, normalizePolicyId(session, findWorkspace(workspace).defaultPolicy));
    if (!isSessionPolicyId(session.policyId)) session.policyId = policyCache.get(session.id);
    return session;
  } catch {
    return null;
  }
}

/**
 * Sessions stored before the ten-way split carry seven keys. The missing ones are
 * zero, so the meter reads old and new sessions the same way.
 */
function normalizeContextParts(value: unknown): ContextParts | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const parts = {} as Record<string, number>;
  for (const key of CONTEXT_PART_KEYS) {
    const tokens = record[key];
    parts[key] = typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
  }
  return parts as unknown as ContextParts;
}

async function writeSessionFile(session: StoredSession): Promise<void> {
  await writeJson(sessionFilePath(session.id), session);
}

async function upsertSummary(session: StoredSession): Promise<void> {
  const index = await readIndex();
  const summary = toSummary(session);
  const existing = index.sessions.findIndex((item) => item.id === session.id);
  if (existing >= 0) index.sessions[existing] = summary;
  else index.sessions.push(summary);
  await writeIndex(index);
}

function toSummary(session: StoredSession): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    profile: session.profile,
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.bot ? { bot: { color: session.bot.color } } : {}),
    ...(session.botConversation ? { botConversation: session.botConversation } : {}),
    ...(session.origin?.by === 'agent' ? { parentId: session.origin.parent } : {}),
    ...(session.subagentStatus ? { subagentStatus: session.subagentStatus } : {}),
  };
}

function sortByUpdated(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
