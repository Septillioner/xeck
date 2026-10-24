import { Hono } from 'hono';
import { MemoryRejected, readMemories, writeMemories, type MemoryScope } from '../../stores/memory-store.ts';
import { readRuleRecords, readSkills, writeRuleRecords, writeSkills } from '../../stores/instruction-store.ts';
import { listProjects, isProjectId } from '../../stores/projects.ts';
import { listSessions } from '../../stores/sessions.ts';
import { readBody } from '../request.ts';

/** Rules, skills, and memories: the records the agent is told about or can persist. */
export const instructionRoutes = new Hono();

instructionRoutes.get('/api/rules', async (c) => c.json({ rules: await readRuleRecords() }));

instructionRoutes.put('/api/rules', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  return c.json({ rules: await writeRuleRecords(body.rules) });
});

instructionRoutes.get('/api/memory-scopes', async (c) => {
  const [sessions, projects] = await Promise.all([listSessions(), listProjects()]);
  return c.json({
    bots: sessions.filter((session) => session.bot).map((session) => ({ id: session.id, name: session.title })),
    projects: projects.map(({ id, name }) => ({ id, name })),
  });
});

instructionRoutes.get('/api/memories', async (c) => {
  const scope = await resolveMemoryScope(c.req.query('scope'), c.req.query('id'));
  if (!scope) return c.json({ error: 'Memory scope not found' }, 404);
  return c.json({ memories: await readMemories(scope) });
});

instructionRoutes.put('/api/memories', async (c) => {
  const scope = await resolveMemoryScope(c.req.query('scope'), c.req.query('id'));
  if (!scope) return c.json({ error: 'Memory scope not found' }, 404);
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  try {
    return c.json({ memories: await writeMemories(body.memories, scope) });
  } catch (error) {
    if (error instanceof MemoryRejected) return c.json({ error: error.message }, 400);
    throw error;
  }
});

async function resolveMemoryScope(kind: string | undefined, id: string | undefined): Promise<MemoryScope | null> {
  if (!kind || kind === 'user') return { kind: 'user' };
  if (!id) return null;
  if (kind === 'bot') {
    const sessions = await listSessions();
    return sessions.some((session) => session.id === id && session.bot) ? { kind: 'bot', id } : null;
  }
  if (kind === 'project' && isProjectId(id) && await listProjects().then((rows) => rows.some((project) => project.id === id))) {
    return { kind: 'project', id };
  }
  return null;
}

instructionRoutes.get('/api/skills', async (c) => c.json({ skills: await readSkills() }));

instructionRoutes.put('/api/skills', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  return c.json({ skills: await writeSkills(body.skills) });
});
