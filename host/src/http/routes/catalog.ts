import { Hono } from 'hono';
import { isProviderKind } from '../../../../shared/types.ts';
import {
  addCatalogEntry,
  CatalogError,
  listCatalog,
  removeCatalogEntry,
  setCatalogContextLength,
  setCatalogMaxContext,
} from '../../stores/catalog-store.ts';
import { readBody } from '../request.ts';

/** The known model list with per-model context lengths and reasoning support. */
export const catalogRoutes = new Hono();

catalogRoutes.get('/api/catalog', async (c) => c.json(await listCatalog()));

catalogRoutes.post('/api/catalog', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  const provider = typeof body.provider === 'string' ? body.provider : '';
  const model = typeof body.model === 'string' ? body.model : '';
  const name = typeof body.name === 'string' ? body.name : undefined;
  const contextLength = typeof body.contextLength === 'number' ? body.contextLength : undefined;
  const supportsReasoningEffort = body.supportsReasoningEffort === true ? true : undefined;
  if (!isProviderKind(provider)) return c.json({ error: 'Unknown provider' }, 404);
  try {
    return c.json(await addCatalogEntry(provider, model, name, contextLength, supportsReasoningEffort));
  } catch (error) {
    if (error instanceof CatalogError) return c.json({ error: error.message }, 400);
    throw error;
  }
});

catalogRoutes.delete('/api/catalog', async (c) => {
  const slug = c.req.query('slug')?.trim() ?? '';
  if (!slug) return c.json({ error: 'Catalog slug is missing' }, 400);
  return c.json(await removeCatalogEntry(slug));
});

catalogRoutes.patch('/api/catalog/context-length', async (c) => {
  const body = await readBody(c);
  if (!body || typeof body.slug !== 'string') return c.json({ error: 'Invalid JSON' }, 400);
  try {
    return c.json(await setCatalogContextLength(body.slug.trim(), body.contextLength));
  } catch (error) {
    if (error instanceof CatalogError) return c.json({ error: error.message }, 400);
    throw error;
  }
});

catalogRoutes.patch('/api/catalog/max-context', async (c) => {
  const body = await readBody(c);
  if (!body || typeof body.slug !== 'string') return c.json({ error: 'Invalid JSON' }, 400);
  try {
    return c.json(await setCatalogMaxContext(body.slug.trim(), body.enabled));
  } catch (error) {
    if (error instanceof CatalogError) return c.json({ error: error.message }, 400);
    throw error;
  }
});
