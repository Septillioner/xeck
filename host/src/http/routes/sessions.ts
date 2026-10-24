import { Hono } from 'hono';
import { scaleCategoriesToTotal } from 'poyraz';
import { isSessionPolicyId, type ContextParts, type StoredSession } from '../../../../shared/types.ts';
import { abortChat, dropAgent } from '../../agent/runtime/agents/pool.ts';
import { inspectContext } from '../../agent/runtime/agents/execution.ts';
import { buildContextTree } from '../../agent/runtime/context/tree.ts';
import { abortDialogsForSession, listPendingDialogs, resolveDialog } from '../../agent/runtime/events/dialogs.ts';
import { getLiveChat } from '../../agent/runtime/events/live-chat.ts';
import { POLICY_BY_ID } from '../../agent/catalog/policies.ts';
import { WORKSPACE_BY_REF } from '../../agent/catalog/workspaces.ts';
import { alignProfile, apiKeyForProfile } from '../../stores/provider-store.ts';
import { readRules, readSkills } from '../../stores/instruction-store.ts';
import {
  createSession,
  deleteSession,
  isSessionId,
  listBotConversations,
  listChildSessions,
  listSessions,
  patchSession,
  readSession,
  setSessionContextParts,
  setSessionPolicyId,
} from '../../stores/sessions.ts';
import { postMessage } from '../chat-turn.ts';
import { streamSessionTurn } from '../session-stream.ts';
import { readBody } from '../request.ts';
import { loadEditableSession, readNewSession, readSessionPatch } from '../session-input.ts';

/** Session lifecycle plus the SSE endpoints a turn streams through. */
export const sessionRoutes = new Hono();

sessionRoutes.get('/api/sessions', async (c) => {
  const includeBotConversations = c.req.query('includeBotConversations') === 'true';
  return c.json(await listSessions(includeBotConversations));
});

sessionRoutes.post('/api/sessions', async (c) => {
  const created = await readNewSession(c);
  if (!created.ok) return c.json({ error: created.error }, created.status);
  const session = await createSession(
    created.profile,
    created.reasoningEffort,
    created.serviceTier,
    created.agentId,
    created.policyId,
    created.projectId,
    created.bot,
  );
  return c.json(session, 201);
});

sessionRoutes.put('/api/sessions/:id/policy', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  const body = await readBody(c);
  const policyId = body && typeof body.policyId === 'string' ? body.policyId : '';
  if (!isSessionPolicyId(policyId)) return c.json({ error: 'Policy must be a policy id' }, 400);
  const loaded = await loadEditableSession(id);
  if (!loaded.ok) return c.json({ error: loaded.error }, loaded.status);
  const workspace = loaded.session.workspace ? WORKSPACE_BY_REF[loaded.session.workspace] : undefined;
  if (!workspace?.policies.includes(policyId)) {
    return c.json({ error: 'Policy is not available for this agent' }, 400);
  }
  const session = await setSessionPolicyId(id, policyId, POLICY_BY_ID[policyId]?.entryLine);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  return c.json({ policyId, session });
});

sessionRoutes.get('/api/sessions/:id/context', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  const session = await readSession(id);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  const { compiled } = await inspectSession(session);
  const [rules, skills] = await Promise.all([readRules(), readSkills()]);
  return c.json(buildContextTree(compiled, rules, skills));
});

sessionRoutes.get('/api/sessions/:id', async (c) => {
  const session = await readSession(c.req.param('id'));
  if (!session) return c.json({ error: 'Session not found' }, 404);
  await fillContextParts(session);
  return c.json(session);
});

/** The request the library would compile for this session's stored history. */
async function inspectSession(session: StoredSession) {
  const profile = session.origin?.by === 'agent' ? session.profile : await alignProfile(session.profile);
  return inspectContext({
    sessionId: session.id,
    profile,
    apiKey: await apiKeyForProfile(profile),
    libraryMessages: session.libraryMessages,
  });
}

/**
 * A session with usage but no breakdown (stored before the meter existed) gets one
 * from the library estimate, scaled to the provider's last prompt size. A failure
 * leaves the session as it is: the breakdown is a display aid, not session data.
 */
async function fillContextParts(session: StoredSession): Promise<void> {
  if (!session.lastUsage || session.contextParts) return;
  try {
    const { estimate } = await inspectSession(session);
    const promptTokens = (session.contextUsage ?? session.lastUsage).promptTokens;
    const parts: ContextParts = scaleCategoriesToTotal(estimate.categories, promptTokens);
    session.contextParts = parts;
    await setSessionContextParts(session.id, parts);
  } catch (error) {
    console.warn(`Context breakdown for session ${session.id} could not be computed:`, error);
  }
}

sessionRoutes.patch('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const loaded = await loadEditableSession(id);
  if (!loaded.ok) return c.json({ error: loaded.error }, loaded.status);
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  const parsed = await readSessionPatch(id, body, loaded.session);
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
  const session = await patchSession(id, parsed.patch);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  return c.json(session);
});

sessionRoutes.delete('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const children = [...await listChildSessions(id), ...await listBotConversations(id)];
  for (const child of children) {
    dropAgent(child.id);
    abortDialogsForSession(child.id);
  }
  dropAgent(id);
  abortDialogsForSession(id);
  const removed = await deleteSession(id);
  if (!removed) return c.json({ error: 'Session not found' }, 404);
  return c.json({ ok: true });
});

sessionRoutes.post('/api/sessions/:id/cancel', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  for (const child of await listChildSessions(id)) {
    abortChat(child.id);
    abortDialogsForSession(child.id);
  }
  abortChat(id);
  abortDialogsForSession(id);
  return c.json({ ok: true });
});

sessionRoutes.get('/api/sessions/:id/dialogs', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  return c.json({ dialogs: listPendingDialogs(id) });
});

sessionRoutes.post('/api/sessions/:id/dialogs/:dialogId/respond', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  const dialogId = c.req.param('dialogId');
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  const approved = typeof body.approved === 'boolean' ? body.approved : undefined;
  const response = typeof body.response === 'string' ? body.response : undefined;
  const selections = Array.isArray(body.selections)
    ? body.selections.filter((value): value is string => typeof value === 'string')
    : undefined;
  const other = typeof body.other === 'string' ? body.other : undefined;
  const resolved = resolveDialog(dialogId, { approved, response, selections, other }, id);
  if (!resolved) return c.json({ error: 'Dialog not found or already resolved' }, 404);
  return c.json({ ok: true });
});

sessionRoutes.post('/api/sessions/:id/messages', postMessage);

sessionRoutes.get('/api/sessions/:id/stream', (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  const liveChat = getLiveChat(id);
  // 404 tells the client "nothing is running", so it can fall back to the
  // persisted transcript instead of waiting on an empty stream.
  if (!liveChat) return c.json({ error: 'No active chat' }, 404);
  return streamSessionTurn(c, liveChat);
});
