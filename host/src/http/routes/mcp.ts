import { Hono } from 'hono';
import { readMcpServers, refreshMcp, setBuiltinMcpDisabledTools, setBuiltinMcpEnabled, writeMcpServers } from '../../stores/mcp-store.ts';
import { readBody } from '../request.ts';

/** Configured MCP servers and the always-present built-in server. */
export const mcpRoutes = new Hono();

mcpRoutes.get('/api/mcp', async (c) => {
  const snapshot = await refreshMcp();
  return c.json({ servers: snapshot.servers, states: snapshot.states, builtin: snapshot.builtin });
});

mcpRoutes.put('/api/mcp', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  return c.json(await writeMcpServers(body.servers));
});

mcpRoutes.put('/api/mcp/builtin', async (c) => {
  const body = await readBody(c);
  if (!body || typeof body.enabled !== 'boolean') return c.json({ error: 'Invalid JSON' }, 400);
  return c.json(await setBuiltinMcpEnabled(body.enabled));
});

mcpRoutes.put('/api/mcp/builtin/tools', async (c) => {
  const body = await readBody(c);
  if (!body || !Array.isArray(body.disabled) || body.disabled.some((name: unknown) => typeof name !== 'string')) return c.json({ error: 'Invalid JSON' }, 400);
  return c.json(await setBuiltinMcpDisabledTools(body.disabled));
});
