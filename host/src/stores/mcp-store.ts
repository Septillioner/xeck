import { createMcpClientManager, type McpServerDef, type ToolDefinition } from 'poyraz';
import type { BuiltinMcpStatus, McpServerRecord, McpServerStatus } from '../../../shared/types.ts';
import { builtinMcpTools, listBuiltinMcpTools } from '../agent/tools/builtin/connection.ts';
import { HOST_MCP_TOOL_PREFIX } from '../agent/tools/builtin/identity.ts';
import {
  onMcpConfigChanged,
  readMcpDocument,
  readMcpServers,
  saveBuiltinMcpEnabled,
  saveBuiltinMcpTools,
  saveMcpServers,
  toPublicMcpServers,
  type StoredMcpServer,
  type StoredSecret,
} from './mcp-config.ts';

const ARG_SEPARATOR = /\s+/;
const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer ';

export { readMcpServers };

/**
 * The host owns this manager instead of using the library's shared `mcpClientManager`.
 * Its prefix is given explicitly so bridged names (`mcp_<server>__<tool>`) do not
 * depend on a library default.
 */
const mcpClientManager = createMcpClientManager({ toolPrefix: HOST_MCP_TOOL_PREFIX });

type McpTools = Record<string, ToolDefinition>;

let connectedTools: McpTools = {};

/**
 * Makes the live connections match the stored list. The library compares definitions by
 * value and touches only what differs (new, changed or removed servers); identical
 * servers keep their connection and their tool objects, a failed one is not retried until
 * its definition changes. Calls run one after the other inside the manager.
 *
 * `sync` of the host-owned manager rather than `agent.syncMcp`: the latter would give every
 * session agent its own set of connections (one stdio process per server per session),
 * while the host connects once and merges the tools into the agents.
 */
async function connectExternal(servers: StoredMcpServer[]): Promise<void> {
  connectedTools = (await mcpClientManager.sync(toDefs(servers))).tools;
}

// The config file owns persistence and announces its own changes; this side owns the
// live connections. That direction is what keeps `builtin-mcp` free of this module.
onMcpConfigChanged(async () => {
  await connectExternal((await readMcpDocument()).servers);
});

export async function writeMcpServers(value: unknown): Promise<{ servers: McpServerRecord[]; states: McpServerStatus[] }> {
  await saveMcpServers(value);
  const snapshot = await refreshMcp();
  return { servers: snapshot.servers, states: snapshot.states };
}

export async function setBuiltinMcpEnabled(enabled: boolean): Promise<BuiltinMcpStatus> {
  await saveBuiltinMcpEnabled(enabled);
  const snapshot = await refreshMcp();
  return snapshot.builtin;
}

export async function setBuiltinMcpDisabledTools(disabled: string[]): Promise<BuiltinMcpStatus> {
  await saveBuiltinMcpTools(disabled);
  const snapshot = await refreshMcp();
  return snapshot.builtin;
}

export async function refreshMcp(): Promise<{
  servers: McpServerRecord[];
  states: McpServerStatus[];
  tools: McpTools;
  builtin: BuiltinMcpStatus;
}> {
  const stored = await readMcpDocument();
  await connectExternal(stored.servers);
  const used = new Set(Object.keys(connectedTools));
  const builtinTools = stored.builtinEnabled ? await builtinMcpTools(used) : {};
  for (const name of stored.builtinDisabledTools) delete builtinTools[`${HOST_MCP_TOOL_PREFIX}xeck__${name}`];
  const selectedTools = new Map(stored.servers.map((server) => [server.id, server.enabledTools === null ? null : new Set(server.enabledTools)]));
  const filteredExternalTools = Object.fromEntries(Object.entries(connectedTools).filter(([name]) => {
    const split = name.indexOf('__', HOST_MCP_TOOL_PREFIX.length);
    if (split < 0) return true;
    const serverId = name.slice(HOST_MCP_TOOL_PREFIX.length, split);
    const enabledTools = selectedTools.get(serverId);
    return !enabledTools || enabledTools.has(name.slice(split + 2));
  }));
  return {
    servers: toPublicMcpServers(stored.servers),
    states: mcpClientManager.listStates().map((state) => toStatus(state, selectedTools.get(state.id))),
    tools: { ...builtinTools, ...filteredExternalTools },
    builtin: await builtinStatus(stored.builtinEnabled, builtinTools, stored.builtinDisabledTools),
  };
}

