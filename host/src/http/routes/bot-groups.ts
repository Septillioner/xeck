import { Hono } from 'hono';
import { assignBotGroup, deleteBotGroup, listBotGroups, saveBotGroup } from '../../stores/bot-groups.ts';
import { readSession } from '../../stores/sessions.ts';
import { readBody } from '../request.ts';

export const botGroupRoutes = new Hono();
botGroupRoutes.get('/api/bot-groups', async (c) => c.json(await listBotGroups()));
botGroupRoutes.post('/api/bot-groups', async (c) => {
  const body = await readBody(c);
  try { return c.json(await saveBotGroup(null, typeof body?.name === 'string' ? body.name : ''), 201); }
  catch (cause) { return c.json({ error: cause instanceof Error ? cause.message : 'Request failed' }, 400); }
});
botGroupRoutes.patch('/api/bot-groups/:id', async (c) => {
  const body = await readBody(c);
  try {
    const groups = await saveBotGroup(c.req.param('id'), typeof body?.name === 'string' ? body.name : '');
    return groups ? c.json(groups) : c.json({ error: 'Group not found' }, 404);
  } catch (cause) { return c.json({ error: cause instanceof Error ? cause.message : 'Request failed' }, 400); }
});
botGroupRoutes.put('/api/bot-groups/membership/:botId', async (c) => {
  const bot = await readSession(c.req.param('botId'));
  if (!bot?.bot || bot.botConversation || bot.origin?.by === 'agent') return c.json({ error: 'XeckBot not found' }, 404);
  const body = await readBody(c);
  if (!body || (body.groupId !== null && typeof body.groupId !== 'string')) return c.json({ error: 'Invalid group' }, 400);
  const groups = await assignBotGroup(bot.id, body.groupId as string | null);
  return groups ? c.json(groups) : c.json({ error: 'Group not found' }, 404);
});
botGroupRoutes.delete('/api/bot-groups/:id', async (c) => c.json(await deleteBotGroup(c.req.param('id'))));
