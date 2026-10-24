import { z } from 'zod';
import { requestUserApproval } from '../../runtime/events/dialogs.ts';
import { InstructionRejected } from '../../../stores/instruction-store.ts';
import { readMcpServers, saveMcpServers } from '../../../stores/mcp-config.ts';
import { runTool, serverToolResult } from './results.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const LIST_MCPS_TOOL = 'list_mcps';
export const ENABLE_MCP_TOOL = 'enable_mcp';
export const DISABLE_MCP_TOOL = 'disable_mcp';

const APPLIES_ON_NEXT_MESSAGE = 'Applies on the next message.';

export const MCP_TOOLS: BuiltinToolDef[] = [
  {
    name: LIST_MCPS_TOOL,
    description: 'List configured MCP servers. You can see their ids and whether they are enabled.',
    handler: async () => serverToolResult({ mcps: await readMcpServers() }),
  },
  {
    name: ENABLE_MCP_TOOL,
    description: 'Enable a disabled MCP server by id. The user approves it in the chat. It applies on the next message.',
    inputSchema: { id: z.string().describe('MCP server id') },
    hostMessage: 'Enable is confirmed in the chat before it is saved.',
    execute: executeEnableMcp,
  },
  {
    name: DISABLE_MCP_TOOL,
    description: 'Disable a specific MCP server by id. It applies on the next message.',
    inputSchema: { id: z.string().describe('MCP server id') },
    handler: async ({ id }) =>
      runTool(async () => {
        const servers = await readMcpServers();
        const server = servers.find((s) => s.id === id);
        if (!server) throw new InstructionRejected(`MCP server ${id} not found.`);
        server.enabled = false;
        await saveMcpServers(servers);
        return { id, enabled: false, message: APPLIES_ON_NEXT_MESSAGE };
      }),
  },
];

async function executeEnableMcp(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  const id = typeof args?.id === 'string' ? args.id.trim() : '';
  if (!id) return { content: JSON.stringify({ error: 'Server id is required.' }), isError: true };
  const servers = await readMcpServers();
  const server = servers.find((item) => item.id === id);
  if (!server) {
    return { content: JSON.stringify({ error: `MCP server "${id}" not found.` }), isError: true };
  }
  if (server.enabled) {
    return { content: JSON.stringify({ id, enabled: true, message: `MCP server "${id}" is already enabled.` }), isError: false };
  }
  if (!context?.sessionId) {
    return { content: JSON.stringify({ error: 'No active session to confirm enabling this server.' }), isError: true };
  }
  const approved = await requestUserApproval({
    sessionId: context.sessionId,
    signal: context.abortSignal,
    title: 'Enable MCP Server',
    prompt: `Do you want to enable the MCP server "${id}"?`,
    details: { id },
    toolName: ENABLE_MCP_TOOL,
  });
  if (!approved) {
    return {
      content: JSON.stringify({ id, enabled: false, rejected: true, message: `User denied permission to enable MCP server "${id}".` }),
      isError: true,
    };
  }
  server.enabled = true;
  await saveMcpServers(servers);
  return { content: JSON.stringify({ id, enabled: true, approved: true, message: APPLIES_ON_NEXT_MESSAGE }), isError: false };
}
