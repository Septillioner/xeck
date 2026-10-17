import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from 'poyraz';
import { bridgeBuiltinTool } from './bridge.ts';
import type { ListedTool } from './types.ts';
import { registerTools } from './server.ts';

const SERVER_NAME = 'xeck';
const SERVER_VERSION = '1.0.0';
const CLIENT_NAME = 'xeck-host';
const CLIENT_VERSION = '1.0.0';

interface BuiltinConnection {
  client: Client;
  tools: ListedTool[];
}

let connectionPromise: Promise<BuiltinConnection> | null = null;

/**
 * The built-in tools are exposed to the agent as one MCP server that lives in this
 * process over an in-memory transport, so the model sees one uniform tool surface and
 * `used` names can still be namespaced away from real MCP servers.
 */
export async function builtinMcpTools(used: Set<string>): Promise<Record<string, ToolDefinition>> {
  const connection = await ensureConnection();
  const tools: Record<string, ToolDefinition> = {};
  for (const tool of connection.tools) {
    const bridged = bridgeBuiltinTool(connection.client, tool, used);
    tools[bridged.name] = bridged;
  }
  return tools;
}

export async function listBuiltinMcpTools(): Promise<{ name: string; description: string }[]> {
  const connection = await ensureConnection();
  return connection.tools.map((tool) => ({ name: tool.name, description: tool.description }));
}

function ensureConnection(): Promise<BuiltinConnection> {
  if (!connectionPromise) {
    connectionPromise = connectBuiltin().catch((error: unknown) => {
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

async function connectBuiltin(): Promise<BuiltinConnection> {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const listed = await client.listTools();
  return {
    client,
    tools: listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description?.trim() ?? '',
      inputSchema: tool.inputSchema,
    })),
  };
}