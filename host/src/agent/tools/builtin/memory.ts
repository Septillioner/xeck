import { z } from 'zod';
import { MEMORY_TYPES } from '../../../../../shared/types.ts';
import { deleteMemory, getMemory, listMemories, searchMemories, upsertMemory, type MemoryScope } from '../../../stores/memory-store.ts';
import { formatBlocks, runTool } from './results.ts';
import type { ZodRawShape } from 'zod';
import type { BuiltinToolDef, ToolCallContext } from './types.ts';

export const MEMORY_SEARCH_TOOL = 'memory_search';
export const MEMORY_GET_TOOL = 'memory_get';
export const MEMORY_UPSERT_TOOL = 'memory_upsert';
export const MEMORY_DELETE_TOOL = 'memory_delete';
export const MEMORY_LIST_TOOL = 'memory_list';

async function scopeFor(context: ToolCallContext): Promise<MemoryScope> {
  if (!context.sessionId) return { kind: 'user' };
  // Load session storage only when a tool executes. A static import creates an
  // ESM cycle: sessions -> policies -> memory tools -> sessions.
  const { readSession } = await import('../../../stores/sessions.ts');
  const session = await readSession(context.sessionId);
  if (session?.bot) {
    // A personal XeckBot's session ID is its stable identity. In a bot-to-bot
    // conversation the responderId selects that bot's private memory.
    return { kind: 'bot', id: session.botConversation?.responderId ?? session.id };
  }
  if (session?.projectId) return { kind: 'project', id: session.projectId };
  return { kind: 'user' };
}

function contextualTool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  handler: (args: Record<string, any>, scope: MemoryScope) => Promise<unknown>,
): BuiltinToolDef {
  return {
    name,
    description,
    inputSchema,
    hostMessage: 'This tool executes in the host with the current conversation memory scope.',
    execute: async (args, context) => {
      const result = await runTool(async () => handler(args, await scopeFor(context)));
      return { content: formatBlocks(result.content), isError: result.isError };
    },
  };
}

export const MEMORY_TOOLS: BuiltinToolDef[] = [
  contextualTool(MEMORY_SEARCH_TOOL,
    'Search this conversation’s memory by ID, title, tags, and content. Results rank stronger title/tag matches first and include a short relevant excerpt. Use a few distinctive words; use memory_get for the full record.',
    {
      query: z.string().describe('Distinctive name, phrase, alias, or keywords to find'),
      type: z.enum(MEMORY_TYPES).optional().describe('Optionally restrict to memory, rule, decision, or context'),
      limit: z.number().int().min(1).optional().describe('Maximum results'),
    },
    ({ query, type, limit }, scope) => searchMemories(query, limit, scope, type)),
  contextualTool(MEMORY_LIST_TOOL,
    'List memories available to this conversation. Returns metadata without content.',
    { type: z.string().optional().describe('memory, rule, decision, or context'), tag: z.string().optional().describe('Exact tag to match'), limit: z.number().int().min(1).optional().describe('Maximum results') },
    ({ type, tag, limit }, scope) => listMemories({ type, tag, limit }, scope)),
  contextualTool(MEMORY_GET_TOOL,
    'Get one memory by id from this conversation’s memory scope, including its full content.',
    { id: z.string().describe('Memory id') },
    ({ id }, scope) => getMemory(id, scope)),
  contextualTool(MEMORY_UPSERT_TOOL,
    'Create or replace a memory belonging only to this conversation’s scope. Returns id and status.',
    { id: z.string().optional().describe('Existing memory id; omit to create one'), title: z.string().describe('Short title'), content: z.string().describe('Short detail or a pointer to larger data'), type: z.string().optional().describe('memory, rule, decision, or context'), tags: z.array(z.string()).optional().describe('Short tags') },
    ({ id, title, content, type, tags }, scope) => upsertMemory({ id, title, content, type, tags, source: 'xeck' }, scope)),
  contextualTool(MEMORY_DELETE_TOOL,
    'Delete a memory by id from this conversation’s memory scope.',
    { id: z.string().describe('Memory id') },
    ({ id }, scope) => deleteMemory(id, scope)),
];
