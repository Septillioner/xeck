import { Hono, type Context } from 'hono';
import { migrationSnapshot, runMigration } from '../../migrations/service.ts';
import { MigrationConflictError } from '../../migrations/legacy-data.ts';
import { StorageBusyError } from '../../infra/storage-maintenance.ts';
import { ALLOWED_ORIGINS } from '../../infra/server-config.ts';
import { readBody } from '../request.ts';

export const migrationRoutes = new Hono();

migrationRoutes.get('/api/migrations', async (c) => c.json(await migrationSnapshot()));
migrationRoutes.post('/api/migrations/:id', (c) => mutate(c));
migrationRoutes.post('/api/migrations/:id/skip', (c) => mutate(c, true));

async function mutate(c: Context, skip = false) {
  const origin = c.req.header('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return c.json({ error: 'Origin is not allowed.' }, 403);
  if (!c.req.header('content-type')?.startsWith('application/json')) return c.json({ error: 'Expected JSON.' }, 415);
  const body = await readBody(c);
  if (!body || Object.keys(body).length) return c.json({ error: 'Expected an empty JSON object; migration paths are fixed.' }, 400);
  try {
    const result = await runMigration(c.req.param('id') ?? '', skip);
    return result ? c.json(result) : c.json({ error: 'Migration not found.' }, 404);
  } catch (error) {
    if (error instanceof StorageBusyError || error instanceof MigrationConflictError) return c.json({ error: error.message }, 409);
    console.error('Migration failed', error);
    return c.json({ error: 'Could not complete the migration. Close other Xeck instances and check folder permissions, then retry.' }, 500);
  }
}
