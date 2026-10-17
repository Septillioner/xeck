import { z } from 'zod';
import { requestUserApproval } from '../../runtime/events/dialogs.ts';
import {
  createDirectoryTool,
  deleteFileTool,
  FileToolRejected,
  getFileInfoTool,
  listDirectoryTool,
  moveFileTool,
  readFileTool,
  replaceFileLines,
  searchFilesTool,
  writeFileTool,
} from '../../../tools/file-access.ts';
import { runTool } from './results.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const READ_FILE_TOOL = 'read_file';
export const REPLACE_LINES_TOOL = 'replace_lines';
export const WRITE_FILE_TOOL = 'write_file';
export const DELETE_FILE_TOOL = 'delete_file';
export const CREATE_DIRECTORY_TOOL = 'create_directory';
export const LIST_DIRECTORY_TOOL = 'list_directory';
export const MOVE_FILE_TOOL = 'move_file';
export const SEARCH_FILES_TOOL = 'search_files';
export const GET_FILE_INFO_TOOL = 'get_file_info';

export const FILE_TOOLS: BuiltinToolDef[] = [
  {
    name: READ_FILE_TOOL,
    description: 'Read UTF-8 text by 1-based inclusive lines (default: 200 lines). Returns the complete-file hash for guarded edits.',
    inputSchema: {
      path: z.string().describe('File path'),
      startLine: z.number().int().min(1).optional().describe('First 1-based line, inclusive'),
      endLine: z.number().int().min(1).optional().describe('Last 1-based line, inclusive'),
    },
    handler: async ({ path, startLine, endLine }) =>
      runTool(() => readFileTool({ path, startLine, endLine })),
  },
  {
    name: REPLACE_LINES_TOOL,
    description: 'Replace 1-based inclusive file lines. expectedHash is the SHA-256 hash of the complete UTF-8 file before editing.',
    inputSchema: {
      path: z.string().describe('File path'),
      startLine: z.number().int().min(1).describe('First 1-based line, inclusive'),
      endLine: z.number().int().min(1).describe('Last 1-based line, inclusive'),
      content: z.string().describe('Replacement text'),
      expectedHash: z.string().optional().describe('Expected SHA-256 hash of the complete UTF-8 file'),
    },
    handler: async ({ path, startLine, endLine, content, expectedHash }) =>
      runTool(() => replaceFileLines(path, startLine, endLine, content, expectedHash)),
  },
  {
    name: WRITE_FILE_TOOL,
    description: 'Create or fully replace a UTF-8 file. Returns a bounded diff and hash.',
    inputSchema: {
      path: z.string().describe('File path'),
      content: z.string().describe('Complete UTF-8 file content'),
    },
    handler: async ({ path, content }) => runTool(() => writeFileTool(path, content)),
  },
  {
    name: DELETE_FILE_TOOL,
    description: 'Delete a file or empty directory after user approval. Set recursive only when the user explicitly requests recursive deletion.',
    inputSchema: {
      path: z.string().describe('File or directory path'),
      recursive: z.boolean().optional().describe('Recursively delete a directory'),
    },
    hostMessage: 'Deletion requires approval in the chat.',
    execute: executeDeleteWithApproval,
  },
  {
    name: CREATE_DIRECTORY_TOOL,
    description: 'Create a directory. Missing parents are created by default.',
    inputSchema: {
      path: z.string().describe('Directory path'),
      recursive: z.boolean().optional().describe('Create missing parent directories'),
    },
    handler: async ({ path, recursive }) => runTool(() => createDirectoryTool(path, recursive)),
  },


  {
    name: LIST_DIRECTORY_TOOL,
    description: 'List directory entries as relative paths. depth defaults to 0 (direct children); increase for a tree.',
    inputSchema: {
      path: z.string().optional(),
      depth: z.number().int().min(0).max(12).optional(),
      includeSize: z.boolean().optional(),
      maxEntries: z.number().int().min(1).max(1000).optional(),
    },
    handler: async ({ path, depth, includeSize, maxEntries }) => runTool(() => listDirectoryTool(path, includeSize, depth, maxEntries)),
  },
  {
    name: MOVE_FILE_TOOL,
    description: 'Move or rename a regular file. Overwriting is disabled unless explicitly requested.',
    inputSchema: {
      source: z.string().describe('Source file path'),
      destination: z.string().describe('Destination file path'),
      overwrite: z.boolean().optional().describe('Replace an existing destination file'),
    },
    handler: async ({ source, destination, overwrite }) => runTool(() => moveFileTool(source, destination, overwrite)),
  },
  {
    name: SEARCH_FILES_TOOL,
    description: 'Search file and directory names recursively with bounded depth and result count.',
    inputSchema: {
      query: z.string().describe('Case-insensitive name substring or glob (e.g. **/*.ts, *.{ts,tsx})'),
      path: z.string().optional().describe('Directory to search'),
      recursive: z.boolean().optional(),
      maxResults: z.number().int().min(1).max(500).optional(),
      maxDepth: z.number().int().min(0).max(12).optional(),
    },
    handler: async ({ query, path, recursive, maxResults, maxDepth }) =>
      runTool(() => searchFilesTool({ query, path, recursive, maxResults, maxDepth })),
  },
  {
    name: GET_FILE_INFO_TOOL,
    description: 'Get filesystem metadata without reading file content.',
    inputSchema: { path: z.string().describe('File or directory path') },
    handler: async ({ path }) => runTool(() => getFileInfoTool(path)),
  },
];

async function executeDeleteWithApproval(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  const filePath = typeof args?.path === 'string' ? args.path.trim() : '';
  const recursive = args?.recursive === true;
  if (!filePath) return { content: JSON.stringify({ error: 'File path is required.' }), isError: true };
  if (!context.sessionId) return { content: JSON.stringify({ error: 'No active session to confirm deletion.' }), isError: true };
  const approved = await requestUserApproval({
    sessionId: context.sessionId,
    signal: context.abortSignal,
    title: 'Delete file',
    prompt: `Do you want to delete "${filePath}"${recursive ? ' recursively' : ''}?`,
    details: { path: filePath, recursive },
  });
  if (!approved) {
    return { content: JSON.stringify({ path: filePath, deleted: false, rejected: true }), isError: true };
  }
  try {
    return { content: JSON.stringify(await deleteFileTool(filePath, recursive)), isError: false };
  } catch (error) {
    if (error instanceof FileToolRejected) return { content: JSON.stringify({ error: error.message }), isError: true };
    throw error;
  }
}
