import type { ZodRawShape } from 'zod';

/** A tool as reported by the in-memory MCP server, before it becomes an agent tool. */
export interface ListedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** What the agent library expects back from a tool call. */
export interface ToolResult {
  content: string;
  isError?: boolean;
}

/** Session context the bridge passes to host-side executions. */
export interface ToolCallContext {
  sessionId?: string;
  abortSignal?: AbortSignal;
}

/** Shape every in-memory server handler answers with. The index signature keeps it assignable to the MCP SDK `Result`. */
export interface ServerToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError: boolean;
}

/** A tool the in-memory server executes itself. */
export interface ServerSideBuiltinTool {
  name: string;
  description: string;
  inputSchema?: ZodRawShape;
  /** Runs inside the server; `args` arrive validated by `inputSchema`. */
  handler: (args: Record<string, any>) => Promise<ServerToolResult>;
}

/** A tool the host owns: the server answers `hostMessage`, the bridge runs `execute`. */
export interface HostBuiltinTool {
  name: string;
  description: string;
  inputSchema?: ZodRawShape;
  /** What the in-memory server returns while the host holds the real execution. */
  hostMessage: string;
  /** Runs in the bridge, where session context and user dialogs are available. */
  execute: (args: Record<string, unknown>, context: ToolCallContext) => Promise<ToolResult>;
}

export type BuiltinToolDef = ServerSideBuiltinTool | HostBuiltinTool;
