import { z } from 'zod';
import { searchFileContents, type ContentSearchOptions } from '../../../tools/content-search.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const GREP_TOOL = 'grep';

export const GREP_TOOLS: BuiltinToolDef[] = [
  {
    name: GREP_TOOL,
    description:
      'Search file contents with regex. Returns relative paths and line numbers, bounded across all files. Excludes secrets, generated directories and symlinks.',
    inputSchema: {
      pattern: z.string().describe('Regular expression pattern to search for'),
      path: z.string().optional().describe('Directory or file path to search (default: workspace root)'),
      include: z.string().optional().describe('File glob pattern to include (e.g., *.ts, *.{ts,tsx})'),
      exclude: z.string().optional().describe('File glob pattern to exclude (e.g., node_modules, dist)'),
      caseSensitive: z.boolean().optional().describe('Case-sensitive search (default: false)'),
      maxResults: z.number().int().min(1).max(500).optional().describe('Total matching lines (default: 100)'),
      contextLines: z.number().int().min(0).max(10).optional().describe('Number of context lines before and after each match (default: 0)'),
      maxDepth: z.number().int().min(0).max(12).optional().describe('Maximum directory depth to traverse'),
    },
    hostMessage: 'Grep execution is handled by the host.',
    execute: executeGrep,
  },
];

async function executeGrep(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  try {
    const result = await searchFileContents(args as unknown as ContentSearchOptions, context.abortSignal);
    return { content: JSON.stringify(result), isError: false };
  } catch (error) {
    return { content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), isError: true };
  }
}
