import { randomUUID } from 'node:crypto';
import type { StoredSession } from '../../../../../shared/types.ts';
import { AGENT_BY_ID } from '../../catalog/agents.ts';
import { WORKSPACE_BY_REF } from '../../catalog/workspaces.ts';
import { selectedBuiltinNames } from '../../workspaces/definitions.ts';
import { policyRejection } from '../../tools/policy-context.ts';
import { LIST_MESSAGE_TARGETS_TOOL, SEND_CHAT_MESSAGE_TOOL } from '../../tools/builtin/messaging.ts';
import { BUILTIN_TOOL_PREFIX } from '../../tools/builtin/identity.ts';
import { botConversationFor, listSessions, readSession } from '../../../stores/sessions.ts';
import { getActiveTurn, recordSubagentUsage, type AgentTurn } from '../agents/pool.ts';
import { startSessionTurn } from './turn.ts';

const attempts = new WeakMap<AgentTurn, number>();
const runningPairs = new Set<string>();
const pairKey = (a: string, b: string) => [a, b].sort().join(':');

async function sender(sessionId: string, tool: string) {
  const turn = getActiveTurn(sessionId);
  const session = await readSession(sessionId);
  if (!turn || !session || session.origin?.by === 'agent') throw new Error('Messaging requires an active user-owned chat.');
  if (!session.bot || session.botConversation) throw new Error('Chat messaging is available only in XeckBot.');
  turn.signal.throwIfAborted();
  if (turn.messageSource) throw new Error('An incoming agent message cannot be relayed to another chat.');
  const workspace = session.workspace ? WORKSPACE_BY_REF[session.workspace] : undefined;
  if (!workspace || !selectedBuiltinNames(workspace.toolset.builtin).includes(tool)) throw new Error('This workspace does not offer chat messaging.');
  const blocked = await policyRejection(`${BUILTIN_TOOL_PREFIX}${tool}`, sessionId);
  if (blocked) throw new Error(blocked);
  if (getActiveTurn(sessionId) !== turn) throw new Error('The sending turn has ended.');
  turn.signal.throwIfAborted();
  return { session, turn };
}

export async function listMessageTargets(sourceId: string) {
  await sender(sourceId, LIST_MESSAGE_TARGETS_TOOL);
  const candidates = (await listSessions()).filter((session) => session.bot).slice(0, 40);
  return candidates.filter((item) => item.id !== sourceId).map((item) => ({
    sessionId: item.id, title: item.title, busy: runningPairs.has(pairKey(sourceId, item.id)),
    ...(item.parentId ? { parentId: item.parentId } : {}),
  }));
}

async function recipient(sourceId: string, targetId: string): Promise<StoredSession> {
  if (targetId === sourceId) throw new Error('A chat cannot send messages to itself.');
  const target = await readSession(targetId);
  if (!target) throw new Error('Target chat was not found.');
  if (target.origin?.by === 'agent' && target.origin.parent !== sourceId) throw new Error('Another chat\'s child is not a message target.');
  if (!target.bot || target.botConversation) throw new Error('Messages can only be sent to a XeckBot.');
  if (!target.agentId || !AGENT_BY_ID[target.agentId]) throw new Error('Target agent is unavailable.');
  return target;
}

/** Synchronous, one-hop delivery through the existing session lifecycle; no second queue or loop. */
export async function sendChatMessage(sourceId: string, targetId: string, content: string) {
  if (!content.trim() || content.length > 10_000) throw new Error('Message must contain 1–10000 characters.');
  const { session: source, turn } = await sender(sourceId, SEND_CHAT_MESSAGE_TOOL);
  const used = attempts.get(turn) ?? 0;
  if (used >= 4) throw new Error('This turn reached its four-message attempt limit.');
  attempts.set(turn, used + 1);
  const latestSource = await sender(sourceId, SEND_CHAT_MESSAGE_TOOL);
  if (latestSource.turn !== turn) throw new Error('The sending turn has ended.');
  const currentTarget = await recipient(sourceId, targetId);
  const key = pairKey(sourceId, targetId);
  if (runningPairs.has(key)) throw new Error('This bot conversation is busy. Retry after its turn finishes.');
  runningPairs.add(key);
  try {
    const conversation = await botConversationFor(source.id, currentTarget.id);
    if (getActiveTurn(sourceId) !== turn) throw new Error('The sending turn has ended.');
    turn.signal.throwIfAborted();
    const messageSource = { messageId: randomUUID(), sessionId: sourceId, agentId: source.agentId ?? '', title: source.title };
    const deadline = AbortSignal.timeout(5 * 60_000);
    const { completion } = await startSessionTurn(conversation, content, AbortSignal.any([turn.signal, deadline]), messageSource);
    const outcome = await completion;
    if (outcome.usage) recordSubagentUsage(sourceId, outcome.usage);
    return {
      sessionId: targetId, conversationId: conversation.id, messageId: messageSource.messageId,
      status: deadline.aborted || outcome.error ? 'failed' as const : outcome.aborted ? 'cancelled' as const : 'done' as const,
      ...(outcome.content ? { result: outcome.content } : {}),
      ...(deadline.aborted ? { error: 'Recipient exceeded the five-minute message limit.' } : outcome.error ? { error: outcome.error } : {}),
    };
  } finally { runningPairs.delete(key); }

}
