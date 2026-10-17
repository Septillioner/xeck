import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BUILTIN_TOOLS } from './registry.ts';
import { serverToolResult } from './results.ts';

/**
 * Declares the tools the built-in MCP server exposes. Server-side tools run their
 * handler here; host-owned tools (asking the user, deleting a file, running a
 * command, enabling an MCP server, the plan tools) answer with their fixed error
 * and are really executed by `bridge.ts`, which carries the session context.
 */
export function registerTools(server: McpServer): void {
  for (const def of BUILTIN_TOOLS) {
    const config = {
      description: def.description,
      ...(def.inputSchema ? { inputSchema: def.inputSchema } : {}),
    };
    if ('execute' in def) {
      const message = def.hostMessage;
      server.registerTool(def.name, config, async () => serverToolResult({ error: message }, true));
      continue;
    }
    const handler = def.handler;
    server.registerTool(def.name, config, async (args) => handler(args));
  }
}