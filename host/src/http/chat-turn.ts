import type { Context } from 'hono';
import { ChatInFlightError } from '../agent/runtime/agents/pool.ts';
import { SessionTurnInputError, startSessionTurn } from '../agent/runtime/sessions/turn.ts';
import { readSession } from '../stores/sessions.ts';
import { readBody } from './request.ts';
import { streamSessionTurn } from './session-stream.ts';

/** HTTP starts the same session turn used by delegation and subscribes to it. */
export async function postMessage(c: Context) {
  const session = await readSession(c.req.param('id') ?? '');
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.botConversation) return c.json({ error: 'Bot conversations are managed by XeckBots' }, 403);
  if (session.origin?.by === 'agent') return c.json({ error: 'Subagent turns are managed by the parent agent' }, 403);
  const body = await readBody(c);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  try {
    const { liveChat } = await startSessionTurn(session, content);
    return streamSessionTurn(c, liveChat);
  } catch (error) {
    if (error instanceof SessionTurnInputError) return c.json({ error: error.message }, 400);
    if (error instanceof ChatInFlightError) return c.json({ error: error.message }, 409);
    throw error;
  }
}
