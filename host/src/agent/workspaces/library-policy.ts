import type { AgentPolicy } from 'poyraz';
import type { PolicyDef } from "@@core/definitions/policy.ts";

import { POLICY_BY_ID } from '@@catalog/policies.ts';
import { filterToolsForPolicy } from '@@tools/policy-context.ts';
import { BUILTIN_TOOL_PREFIX, HOST_MCP_TOOL_PREFIX, isBuiltinHostTool } from '@@tools/builtin/identity.ts';
/** Fallback round budget when a policy id has no definition. */
const MAX_TOOL_ROUNDS = 40;
/**
 * The policy that carries a session's policy id. `allowedTools` is the library's own
 * permission mechanism: the agent exposes only these tools to the model and
 * refuses the rest in the decision loop. The allow/deny source is the workspace
 * policy definition (`agent/catalog/policies.ts`); the filter runs through
 * the single `explain()` in `agent/tools/policy-context.ts`.
 *
 * The system prompt is policy-free on purpose: it is built once and shared, so a
 * policy switch only ever changes this policy and the round budget, never the text
 * the provider is asked to cache. Third-party MCP servers are listed as `mcp_<server>__*`
 * patterns, the row's deny list goes in as `deniedTools`, and its round budget as `maxToolRounds`. The host bridge still refuses the blocked
 * tools before dispatch as a second line of defence, because a stale agent
 * rebuilt from the same key would otherwise keep the previous tool set.
 */
export function policyForId(policyId: string, allowedTools: string[]): AgentPolicy {
  const policy: PolicyDef | undefined = POLICY_BY_ID[policyId];
  if (!policy) {
    return { id: policyId, allowedTools, hardBlockDeniedTools: true, errorBreaker: 'off' };
  }
  const visibleTools = filterToolsForPolicy(allowedTools, policyId);
  return {
    id: policyId,
    allowedTools: collapseServerTools(allowedTools, visibleTools),
    // The deny list of the row, so the library refuses these by name (and says so) even
    // when a stale tool list still carries them. `allowedTools` above is already filtered.
    ...(policy.deny?.length ? { deniedTools: policy.deny.map((name) => `${BUILTIN_TOOL_PREFIX}${name}`) } : {}),
    maxToolRounds: maxToolRoundsForPolicy(policyId),
    hardBlockDeniedTools: true,
    errorBreaker: 'off',
    ...(policy.deniedReason ? { deniedToolReason: policy.deniedReason } : {}),
  };
}

/**
 * Lists the visible tools, with every third-party MCP server whose tools all passed
 * the policy written as one `mcp_<server>__*` pattern instead of tool by tool. A
 * server that is only partly visible keeps its exact names, and the host's own
 * `mcp_xeck__*` tools are always exact because the policy row decides them one by one.
 */
function collapseServerTools(all: string[], visible: string[]): string[] {
  const serverOf = (name: string): string | null => {
    if (!name.startsWith(HOST_MCP_TOOL_PREFIX) || isBuiltinHostTool(name)) return null;
    const split = name.indexOf('__', HOST_MCP_TOOL_PREFIX.length);
    return split > 0 ? name.slice(0, split + 2) : null;
  };
  const total = new Map<string, number>();
  const passed = new Map<string, number>();
  for (const name of all) {
    const server = serverOf(name);
    if (server) total.set(server, (total.get(server) ?? 0) + 1);
  }
  for (const name of visible) {
    const server = serverOf(name);
    if (server) passed.set(server, (passed.get(server) ?? 0) + 1);
  }
  const written = new Set<string>();
  const out: string[] = [];
  for (const name of visible) {
    const server = serverOf(name);
    if (!server || passed.get(server) !== total.get(server)) {
      out.push(name);
    } else if (!written.has(server)) {
      written.add(server);
      out.push(`${server}*`);
    }
  }
  return out;
}

export function maxToolRoundsForPolicy(policyId: string): number {
  return POLICY_BY_ID[policyId]?.maxToolRounds ?? MAX_TOOL_ROUNDS;
}

