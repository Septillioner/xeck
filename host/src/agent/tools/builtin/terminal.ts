import { z } from 'zod';
import { FileToolRejected } from '../../../tools/file-access.ts';
import { runCommandTool, type TerminalInput } from '../../../tools/terminal-run.ts';
import { TERMINAL_SHELLS, terminalShell } from '../../../tools/terminal-shell.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const RUN_COMMAND_TOOL = 'run_command';

export const TERMINAL_TOOLS: BuiltinToolDef[] = [
  {
    name: RUN_COMMAND_TOOL,
    description: `Run a bounded terminal command on ${process.platform}; default shell: ${terminalShell().name} (${terminalShell().executable}). Requires full file access. Use this for directory creation, file moves/renames and filesystem metadata. Match command syntax and quoting to the selected shell; Windows is not a POSIX shell. Other shells must be installed on the host; bash on Windows does not imply WSL. Use an explicit working directory and avoid long-running processes.`,
    inputSchema: {
      command: z.string().describe('Command to run'),
      shell: z.enum(TERMINAL_SHELLS).optional().describe('Shell to use; omit for the host default. Must be installed. No fallback to another shell.'),
      cwd: z.string().optional().describe('Working directory'),
      env: z.record(z.string(), z.string().nullable()).optional().describe('Per-command environment overrides; null removes a variable. Values are not shell code and are not returned. Host environment stays unchanged.'),
      stdin: z.string().optional().describe('UTF-8 input sent to the program, then EOF. Maximum 1000000 bytes. This is not an interactive terminal.'),
      outputEncoding: z.string().optional().describe('Output decoding, default utf-8. Set to the program’s actual encoding, e.g. windows-1254, windows-1252, or utf-16le for cmd /u. This does not change the program’s encoding; avoid mixing encodings in one command.'),
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
      typeof args.shell === 'string' ? args.shell : undefined,
      { env: args.env as TerminalInput['env'], stdin: args.stdin as string | undefined, outputEncoding: args.outputEncoding as string | undefined },
    );
    return { content: JSON.stringify(result), isError: !result.ok };
  } catch (error) {
    if (error instanceof FileToolRejected) return { content: JSON.stringify({ error: error.message }), isError: true };
    throw error;
  }
}
