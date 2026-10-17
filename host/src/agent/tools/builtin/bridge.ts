import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { mcpToolName, type ToolDefinition } from 'poyraz';
import { z } from 'zod';
import { policyRejection } from '../policy-context.ts';
import { BUILTIN_MCP_ID, HOST_MCP_TOOL_PREFIX } from './identity.ts';
import { builtinToolDef } from './registry.ts';
import { formatBlocks, parametersSchema } from './results.ts';
import type { ListedTool, ToolCallContext, ToolResult } from './types.ts';

// The library typechecks against its own zod copy. This instance still keeps unknown arguments for the MCP server.
const looseInputSchema = z.object({}).passthrough() as unknown as ToolDefinition['inputSchema'];

/**
 * Presents a built-in MCP tool to the agent. Server-side calls are forwarded to
 * the in-memory server; host-owned tools (defined with `execute` in their domain
 * file) run here because they need the session context, not the tool surface.
 */
export function bridgeBuiltinTool(client: Client, tool: ListedTool, used: Set<string>): ToolDefinition {
  const name = mcpToolName(BUILTIN_MCP_ID, tool.name, used, HOST_MCP_TOOL_PREFIX);
  return {
    name,
    description: tool.description || `MCP tool "${tool.name}" from server "${BUILTIN_MCP_ID}".`,
    inputSchema: looseInputSchema,
    parametersJsonSchema: parametersSchema(tool.inputSchema),
    execute: (args: Record<string, unknown>, context: ToolCallContext) => executeBuiltinTool(client, tool.name, name, args, context),
    presentation: {
      label: `MCP: ${tool.name}`,
      category: 'network',
    },
    meta: {
      category: 'network',
    },
  };
}

async function executeBuiltinTool(
  client: Client,
  toolName: string,
  exposedName: string,
  args: Record<string, unknown>,
  context: ToolCallContext,
): Promise<ToolResult> {
  // The policy is checked before anything else, including the tools this bridge
  // runs itself, so a blocked call never reaches disk or a terminal.
  const blocked = await policyRejection(exposedName, context.sessionId);
  if (blocked) return { content: blocked, isError: true };

  const def = builtinToolDef(toolName);
  if (def && 'execute' in def) return def.execute(args, context);

  try {
    const result = await client.callTool(
      { name: toolName, arguments: args },
      undefined,
      context.abortSignal ? { signal: context.abortSignal } : undefined,
    );
    if (!('content' in result)) {
      return { content: JSON.stringify(result.toolResult ?? '') };
    }
    return {
      content: formatBlocks(result.content),
      isError: Boolean(result.isError),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: `MCP tool call failed: ${message}`, isError: true };
  }
}
