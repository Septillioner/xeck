import { Hono } from 'hono';
import { readSettings, writeSettings } from '../../stores/settings-store.ts';
import { readBody } from '../request.ts';

/** Host settings: default profile, workspace root, access mode, and prompt options. */
export const settingsRoutes = new Hono();

settingsRoutes.get('/api/settings', async (c) => c.json(await readSettings()));

settingsRoutes.put('/api/settings', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  try {
    return c.json(await writeSettings(body));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Invalid settings' }, 400);
  }
});
