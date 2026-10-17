import type {
  BuiltinMcpStatus,
  McpServerRecord,
  McpServerStatus,
  McpServerWrite,
  McpTransport,
} from '../../../../shared/types.ts';
import { MCP_FOLDER_PLACEHOLDER, type McpMarketplaceEntry } from './mcpMarketplace.ts';

export const TRANSPORT_LABELS: Record<McpTransport, string> = {
  stdio: 'Command',
  http: 'URL',
};
export const CONNECTING_LABEL = 'Connecting';
export const BUILTIN_MCP_TITLE = 'Xeck';
export const OFF_LABEL = 'Off';
export const DEFAULT_BUILTIN_STATUS: BuiltinMcpStatus = {
  enabled: true,
  status: 'connected',
  toolCount: 0,
  tools: [],
};

export interface SecretDraft {
  name: string;
  value: string;
  savedName: string | null;
}

export interface ServerDraft {
  id: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  token: string;
  clearToken: boolean;
  enabled: boolean;
  ignoreCertificate: boolean;
  tokenConfigured: boolean;
  headers: SecretDraft[];
  env: SecretDraft[];
}

export function emptyDraft(): ServerDraft {
  return {
    id: '',
    transport: 'stdio',
    command: '',
    args: '',
    url: '',
    token: '',
    clearToken: false,
    enabled: true,
    ignoreCertificate: false,
    tokenConfigured: false,
    headers: [],
    env: [],
  };
}

export function templateDraft(entry: McpMarketplaceEntry, installedIds: string[]): ServerDraft {
  const taken = new Set(installedIds.map((id) => id.trim().toLowerCase()));
  let id = entry.id;
  for (let index = 2; taken.has(id.toLowerCase()); index += 1) id = `${entry.id}-${index}`;
  return {
    ...emptyDraft(),
    id,
    transport: 'stdio',
    command: entry.command,
    args: entry.args,
  };
}

export function draftFromRecord(server: McpServerRecord): ServerDraft {
  return {
    id: server.id,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    token: '',
    clearToken: false,
    enabled: server.enabled,
    ignoreCertificate: server.ignoreCertificate,
    tokenConfigured: server.tokenConfigured,
    headers: headerNames(server).map((name) => savedSecret({ name })),
    env: server.env.map(savedSecret),
  };
}

export function savedSecret(item: { name: string }): SecretDraft {
  return { name: item.name, value: '', savedName: item.name };
}

export function draftServer(draft: ServerDraft, editingId: string | null = null): McpServerWrite | null {
  const id = draft.id.trim();
  const command = draft.command.trim();
  const url = draft.url.trim();
  const args = draft.args.trim();
  if (!id) return null;
  if (draft.transport === 'http' ? !url : !command) return null;
  if (args.includes(MCP_FOLDER_PLACEHOLDER)) return null;
  const write: McpServerWrite = {
    id,
    transport: draft.transport,
    command,
    args,
    url,
    enabled: draft.enabled,
  };
  if (editingId && editingId !== id) write.replacesId = editingId;
  if (draft.transport === 'http') {
    write.ignoreCertificate = draft.ignoreCertificate;
    if (draft.clearToken) write.clearToken = true;
    else if (draft.token.trim()) write.token = draft.token.trim();
    write.headers = draft.headers.flatMap((row) => secretWrite(row));
  }
  if (draft.transport === 'stdio') {
    write.env = draft.env.flatMap((row) => secretWrite(row));
  }
  return write;
}

export function secretWrite(row: SecretDraft): { name: string; value?: string }[] {
  const name = row.name.trim();
  if (!name) return [];
  if (row.value) return [{ name, value: row.value }];
  if (row.savedName && name === row.savedName) return [{ name }];
  return [];
}

export function tokenPlaceholder(draft: ServerDraft): string {
  if (draft.clearToken) return 'Will be removed';
  if (draft.tokenConfigured) return 'Leave blank to keep';
  return 'Optional';
}

export function asWrite(server: McpServerRecord, enabled = server.enabled): McpServerWrite {
  return {
    id: server.id,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    enabled,
    enabledTools: server.enabledTools,
    ignoreCertificate: server.ignoreCertificate,
  };
}

export function replaceRow(rows: SecretDraft[], index: number, next: SecretDraft): SecretDraft[] {
  return rows.map((row, rowIndex) => (rowIndex === index ? next : row));
}

export function receivedServers(servers: McpServerRecord[]): McpServerRecord[] {
  return servers.map((server) => ({ ...server, headers: server.headers ?? [], env: server.env ?? [] }));
}

export function headerNames(server: McpServerRecord): string[] {
  return (server.headers ?? []).map((item) => item.name);
}

export function tokenDetail(server: McpServerRecord): string {
  return server.tokenLast4 ? `Bearer ···· ${server.tokenLast4}` : 'Bearer';
}

export function builtinStatusText(builtin: BuiltinMcpStatus): string {
  if (!builtin.enabled || builtin.status === 'disabled') return OFF_LABEL;
  return `${builtin.toolCount} tools`;
}

export function statusText(server: McpServerRecord, state: McpServerStatus | undefined): string {
  if (!server.enabled || state?.status === 'disabled') return OFF_LABEL;
  if (state?.status === 'connected') return `${state.toolCount} tools`;
  if (state?.status === 'error') return state.error || 'Error';
  return 'Not connected';
}