async function builtinStatus(enabled: boolean, activeTools: McpTools, disabledTools: string[]): Promise<BuiltinMcpStatus> {
  if (!enabled) return { enabled: false, status: 'disabled', toolCount: 0, tools: [] };
  const disabled = new Set(disabledTools);
  const tools = (await listBuiltinMcpTools()).map((tool) => ({ ...tool, group: builtinToolGroup(tool.name), enabled: !disabled.has(tool.name) && Boolean(activeTools[`${HOST_MCP_TOOL_PREFIX}xeck__${tool.name}`]) }));
  return { enabled: true, status: 'connected', toolCount: tools.filter((tool) => tool.enabled).length, tools };
}

function builtinToolGroup(name: string): string {
  if (/^(read_file|replace_lines|write_file|delete_file|create_directory|list_directory|move_file|search_files|get_file_info)$/.test(name)) return 'Files';
  if (name === 'grep' || /^(search|find)_/.test(name)) return 'Search';
  if (/^(memory_|rule_|skill_|list_rules|add_rule|remove_rule|list_skills|write_skill|remove_skill)/.test(name) || name === 'load_skill') return 'Knowledge';
  if (/^(plan_|todo_)/.test(name)) return 'Planning';
  if (/^(ask_question|send_chat_message|list_message_targets|delegate_agents|list_subagents|cancel_subagent)/.test(name)) return 'Agents and communication';
  if (/^(run_command|terminal|shell)/.test(name)) return 'Terminal';
  if (/^(list_mcps|enable_mcp|disable_mcp)/.test(name)) return 'MCP management';
  return 'Other';
}

function toDefs(servers: StoredMcpServer[]): Record<string, McpServerDef> {
  const defs: Record<string, McpServerDef> = {};
  for (const server of servers) {
    if (server.transport === 'http') {
      if (!server.url) continue;
      defs[server.id] = { url: server.url, headers: httpHeaders(server), ignoreCertificate: server.ignoreCertificate, disabled: !server.enabled };
      continue;
    }
    if (!server.command) continue;
    const args = server.args.trim() ? server.args.trim().split(ARG_SEPARATOR) : undefined;
    const env = secretRecord(server.env);
    defs[server.id] = { command: server.command, args, env, disabled: !server.enabled };
  }
  return defs;
}

function httpHeaders(server: StoredMcpServer): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const row of server.headers) {
    if (server.token && isAuthorization(row.name)) continue;
    headers[row.name] = row.value;
  }
  if (server.token) headers[AUTHORIZATION_HEADER] = `${BEARER_PREFIX}${server.token}`;
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function isAuthorization(name: string): boolean {
  return name.toLowerCase() === AUTHORIZATION_HEADER.toLowerCase();
}

function secretRecord(rows: StoredSecret[]): Record<string, string> | undefined {
  const record: Record<string, string> = {};
  for (const row of rows) record[row.name] = row.value;
  return Object.keys(record).length > 0 ? record : undefined;
}

function toStatus(state: { id: string; status: McpServerStatus['status']; toolCount: number; tools?: McpServerStatus['tools']; error?: string }, enabledTools: Set<string> | null | undefined): McpServerStatus {
  const tools = (state.tools ?? []).map((tool) => ({ ...tool, enabled: !enabledTools || enabledTools.has(tool.name) }));
  return {
    id: state.id,
    status: state.status,
    toolCount: tools.filter((tool) => tool.enabled).length,
    tools,
    error: state.error,
  };
}