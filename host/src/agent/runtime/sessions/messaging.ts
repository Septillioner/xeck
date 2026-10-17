import { randomUUID } from 'node:crypto';
import type { StoredSession } from '../../../../../shared/types.ts';
import { AGENT_BY_ID } from '../../catalog/agents.ts';
import { WORKSPACE_BY_REF } from '../../catalog/workspaces.ts';
import { selectedBuiltinNames } from '../../workspaces/definitions.ts';
import { policyRejection } from '../../tools/policy-context.ts';
import { LIST_MESSAGE_TARGETS_TOOL, SEND_CHAT_MESSAGE_TOOL } from '../../tools/builtin/messaging.ts';
import { BUILTIN_TOOL_PREFIX } from '../../tools/builtin/identity.ts';
import { listChildSessions, listSessions, readSession } from '../../../stores/sessions.ts';
import { getActiveTurn, recordSubagentUsage, type AgentTurn } from '../agents/pool.ts';
import { requestUserApproval } from '../events/dialogs.ts';
import { startSessionTurn } from './turn.ts';

const attempts = new WeakMap<AgentTurn, number>();

async function sender(sessionId: string, tool: string) {
  const turn = getActiveTurn(sessionId);
  const session = await readSession(sessionId);
  if (!turn || !session || session.origin?.by === 'agent') throw new Error('Messaging requires an active user-owned chat.');
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
  const candidates = [...(await listSessions()).slice(0, 40), ...await listChildSessions(sourceId)];
  return candidates.filter((item) => item.id !== sourceId).map((item) => ({
    sessionId: item.id, title: item.title, busy: Boolean(getActiveTurn(item.id)),
    ...(item.parentId ? { parentId: item.parentId } : {}),
  }));
}

async function recipient(sourceId: string, targetId: string): Promise<StoredSession> {
  if (targetId === sourceId) throw new Error('A chat cannot send messages to itself.');
  const target = await readSession(targetId);
  if (!target) throw new Error('Target chat was not found.');
  if (target.origin?.by === 'agent' && target.origin.parent !== sourceId) throw new Error('Another chat\'s child is not a message target.');
  if (!target.agentId || !AGENT_BY_ID[target.agentId]) throw new Error('Target agent is unavailable.');
  if (getActiveTurn(targetId)) throw new Error('Target chat is busy. Retry after its turn finishes.');
  return target;
}

/** Synchronous, one-hop delivery through the existing session lifecycle; no second queue or loop. */
export async function sendChatMessage(sourceId: string, targetId: string, content: string) {
  if (!content.trim() || content.length > 10_000) throw new Error('Message must contain 1–10000 characters.');
  const { session: source, turn } = await sender(sourceId, SEND_CHAT_MESSAGE_TOOL);
  const used = attempts.get(turn) ?? 0;
  if (used >= 4) throw new Error('This turn reached its four-message attempt limit.');
  attempts.set(turn, used + 1);
  const target = await recipient(sourceId, targetId);
  const approved = await requestUserApproval({
    sessionId: sourceId, signal: turn.signal, title: 'Send message to another chat',
    prompt: `Send to "${target.title}" [${target.id}] (${target.agentId}, policy: ${target.policyId})? The recipient will use its own tools under that policy.\n\n${content}`,
    details: { targetSessionId: targetId, targetAgentId: target.agentId, targetPolicy: target.policyId, content },
  });
  if (!approved) return { sessionId: targetId, status: 'declined' as const };
  const latestSource = await sender(sourceId, SEND_CHAT_MESSAGE_TOOL);
  if (latestSource.turn !== turn) throw new Error('The sending turn has ended.');
  const currentTarget = await recipient(sourceId, targetId);
  if (JSON.stringify(currentTarget) !== JSON.stringify(target)) throw new Error('Target chat changed while approval was pending. Send again to review the current target.');
  const messageSource = { messageId: randomUUID(), sessionId: sourceId, agentId: source.agentId ?? '', title: source.title };
  const deadline = AbortSignal.timeout(5 * 60_000);
  const { completion } = await startSessionTurn(currentTarget, content, AbortSignal.any([turn.signal, deadline]), messageSource);
  const outcome = await completion;
  if (currentTarget.origin?.by !== 'agent' && outcome.usage) recordSubagentUsage(sourceId, outcome.usage);
  return {
    sessionId: targetId, messageId: messageSource.messageId,
    status: deadline.aborted || outcome.error ? 'failed' as const : outcome.aborted ? 'cancelled' as const : 'done' as const,
    ...(outcome.content ? { result: outcome.content } : {}),
    ...(deadline.aborted ? { error: 'Recipient exceeded the five-minute message limit.' } : outcome.error ? { error: outcome.error } : {}),
  };
}
