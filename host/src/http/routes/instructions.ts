import { Hono } from 'hono';
import { MemoryRejected, readMemories, writeMemories } from '../../stores/memory-store.ts';
import { readRuleRecords, readSkills, writeRuleRecords, writeSkills } from '../../stores/instruction-store.ts';
import { readBody } from '../request.ts';

/** Rules, skills, and memories: the records the agent is told about or can persist. */
export const instructionRoutes = new Hono();

instructionRoutes.get('/api/rules', async (c) => c.json({ rules: await readRuleRecords() }));

instructionRoutes.put('/api/rules', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  return c.json({ rules: await writeRuleRecords(body.rules) });
});

instructionRoutes.get('/api/memories', async (c) => c.json({ memories: await readMemories() }));

instructionRoutes.put('/api/memories', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  try {
    return c.json({ memories: await writeMemories(body.memories) });
  } catch (error) {
    if (error instanceof MemoryRejected) return c.json({ error: error.message }, 400);
    throw error;
  }
});

instructionRoutes.get('/api/skills', async (c) => c.json({ skills: await readSkills() }));

instructionRoutes.put('/api/skills', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  return c.json({ skills: await writeSkills(body.skills) });
});