import { z } from 'zod';
import { FileToolRejected } from '../../../tools/file-access.ts';
import { runCommandTool } from '../../../tools/terminal-run.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const RUN_COMMAND_TOOL = 'run_command';

export const TERMINAL_TOOLS: BuiltinToolDef[] = [
  {
    name: RUN_COMMAND_TOOL,
    description: 'Run a bounded terminal command. Requires full file access; use an explicit working directory and avoid long-running processes.',
    inputSchema: {
      command: z.string().describe('Command to run'),
      cwd: z.string().optional().describe('Working directory'),
      timeoutMs: z.number().int().min(1).optional().describe('Timeout in milliseconds'),
      maxOutputBytes: z.number().int().min(1).optional().describe('Combined stdout and stderr limit'),
    },
    hostMessage: 'Terminal execution is handled by the host.',
    execute: executeRunCommand,
  },
];

async function executeRunCommand(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  try {
    const result = await runCommandTool(
      typeof args.command === 'string' ? args.command : '',
      typeof args.cwd === 'string' ? args.cwd : undefined,
      typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
      typeof args.maxOutputBytes === 'number' ? args.maxOutputBytes : undefined,
      context.abortSignal,
    );
    return { content: JSON.stringify(result), isError: !result.ok };
  } catch (error) {
    if (error instanceof FileToolRejected) return { content: JSON.stringify({ error: error.message }), isError: true };
    throw error;
  }
}