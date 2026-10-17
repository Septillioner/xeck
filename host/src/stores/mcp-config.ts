import {
  MCP_TRANSPORTS,
  type McpEnvPublic,
  type McpHeaderPublic,
  type McpServerRecord,
  type McpTransport,
} from '../../../shared/types.ts';
import { mcpPath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const SECRET_LAST4_LENGTH = 4;

/** Serializes read-modify-write on mcp.json so two writers cannot drop each other's rows. */
const exclusive = createMutex();

export interface StoredSecret {
  name: string;
  value: string;
}

export interface StoredMcpServer {
  id: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  enabled: boolean;
  enabledTools: string[] | null;
  ignoreCertificate: boolean;
  token: string;
  headers: StoredSecret[];
  env: StoredSecret[];
}

export interface StoredMcpDocument {
  servers: StoredMcpServer[];
  builtinEnabled: boolean;
  builtinDisabledTools: string[];
}

/**
 * Runs after every persisted change so live connections follow the file. `mcp-store`
 * registers the reconnect here, which keeps the dependency one-way: the built-in
 * tools and the store both depend on this file instead of on each other.
 */
let notifyChanged: (() => Promise<void>) | undefined;

export function onMcpConfigChanged(listener: () => Promise<void>): void {
  notifyChanged = listener;
}

export async function readMcpDocument(): Promise<StoredMcpDocument> {
  const value = await readJson<unknown>(mcpPath(), { servers: [] });
  return {
    servers: normalizeStored(value),
    builtinEnabled: readBuiltinEnabled(value),
    builtinDisabledTools: readBuiltinDisabledTools(value),
  };
}

/** Servers as the UI sees them: no secret values, only `configured` and `last4`. */
export async function readMcpServers(): Promise<McpServerRecord[]> {
  return (await exclusive(() => readMcpDocument())).servers.map(toPublic);
}

export function toPublicMcpServers(servers: StoredMcpServer[]): McpServerRecord[] {
  return servers.map(toPublic);
}

/** Merge the incoming rows into what is stored, keeping secrets the client cannot send back. */
export async function saveMcpServers(value: unknown): Promise<void> {
  await exclusive(async () => {
    const previous = await readMcpDocument();
    await writeDocument(mergeServers(value, previous.servers), previous.builtinEnabled, previous.builtinDisabledTools);
  });
  await notifyChanged?.();
}

export async function saveBuiltinMcpEnabled(enabled: boolean): Promise<void> {
  await exclusive(async () => {
    const previous = await readMcpDocument();
    await writeDocument(previous.servers, enabled, previous.builtinDisabledTools);
  });
  await notifyChanged?.();
}

export async function saveBuiltinMcpTools(disabled: string[]): Promise<void> {
  await exclusive(async () => {
    const previous = await readMcpDocument();
    await writeDocument(previous.servers, previous.builtinEnabled, disabled);
  });
}

async function writeDocument(servers: StoredMcpServer[], builtinEnabled: boolean, builtinDisabledTools: string[]): Promise<void> {
  await writeJson(mcpPath(), { servers, builtinEnabled, builtinDisabledTools });
}

function readBuiltinDisabledTools(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const disabled = (value as { builtinDisabledTools?: unknown }).builtinDisabledTools;
  return Array.isArray(disabled) ? disabled.filter((name): name is string => typeof name === 'string') : [];
}

function readBuiltinEnabled(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  return (value as { builtinEnabled?: unknown }).builtinEnabled !== false;
}

function mergeServers(value: unknown, previous: StoredMcpServer[]): StoredMcpServer[] {
  const prior = new Map(previous.map((server) => [server.id, server]));
  const byId = new Map<string, StoredMcpServer>();
  for (const row of serverRows(value)) {
    const stored = mergeServer(row, prior);
    if (stored) byId.set(stored.id, stored);
  }
  return [...byId.values()];
}

function mergeServer(row: Record<string, unknown>, prior: Map<string, StoredMcpServer>): StoredMcpServer | null {
  const fields = readFields(row);
  if (!fields) return null;
  const replacesId = typeof row.replacesId === 'string' ? row.replacesId.trim() : '';
  const previous = prior.get(replacesId || fields.id);
  const sameTransport = previous?.transport === fields.transport ? previous : undefined;
  return {
    ...fields,
    token: fields.transport === 'http' ? mergeToken(row, sameTransport) : '',
    headers: fields.transport === 'http' ? mergeHeaders(row, sameTransport) : [],
    env: fields.transport === 'stdio' ? mergeEnv(row, sameTransport) : [],
  };
}

function mergeToken(row: Record<string, unknown>, previous: StoredMcpServer | undefined): string {
  if (row.clearToken === true) return '';
  const incoming = typeof row.token === 'string' ? row.token.trim() : '';
  if (incoming) return incoming;
  return previous?.token ?? '';
}

function mergeHeaders(row: Record<string, unknown>, previous: StoredMcpServer | undefined): StoredSecret[] {
  return mergeNamedSecrets(row.headers, previous?.headers, HEADER_NAME_PATTERN, headerKey);
}

function mergeEnv(row: Record<string, unknown>, previous: StoredMcpServer | undefined): StoredSecret[] {
  return mergeNamedSecrets(row.env, previous?.env, ENV_NAME_PATTERN, (name) => name);
}

function mergeNamedSecrets(
  items: unknown,
  previous: StoredSecret[] | undefined,
  pattern: RegExp,
  keyOf: (name: string) => string,
): StoredSecret[] {
  if (!Array.isArray(items)) return previous ?? [];
  const prior = new Map((previous ?? []).map((item) => [keyOf(item.name), item]));
  const next = new Map<string, StoredSecret>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const write = item as { name?: unknown; value?: unknown; clear?: unknown };
    const name = typeof write.name === 'string' ? write.name.trim() : '';
    if (!pattern.test(name)) continue;
    const key = keyOf(name);
    if (write.clear === true) {
      next.delete(key);
      prior.delete(key);
      continue;
    }
    const value = typeof write.value === 'string' ? write.value : '';
    if (value) next.set(key, { name, value });
    else {
      const saved = prior.get(key);
      if (saved) next.set(key, { name, value: saved.value });
    }
  }
  return [...next.values()];
}

