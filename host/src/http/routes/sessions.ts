import { Hono } from 'hono';
import { scaleCategoriesToTotal } from 'poyraz';
import {
  isSessionPolicyId,
  BOT_COLORS,
  MAX_BOT_PURPOSE_CHARS,
  type BotColor,
  type ContextParts,
  type StoredSession,
  type ReasoningEffort,
  type ServiceTier,
} from '../../../../shared/types.ts';
import { readProfileBody } from '../../domain/profiles.ts';
import { abortChat, dropAgent } from '../../agent/runtime/agents/pool.ts';
import { inspectContext } from '../../agent/runtime/agents/execution.ts';
import { buildContextTree } from '../../agent/runtime/context/tree.ts';
import { abortDialogsForSession, listPendingDialogs, resolveDialog } from '../../agent/runtime/events/dialogs.ts';
import { getLiveChat } from '../../agent/runtime/events/live-chat.ts';
import { alignProfile, apiKeyForProfile, providerIsEnabled } from '../../stores/provider-store.ts';
import { readRules, readSkills } from '../../stores/instruction-store.ts';
import { readSettings } from '../../stores/settings-store.ts';
import { AGENT_BY_ID } from '../../agent/catalog/agents.ts';
import { POLICY_BY_ID } from '../../agent/catalog/policies.ts';
import { agentWorkspaceRef, defaultAgentId } from '../../agent/workspaces/resolve.ts';
import { WORKSPACE_BY_REF } from '../../agent/catalog/workspaces.ts';
import {
  createSession,
  deleteSession,
  isSessionId,
  listChildSessions,
  listBotConversations,
  listSessions,
  patchSession,
  readSession,
  setSessionContextParts,
  setSessionPolicyId,
} from '../../stores/sessions.ts';
import { getProject } from '../../stores/projects.ts';
import { postMessage } from '../chat-turn.ts';
import { streamSessionTurn } from '../session-stream.ts';
import { readBody, readEffort, readServiceTier } from '../request.ts';
import { BotIdentityError, createBotIdentity } from '../../agent/runtime/agents/create-bot-identity.ts';

/** Session lifecycle plus the SSE endpoints a turn streams through. */
export const sessionRoutes = new Hono();

sessionRoutes.get('/api/sessions', async (c) => c.json(await listSessions(c.req.query('includeBotConversations') === 'true')));

