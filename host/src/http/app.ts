import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ALLOWED_ORIGINS } from '../infra/server-config.ts';
import { agentRoutes } from './routes/agents.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { instructionRoutes } from './routes/instructions.ts';
import { mcpRoutes } from './routes/mcp.ts';
import { planRoutes } from './routes/plan.ts';
import { providerRoutes } from './routes/providers.ts';
import { sessionRoutes } from './routes/sessions.ts';
import { projectRoutes } from './routes/projects.ts';
import { settingsRoutes } from './routes/settings.ts';
import { migrationRoutes } from './routes/migrations.ts';
import { StorageBusyError, withStorageRequest } from '../infra/storage-maintenance.ts';
import { inspectLegacyData } from '../migrations/legacy-data.ts';

/**
 * The whole HTTP surface. Routes live in `./routes`, one module per resource; the turn
 * lifecycle and transcript building blocks live in `agent/runtime`.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        if (!origin) return ALLOWED_ORIGINS[0];
        return ALLOWED_ORIGINS.includes(origin) ? origin : null;
      },
    }),
  );

  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/migrations' || c.req.path.startsWith('/api/migrations/')) return next();
    try {
      return await withStorageRequest(async () => {
        if ((await inspectLegacyData()).state === 'ready') {
          return c.json({ error: 'Choose whether to migrate existing data or start fresh.', migrationRequired: true }, 409);
        }
        await next();
      });
    }
    catch (error) {
      if (error instanceof StorageBusyError) return c.json({ error: error.message }, 503);
      throw error;
    }
  });

  app.route('/', migrationRoutes);
  app.route('/', sessionRoutes);
  app.route('/', projectRoutes);
  app.route('/', agentRoutes);
  app.route('/', instructionRoutes);
  app.route('/', mcpRoutes);
  app.route('/', planRoutes);
  app.route('/', catalogRoutes);
  app.route('/', providerRoutes);
  app.route('/', settingsRoutes);

  return app;
}
