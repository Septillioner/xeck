
import { type AgentDef, AgentDefSchema } from './agent.ts';
import { type PolicyDef, PolicyDefSchema } from './policy.ts';
import type { AllowSelector, ToolsetSelector, ToolLabelShape } from './toolset.ts';
import { type WorkspaceDef, WorkspaceDefSchema, type NameScope } from './workspace.ts';


export {
  WorkspaceDef,
  WorkspaceDefSchema,
  PolicyDef,
  PolicyDefSchema,
  AgentDef,
  AgentDefSchema,
  AllowSelector,
  ToolsetSelector,
  ToolLabelShape,
  NameScope,
};

export function matchesNamePattern(name: string, patterns: readonly string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      if (name.startsWith(pattern.slice(0, -1))) return true;
      continue;
    }
    if (name === pattern) return true;
  }
  return false;
}

export function allowSelectsTool(
  allow: AllowSelector,
  deny: readonly string[],
  scope: NameScope,
  fullName: string,
): { selected: boolean; reason: string } {
  const names = [fullName, scope.serverSideName];
  if (deny.length > 0 && names.some((name) => matchesNamePattern(name, deny))) {
    return { selected: false, reason: 'Denied by the policy deny list.' };
  }
  if (scope.isBuiltin) {
    const only = allow.builtin === '*' ? ['*'] : (allow.builtin ?? []);
    if (!names.some((name) => matchesNamePattern(name, only))) {
      return { selected: false, reason: 'Not in the policy builtin list.' };
    }
  } else if (!scope.isSkillTool) {
    if (Array.isArray(allow.mcp) && !names.some((name) => matchesNamePattern(name, allow.mcp as string[]))) {
      return { selected: false, reason: 'Not in the policy mcp list.' };
    }
  }
  // Explicit isim listesi: builtin doluysa beyaz listedir, mcp '*' değilse öyle.
  return { selected: true, reason: 'Selected by policy.' };
}
