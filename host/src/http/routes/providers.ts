import { Hono } from 'hono';
import { isLocalProvider, isProviderKind } from '../../../../shared/types.ts';
import { applyContextLengths, applyReasoningEffortFlags } from '../../stores/catalog-store.ts';
import { listModelsForProvider, listProviders, updateProvider } from '../../stores/provider-store.ts';
import { readBody } from '../request.ts';

/** Provider credentials and the model discovery that fills the catalog. */
export const providerRoutes = new Hono();

providerRoutes.get('/api/providers', async (c) => c.json(await listProviders()));

providerRoutes.put('/api/providers/:kind', async (c) => {
  const kind = c.req.param('kind');
  if (!isProviderKind(kind)) return c.json({ error: 'Unknown provider' }, 404);
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  const updated = await updateProvider(kind, {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
    clearApiKey: body.clearApiKey === true,
    host: typeof body.host === 'string' ? body.host : undefined,
    model: typeof body.model === 'string' ? body.model : undefined,
  });
  return c.json(updated);
});

providerRoutes.post('/api/providers/:kind/models', async (c) => {
  const kind = c.req.param('kind');
  if (!isProviderKind(kind)) return c.json({ error: 'Unknown provider' }, 404);
  const body = (await readBody(c)) ?? {};
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
  const host = typeof body.host === 'string' ? body.host : undefined;
  if (!isLocalProvider(kind)) {
    const stored = (await listProviders()).find((item) => item.kind === kind);
    const hasKey = Boolean(apiKey?.trim()) || Boolean(stored?.configured);
    if (!hasKey) return c.json({ error: 'Provider API key is missing' }, 400);
  }
  let models;
  try {
    models = await listModelsForProvider(kind, { apiKey, host });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not list models';
    return c.json({ error: message }, 502);
  }
  await applyContextLengths(kind, models);
  await applyReasoningEffortFlags(kind, models);
  return c.json({ models });
});