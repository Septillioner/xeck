/** The built-in server id the agent library namespaces these tools under. */
export const BUILTIN_MCP_ID = 'xeck';

/**
 * Name prefix of every MCP-bridged tool. The host gives it explicitly to the MCP
 * manager, to `AgentBuilder.Mcp({ toolPrefix })` and to the built-in bridge, so the
 * library files exactly these schemas under the `mcp` context category.
 * `shared/activity.ts` still carries its own copy for the web labels.
 */
export const HOST_MCP_TOOL_PREFIX = 'mcp_';

/** The prefix every tool of the host's own MCP server carries. */
export const BUILTIN_TOOL_PREFIX = `${HOST_MCP_TOOL_PREFIX}${BUILTIN_MCP_ID}__`;

/** `mcp_xeck__write_file` is `write_file` on the built-in server. */
export function serverSideName(toolName: string): string {
  const rest = toolName.startsWith(HOST_MCP_TOOL_PREFIX) ? toolName.slice(HOST_MCP_TOOL_PREFIX.length) : toolName;
  const split = rest.indexOf('__');
  return split > 0 ? rest.slice(split + 2) : rest;
}

/**
 * True when the tool comes from the host's built-in MCP server, i.e. the ones the
 * host itself defines and can therefore classify. Anything else (the library's
 * own `load_skill`, a third-party MCP server) is not ours to restrict.
 */
export function isBuiltinHostTool(toolName: string): boolean {
  return toolName.startsWith(BUILTIN_TOOL_PREFIX);
}
