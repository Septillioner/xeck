import { DIALOG_TOOLS } from './dialog.ts';
import { BOT_TOOLS } from './bots.ts';
import { FILE_TOOLS } from './file.ts';
import { GREP_TOOLS } from './grep.ts';
import { MEMORY_TOOLS } from './memory.ts';
import { MESSAGING_TOOLS } from './messaging.ts';
import { MCP_TOOLS } from './mcp.ts';
import { PLAN_TOOLS } from './plan.ts';
import { RULE_TOOLS } from './rules.ts';
import { SKILL_TOOLS } from './skills.ts';
import { SUBAGENT_TOOLS } from './subagents.ts';
import { TERMINAL_TOOLS } from './terminal.ts';
import type { BuiltinToolDef } from './types.ts';

/**
 * Registration order is the order the model and the settings page see the tools.
 * Delegation comes first so providers with a small tool cap can still expose
 * the master's agent-management surface. The remaining groups follow domains.
 */
export const BUILTIN_TOOLS: readonly BuiltinToolDef[] = [
  ...SUBAGENT_TOOLS,
  ...MESSAGING_TOOLS,
  ...BOT_TOOLS,
  ...RULE_TOOLS,
  ...SKILL_TOOLS,
  ...MCP_TOOLS,
  ...MEMORY_TOOLS,
  ...DIALOG_TOOLS,
  ...PLAN_TOOLS,
  ...FILE_TOOLS,
  ...GREP_TOOLS,
  ...TERMINAL_TOOLS,
];

const BY_NAME = new Map(BUILTIN_TOOLS.map((def) => [def.name, def]));

/** Registry order. Workspace `builtin: '*'` expands to this. */
export function registeredBuiltinNames(): readonly string[] {
  return BUILTIN_TOOLS.map((def) => def.name);
}

/** Looks up a built-in tool by its server-side name (`mcp_xeck__write_file` -> `write_file`). */
export function builtinToolDef(toolName: string): BuiltinToolDef | undefined {
  return BY_NAME.get(toolName);
}