function headerKey(name: string): string {
  return name.toLowerCase();
}

function normalizeStored(value: unknown): StoredMcpServer[] {
  const byId = new Map<string, StoredMcpServer>();
  for (const row of serverRows(value)) {
    const fields = readFields(row);
    if (!fields) continue;
    byId.set(fields.id, {
      ...fields,
      enabledTools: fields.enabledTools,
      token: fields.transport === 'http' && typeof row.token === 'string' ? row.token.trim() : '',
      headers: fields.transport === 'http' ? readNamedSecrets(row.headers, HEADER_NAME_PATTERN, headerKey) : [],
      env: fields.transport === 'stdio' ? readNamedSecrets(row.env, ENV_NAME_PATTERN, (name) => name) : [],
    });
  }
  return [...byId.values()];
}

function readNamedSecrets(value: unknown, pattern: RegExp, keyOf: (name: string) => string): StoredSecret[] {
  if (!Array.isArray(value)) return [];
  const secrets = new Map<string, StoredSecret>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { name?: unknown; value?: unknown };
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const secret = typeof row.value === 'string' ? row.value : '';
    if (!pattern.test(name) || !secret) continue;
    secrets.set(keyOf(name), { name, value: secret });
  }
  return [...secrets.values()];
}

function readFields(row: Record<string, unknown>): Omit<StoredMcpServer, 'token' | 'headers' | 'env'> | null {
  const id = readId(row);
  const transport = MCP_TRANSPORTS.includes(row.transport as McpTransport) ? (row.transport as McpTransport) : 'stdio';
  const command = typeof row.command === 'string' ? row.command.trim() : '';
  const args = typeof row.args === 'string' ? row.args.trim() : '';
  const url = typeof row.url === 'string' ? row.url.trim() : '';
  if (!id) return null;
  if (transport === 'http' && !url) return null;
  if (transport === 'stdio' && !command) return null;
  return {
    id,
    transport,
    command,
    args,
    url,
    enabled: row.enabled !== false,
    enabledTools: Array.isArray(row.enabledTools) ? row.enabledTools.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())) : null,
    ignoreCertificate: transport === 'http' && row.ignoreCertificate === true,
  };
}

function readId(row: Record<string, unknown>): string {
  return typeof row.id === 'string' ? row.id.trim() : '';
}

function serverRows(value: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { servers?: unknown }).servers)
      ? (value as { servers: unknown[] }).servers
      : [];
  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
}

function toPublic(server: StoredMcpServer): McpServerRecord {
  const token = server.token.trim();
  return {
    id: server.id,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    enabled: server.enabled,
    enabledTools: server.enabledTools,
    ignoreCertificate: server.ignoreCertificate,
    tokenConfigured: token.length > 0,
    tokenLast4: last4(token),
    headers: server.headers.map(toPublicSecret),
    env: server.env.map(toPublicSecret),
  };
}

function toPublicSecret(row: StoredSecret): McpEnvPublic | McpHeaderPublic {
  return { name: row.name, last4: last4(row.value) };
}

function last4(value: string): string | null {
  const secret = value.trim();
  if (secret.length < SECRET_LAST4_LENGTH) return null;
  return secret.slice(-SECRET_LAST4_LENGTH);
}
