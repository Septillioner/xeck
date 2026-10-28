import type { BotColor } from '../../../../../shared/types.ts';
import { createSession, readSession } from '../../../stores/sessions.ts';
import { policyRejection } from '../../tools/policy-context.ts';
import { BUILTIN_TOOL_PREFIX } from '../../tools/builtin/identity.ts';
import { CREATE_XECKBOT_TOOL } from '../../tools/builtin/bots.ts';
import { getActiveTurn } from './pool.ts';
import { createBotIdentity } from './create-bot-identity.ts';
import { getLiveChat, publishLive } from '../events/live-chat.ts';

export async function createXeckBot(sourceId: string, draft: { name: string; purpose: string; color: BotColor }, signal?: AbortSignal) {
  const turn = getActiveTurn(sourceId);
  const source = await readSession(sourceId);
  if (!turn || !source || (!source.bot && source.agentId !== 'xeck') || source.botConversation || source.origin?.by === 'agent' || turn.messageSource) {
    throw new Error('XeckBot creation requires an active personal Xeck or XeckBot chat.');
  }
  const combinedSignal = signal ? AbortSignal.any([turn.signal, signal]) : turn.signal;
  async function checkPermission() {
    combinedSignal.throwIfAborted();
    if (getActiveTurn(sourceId) !== turn) throw new Error('The creating turn has ended.');
    const blocked = await policyRejection(`${BUILTIN_TOOL_PREFIX}${CREATE_XECKBOT_TOOL}`, sourceId);
    if (blocked) throw new Error(blocked);
  }
  await checkPermission();
  const systemPrompt = await createBotIdentity(draft.name, draft.purpose, combinedSignal);
  await checkPermission();
  const bot = await createSession(null, undefined, undefined, undefined, undefined, undefined, { ...draft, systemPrompt });
  const live = getLiveChat(sourceId);
  if (live) publishLive(live, 'session.created', { session: bot });
  return { sessionId: bot.id, name: draft.name, purpose: draft.purpose, color: draft.color };
}
