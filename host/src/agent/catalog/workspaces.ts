/**
 * Workspace = alan + katalog + policy'ler. Agent identity ile bağlanır
 * (`agents[]` tek yön); policy'ler workspace'e aittir.
 * `builtin: '*'` kayıtlı araçların hepsi. Liste, registry'de var olan bir alt küme.
 */
import { WorkspaceDefSchema, type WorkspaceDef } from '@@core/definitions/workspace.ts';
import { ASK_QUESTION_TOOL } from '../tools/builtin/dialog.ts';
import { DISABLE_MCP_TOOL, ENABLE_MCP_TOOL, LIST_MCPS_TOOL } from '../tools/builtin/mcp.ts';
import {
  MEMORY_DELETE_TOOL,
  MEMORY_GET_TOOL,
  MEMORY_LIST_TOOL,
  MEMORY_SEARCH_TOOL,
  MEMORY_UPSERT_TOOL,
} from '../tools/builtin/memory.ts';
import { ADD_RULE_TOOL, LIST_RULES_TOOL, REMOVE_RULE_TOOL } from '../tools/builtin/rules.ts';
import { LIST_SKILLS_TOOL } from '../tools/builtin/skills.ts';

const GENERAL_BUILTIN = [
  ASK_QUESTION_TOOL,
  MEMORY_SEARCH_TOOL,
  MEMORY_GET_TOOL,
  MEMORY_UPSERT_TOOL,
  MEMORY_DELETE_TOOL,
  MEMORY_LIST_TOOL,
  LIST_RULES_TOOL,
  ADD_RULE_TOOL,
  REMOVE_RULE_TOOL,
  LIST_SKILLS_TOOL,
  LIST_MCPS_TOOL,
  ENABLE_MCP_TOOL,
  DISABLE_MCP_TOOL,
] as const;

export const CODING_WORKSPACE: WorkspaceDef = WorkspaceDefSchema.parse({
  id: 'coding',
  version: 1,
  label: 'Coding',
  defaultAgent: 'coder',
  agents: ['coder', 'subagent-coder'],
  policies: ['coder-plan', 'coder-agent', 'coder-ask'],
  defaultPolicy: 'coder-agent',
  toolset: { builtin: '*', mcp: '*', skills: true },
});

export const XECK_AGENT_WORKSPACE: WorkspaceDef = WorkspaceDefSchema.parse({
  id: 'xeck',
  version: 1,
  label: 'Xeck',
  defaultAgent: 'xeck',
  agents: ['xeck'],
  policies: ['xeck-agent', 'xeck-ask'],
  defaultPolicy: 'xeck-agent',
  toolset: { builtin: '*', mcp: '*', skills: true },
});

export const GENERAL_WORKSPACE: WorkspaceDef = WorkspaceDefSchema.parse({
  id: 'general',
  version: 2,
  label: 'General',
  defaultAgent: 'subagent-general',
  agents: ['subagent-general'],
  policies: ['chat'],
  defaultPolicy: 'chat',
  toolset: { builtin: [...GENERAL_BUILTIN], mcp: '*', skills: true },
});

export const WORKSPACES: WorkspaceDef[] = [XECK_AGENT_WORKSPACE, CODING_WORKSPACE, GENERAL_WORKSPACE];

export const WORKSPACE_BY_REF: Record<string, WorkspaceDef> = Object.fromEntries(
  WORKSPACES.map((workspace) => [`${workspace.id}@${workspace.version}`, workspace]),
);