sessionRoutes.post('/api/sessions', async (c) => {
  const body = await readBody(c);
  const requested = body && 'profile' in body ? readProfileBody(body.profile) : null;
  const settings = await readSettings();
  let profile = requested?.model ? requested : settings.defaultProfile;
  if (profile && !(await providerIsEnabled(profile.provider))) profile = null;
  if (profile) profile = await alignProfile(profile);
  const effort = body ? readEffort(body.reasoningEffort) : undefined;
  if (effort === false) return c.json({ error: 'Invalid reasoning effort' }, 400);
  const tier = body ? readServiceTier(body.serviceTier) : undefined;
  if (tier === false) return c.json({ error: 'Invalid service tier' }, 400);
  const agentId = typeof body?.agentId === 'string' ? body.agentId.trim() : '';
  if (agentId && !AGENT_BY_ID[agentId]) {
    return c.json({ error: 'Unknown agent' }, 400);
  }
  if (agentId && !AGENT_BY_ID[agentId]?.startableBy.includes('user')) {
    return c.json({ error: 'This agent can only be started by another agent' }, 400);
  }
  let policyId: string | undefined;
  if (body?.policyId !== undefined) {
    if (!isSessionPolicyId(body.policyId)) return c.json({ error: 'Invalid policy' }, 400);
    policyId = body.policyId;
    const workspace = WORKSPACE_BY_REF[agentWorkspaceRef(agentId || defaultAgentId())];
    if (!workspace?.policies.includes(policyId)) {
      return c.json({ error: 'Policy is not available for this agent' }, 400);
    }
  }
  let projectId: string | undefined;
  if (body?.projectId !== undefined) {
    if (typeof body.projectId !== 'string' || !(await getProject(body.projectId))) {
      return c.json({ error: 'Unknown project' }, 400);
    }
    projectId = body.projectId;
  }
  let bot: { name: string; color: BotColor; purpose: string; systemPrompt: string } | undefined;
  if (body?.bot !== undefined) {
    const value = body.bot as { name?: unknown; color?: unknown; purpose?: unknown } | null;
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80 || !BOT_COLORS.includes(value.color as BotColor)) {
      return c.json({ error: 'Enter a name (up to 80 characters) and a valid color' }, 400);
    }
    if (projectId) return c.json({ error: 'XeckBots cannot belong to a project' }, 400);
    if (typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.trim().length > MAX_BOT_PURPOSE_CHARS) {
      return c.json({ error: `XeckBot'un ne yapacağını yaz (en fazla ${MAX_BOT_PURPOSE_CHARS} karakter).` }, 400);
    }
    const name = value.name.trim();
    const purpose = value.purpose.trim();
    try {
      const systemPrompt = await createBotIdentity(name, purpose, c.req.raw.signal);
      bot = { name, color: value.color as BotColor, purpose, systemPrompt };
    } catch (error) {
      if (error instanceof BotIdentityError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  }
  const session = await createSession(
    profile,
    effort || undefined,
    tier || undefined,
    agentId || undefined,
    policyId,
    projectId,
    bot,
  );
  return c.json(session, 201);
});

sessionRoutes.put('/api/sessions/:id/policy', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  const body = await readBody(c);
  const policyId = body && typeof body.policyId === 'string' ? body.policyId : '';
  if (!isSessionPolicyId(policyId)) return c.json({ error: 'Policy must be a policy id' }, 400);
  const existing = await readSession(id);
  if (!existing) return c.json({ error: 'Session not found' }, 404);
  if (existing.botConversation) return c.json({ error: 'Bot conversations are managed by XeckBots' }, 403);
  if (existing.origin?.by === 'agent') return c.json({ error: 'Subagent sessions are read-only' }, 403);
  const workspace = existing.workspace ? WORKSPACE_BY_REF[existing.workspace] : undefined;
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
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  const existing = await readSession(id);
  if (!existing) return c.json({ error: 'Session not found' }, 404);
  if (existing.botConversation) return c.json({ error: 'Bot conversations are managed by XeckBots' }, 403);
  if (existing.origin?.by === 'agent') return c.json({ error: 'Subagent sessions are read-only' }, 403);
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  let profile = undefined;
  if ('profile' in body) {
    const parsed = readProfileBody(body.profile);
    if (!parsed || !parsed.model) return c.json({ error: 'Invalid model' }, 400);
    if (!(await providerIsEnabled(parsed.provider))) return c.json({ error: 'Provider is disabled' }, 400);
    profile = await alignProfile(parsed);
  }

  const title = typeof body.title === 'string' ? body.title : undefined;
  let reasoningEffort: ReasoningEffort | null | undefined;
  if ('reasoningEffort' in body) {
    const effort = readEffort(body.reasoningEffort);
    if (effort === false) return c.json({ error: 'Invalid reasoning effort' }, 400);
    reasoningEffort = effort;
  }
  let serviceTier: ServiceTier | null | undefined;
  if ('serviceTier' in body) {
    const tier = readServiceTier(body.serviceTier);
    if (tier === false) return c.json({ error: 'Invalid service tier' }, 400);
    serviceTier = tier;
  }
  let projectId: string | null | undefined;
  if ('projectId' in body) {
    const existing = await readSession(id);
    if (existing?.bot && body.projectId !== null) return c.json({ error: 'XeckBots cannot belong to a project' }, 400);
    if (body.projectId === null) projectId = null;
    else if (typeof body.projectId !== 'string' || !(await getProject(body.projectId))) {
      return c.json({ error: 'Unknown project' }, 400);
    } else {
      projectId = body.projectId;
    }
  }
  const session = await patchSession(id, { title, profile, reasoningEffort, serviceTier, projectId });
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
