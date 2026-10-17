import { z } from 'zod';
import { deleteMemory, getMemory, listMemories, searchMemories, upsertMemory } from '../../../stores/memory-store.ts';
import { runTool } from './results.ts';
import type { BuiltinToolDef } from './types.ts';

export const MEMORY_SEARCH_TOOL = 'memory_search';
export const MEMORY_GET_TOOL = 'memory_get';
export const MEMORY_UPSERT_TOOL = 'memory_upsert';
export const MEMORY_DELETE_TOOL = 'memory_delete';
export const MEMORY_LIST_TOOL = 'memory_list';

export const MEMORY_TOOLS: BuiltinToolDef[] = [
  {
    name: MEMORY_SEARCH_TOOL,
    description:
      'Search memory keys only: id, title, and tags. Returns id, title, and a short snippet. If nothing matches, call memory_list and scan the titles. Use memory_get for the full record.',
    inputSchema: {
      query: z.string().describe('Key text to match in the id, title, or tags'),
      limit: z.number().int().min(1).optional().describe('Maximum results'),
    },
    handler: async ({ query, limit }) => runTool(() => searchMemories(query, limit)),
  },
  {
    name: MEMORY_LIST_TOOL,
    description: 'List memories. Returns id, title, type, tags, and timestamps. Does not return content.',
    inputSchema: {
      type: z.string().optional().describe('memory, rule, decision, or context'),
      tag: z.string().optional().describe('Exact tag to match'),
      limit: z.number().int().min(1).optional().describe('Maximum results'),
    },
    handler: async ({ type, tag, limit }) => runTool(() => listMemories({ type, tag, limit })),
  },
  {
    name: MEMORY_GET_TOOL,
    description: 'Get one memory by id, including its full content.',
    inputSchema: { id: z.string().describe('Memory id') },
    handler: async ({ id }) => runTool(() => getMemory(id)),
  },
  {
    name: MEMORY_UPSERT_TOOL,
    description:
      'Create or replace a memory. Returns only id and status. The record is available to the next memory tool call and is not added to the prompt.',
    inputSchema: {
      id: z.string().optional().describe('Existing memory id; omit to create one'),
      title: z.string().describe('Short title'),
      content: z.string().describe('Short detail or a pointer to larger data'),
      type: z.string().optional().describe('memory, rule, decision, or context'),
      tags: z.array(z.string()).optional().describe('Short tags'),
    },
    handler: async ({ id, title, content, type, tags }) =>
      runTool(() => upsertMemory({ id, title, content, type, tags, source: 'xeck' })),
  },
  {
    name: MEMORY_DELETE_TOOL,
    description: 'Delete a memory by id. Returns only id and status.',
    inputSchema: { id: z.string().describe('Memory id') },
    handler: async ({ id }) => runTool(() => deleteMemory(id)),
  },
];
