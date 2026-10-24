import { migrateSessionBrand } from '../domain/legacy-brand.ts';
import { sessionFilePath, sessionIndexPath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { ChatOriginSchema } from '../agent/core/chat.ts';
import { chatIdentityFromSession, defaultWorkspaceRef, findWorkspace } from '../agent/workspaces/resolve.ts';
import {
  CONTEXT_PART_KEYS,
  isReasoningEffort,
  isServiceTier,
  isSessionPolicyId,
  type ContextParts,
  type SessionPolicyId,
  type SessionSummary,
  type SubagentStatus,
  type StoredSession,
} from '../../../shared/types.ts';

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_SESSION_TITLE = 'New chat';
export const TITLE_MAX_CHARS = 48;
export const TITLE_EDIT_MAX_CHARS = 120;

const SUBAGENT_STATUSES: readonly SubagentStatus[] = ['running', 'done', 'failed', 'cancelled'];

export const withSessionLock = createMutex();
export const removedSessionIds = new Set<string>();
export const policyCache = new Map<string, SessionPolicyId>();

interface SessionIndexFile {
  sessions: SessionSummary[];
}

/** Opaque policy id behind a session. Missing means the supplied default. */
export function normalizePolicyId(session: { policyId?: unknown }, fallback: string): string {
  if (isSessionPolicyId(session.policyId)) return session.policyId;
  return fallback;
}

/** First message becomes the title, trimmed to what the session list can show. */
export function titleFromContent(content: string): string {
  const singleLine = content.trim().replace(/\s+/g, ' ');
  if (!singleLine) return DEFAULT_SESSION_TITLE;
  return singleLine.slice(0, TITLE_MAX_CHARS);
}

export function isSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

export async function readIndex(): Promise<SessionIndexFile> {
  const file = await readJson<SessionIndexFile>(sessionIndexPath(), { sessions: [] });
  if (!Array.isArray(file.sessions)) return { sessions: [] };
  return migrateSessionBrand(file);
}

export async function writeIndex(index: SessionIndexFile): Promise<void> {
  await writeJson(sessionIndexPath(), { sessions: sortByUpdated(index.sessions) });
}

export async function readSessionFile(id: string): Promise<StoredSession | null> {
  try {
    const session = migrateSessionBrand(await readJson<StoredSession | null>(sessionFilePath(id), null));
    if (!session || session.id !== id) return null;
    if (!sanitizeStoredSession(session)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function writeSessionFile(session: StoredSession): Promise<void> {
  await writeJson(sessionFilePath(session.id), session);
}

export async function upsertSummary(session: StoredSession): Promise<void> {
  const index = await readIndex();
  const summary = toSummary(session);
  const existing = index.sessions.findIndex((item) => item.id === session.id);
  if (existing >= 0) index.sessions[existing] = summary;
  else index.sessions.push(summary);
  await writeIndex(index);
}

export function toSummary(session: StoredSession): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    profile: session.profile,
    pinned: session.pinned,
    archived: session.archived,
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.bot ? { bot: botSummary(session) } : {}),
    ...(session.botConversation ? { botConversation: session.botConversation } : {}),
    ...(session.origin?.by === 'agent' ? { parentId: session.origin.parent } : {}),
    ...(session.subagentStatus ? { subagentStatus: session.subagentStatus } : {}),
  };
}

export function sortByUpdated(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function botSummary(session: StoredSession): NonNullable<SessionSummary['bot']> {
  return {
    color: session.bot!.color,
    ...(session.bot?.purpose ? { purpose: session.bot.purpose } : {}),
    ...(session.bot?.badges ? { badges: session.bot.badges } : {}),
  };
}

function sanitizeStoredSession(session: StoredSession): boolean {
  session.messages ??= [];
  session.libraryMessages ??= [];
  dropInvalidReasoningEffort(session);
  dropInvalidServiceTier(session);
  dropInvalidProjectId(session);
  if (!assignOrigin(session)) return false;
  dropInvalidSubagentStatus(session);
  dropInvalidPolicyId(session);
  dropInvalidOptionalText(session, 'workspace');
  dropInvalidOptionalText(session, 'agentId');
  dropInvalidOptionalText(session, 'activePlan');
  assignContextParts(session);
  dropInvalidTitleSource(session);
  if (session.bot) Object.assign(session, chatIdentityFromSession(session));
  rememberPolicy(session);
  return true;
}

function dropInvalidReasoningEffort(session: StoredSession): void {
  if (session.reasoningEffort !== undefined && !isReasoningEffort(session.reasoningEffort)) {
    delete session.reasoningEffort;
  }
}

function dropInvalidServiceTier(session: StoredSession): void {
  if (session.serviceTier !== undefined && !isServiceTier(session.serviceTier)) {
    delete session.serviceTier;
  }
}

function dropInvalidProjectId(session: StoredSession): void {
  if (session.projectId !== undefined && typeof session.projectId !== 'string') {
    delete session.projectId;
  }
}

function assignOrigin(session: StoredSession): boolean {
  if (session.origin === undefined) {
    session.origin = { by: 'user' };
    return true;
  }
  const parsed = ChatOriginSchema.safeParse(session.origin);
  if (!parsed.success) return false;
  session.origin = parsed.data;
  return true;
}

function dropInvalidSubagentStatus(session: StoredSession): void {
  if (session.subagentStatus !== undefined && !SUBAGENT_STATUSES.includes(session.subagentStatus)) {
    delete session.subagentStatus;
  }
}

function dropInvalidPolicyId(session: StoredSession): void {
  if (session.policyId !== undefined && !isSessionPolicyId(session.policyId)) {
    delete session.policyId;
  }
}

function dropInvalidOptionalText(session: StoredSession, key: 'workspace' | 'agentId' | 'activePlan'): void {
  if (session[key] !== undefined && typeof session[key] !== 'string') {
    delete session[key];
  }
}

function assignContextParts(session: StoredSession): void {
  if (session.contextParts === undefined) return;
  const parts = normalizeContextParts(session.contextParts);
  if (parts) session.contextParts = parts;
  else delete session.contextParts;
}

function dropInvalidTitleSource(session: StoredSession): void {
  if (session.titleSource !== 'user' && session.titleSource !== 'auto') {
    delete session.titleSource;
  }
}

function rememberPolicy(session: StoredSession): void {
  const workspace = session.workspace || defaultWorkspaceRef();
  policyCache.set(session.id, normalizePolicyId(session, findWorkspace(workspace).defaultPolicy));
  if (!isSessionPolicyId(session.policyId)) session.policyId = policyCache.get(session.id);
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
