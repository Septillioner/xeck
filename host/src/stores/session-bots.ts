import { randomUUID } from 'node:crypto';
import type { LibraryMessage, SessionSummary, StoredSession } from '../../../shared/types.ts';
import {
  readIndex,
  readSessionFile,
  sortByUpdated,
  toSummary,
  withSessionLock,
  writeIndex,
  writeSessionFile,
} from './session-record.ts';
import { hooksRegistered, notifySessionStarted } from '../agent/runtime/hooks.ts';

const DISTINCT_BOTS_ERROR = 'Messaging participants must be distinct XeckBots.';

export async function listBotConversations(botId?: string): Promise<SessionSummary[]> {
  return withSessionLock(async () => {
    const index = await readIndex();
    return sortByUpdated(index.sessions.filter((session) => belongsToBot(session, botId)));
  });
}

/** A shared pair has its own history; personal user/bot histories are never copied. */
export async function botConversationFor(sourceId: string, targetId: string): Promise<StoredSession> {
  const { session, created } = await withSessionLock(async () => {
    const source = await readSessionFile(sourceId);
    const target = await readSessionFile(targetId);
    if (!source?.bot || !target?.bot || !areDistinctBots(source, target, sourceId, targetId)) {
      throw new Error(DISTINCT_BOTS_ERROR);
    }
    const participants = [sourceId, targetId].sort() as [string, string];
    const index = await readIndex();
    const summary = findPair(index.sessions, participants);
    const existing = summary ? await readSessionFile(summary.id) : null;
    const conversation = existing ?? newConversation(source, target);
    if (existing && existing.botConversation?.responderId !== targetId) {
      conversation.libraryMessages = libraryForResponder(conversation, targetId);
    }
    assignResponder(conversation, target, targetId, participants);
    await writeSessionFile(conversation);
    placeSummary(index.sessions, conversation);
    await writeIndex(index);
    return { session: conversation, created: !existing };
  });
  if (created && hooksRegistered('SessionStart')) await notifySessionStarted(session.id, session.agentId);
  return session;
}

function belongsToBot(session: SessionSummary, botId?: string): boolean {
  if (session.parentId || !session.botConversation) return false;
  return !botId || session.botConversation.participants.includes(botId);
}

function areDistinctBots(source: StoredSession, target: StoredSession, sourceId: string, targetId: string): boolean {
  if (!source.bot || !target.bot) return false;
  if (source.origin?.by === 'agent' || target.origin?.by === 'agent') return false;
  if (source.botConversation || target.botConversation) return false;
  return sourceId !== targetId;
}

function findPair(sessions: SessionSummary[], participants: [string, string]): SessionSummary | undefined {
  return sessions.find((item) =>
    item.botConversation?.participants[0] === participants[0]
    && item.botConversation.participants[1] === participants[1]);
}

function newConversation(source: StoredSession, target: StoredSession): StoredSession {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    origin: { by: 'user' },
    title: `${source.title} ↔ ${target.title}`,
    titleSource: 'user',
    createdAt: now,
    updatedAt: now,
    profile: target.profile,
    messages: [],
    libraryMessages: [],
  };
}

/** When the direction changes, each bot's own prior messages are assistant turns. */
function libraryForResponder(session: StoredSession, targetId: string): LibraryMessage[] {
  return session.messages
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.source?.sessionId === targetId ? 'assistant' : 'user',
      content: message.content,
    }));
}

function assignResponder(
  session: StoredSession,
  target: StoredSession,
  targetId: string,
  participants: [string, string],
): void {
  if (!target.bot) throw new Error(DISTINCT_BOTS_ERROR);
  session.botConversation = { participants, responderId: targetId, responderTitle: target.title };
  session.bot = { ...target.bot };
  session.agentId = target.agentId;
  session.workspace = target.workspace;
  session.policyId = target.policyId;
  session.profile = { ...target.profile };
  session.reasoningEffort = target.reasoningEffort;
  session.serviceTier = target.serviceTier;
}

function placeSummary(sessions: SessionSummary[], session: StoredSession): void {
  const summary = toSummary(session);
  const position = sessions.findIndex((item) => item.id === session.id);
  if (position < 0) sessions.push(summary);
  else sessions[position] = summary;
}
