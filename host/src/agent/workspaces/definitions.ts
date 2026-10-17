/**
 * Katalog bağını doğrular. Kayıt tutmaz; çağıran kataloğu kendi dosyasından okur.
 */
import {
  AgentDefSchema,
  PolicyDefSchema,
  WorkspaceDefSchema,
  type WorkspaceDef,
} from '@@core/definitions/index.ts';
import { PLAN_TOOL_NAMES } from '../tools/builtin/plan.ts';
import { registeredBuiltinNames } from '../tools/builtin/registry.ts';
import { isBuiltinInstructionId } from '@@prompts/builtin-instructions/index.ts';
import { AGENTS } from '../catalog/agents.ts';
import { POLICIES, POLICY_BY_ID } from '../catalog/policies.ts';
import { findWorkspace } from './resolve.ts';
import { WORKSPACES } from '../catalog/workspaces.ts';

/** `'*'` kayıt sırasına açılır. Liste olduğu gibi kalır. */
export function selectedBuiltinNames(builtin: '*' | readonly string[]): readonly string[] {
  return builtin === '*' ? registeredBuiltinNames() : builtin;
}

/** Plan yüzeyi, seçilmiş araçlar plan modülünün araçlarını kesiyorsa açıktır. */
export function workspaceOffersPlan(workspace: WorkspaceDef): boolean {
  const names = new Set(selectedBuiltinNames(workspace.toolset.builtin));
  return PLAN_TOOL_NAMES.some((name) => names.has(name));
}

/**
 * Oturumun policy'si: workspace + policy id'den çözülür. İstenen id workspace'in
 * policies listesindeyse o, değilse workspace default'u.
 */
export function policyIdFor(workspaceRef: string, policyId: string): string {
  const workspace = findWorkspace(workspaceRef);
  return workspace.policies.includes(policyId) ? policyId : workspace.defaultPolicy;
}

function selectionNames(builtin: '*' | readonly string[] | undefined): readonly string[] {
  if (builtin === '*' || builtin === undefined) return [];
  return builtin;
}

/** Katalog yüklenirken kopuk referansı reddeder. */
export function validateDefinitions(): void {
  const registered = new Set(registeredBuiltinNames());
  const referencedPolicies = new Set<string>();
  for (const workspace of WORKSPACES) {
    WorkspaceDefSchema.parse(workspace);
    const selected = new Set(selectedBuiltinNames(workspace.toolset.builtin));
    for (const name of selectionNames(workspace.toolset.builtin)) {
      if (!registered.has(name)) {
        throw new Error(`Workspace '${workspace.id}' tool '${name}' is not registered.`);
      }
    }
    if (!workspace.agents.includes(workspace.defaultAgent)) {
      throw new Error(`Workspace '${workspace.id}' defaultAgent '${workspace.defaultAgent}' is not in agents.`);
    }
    if (!workspace.policies.includes(workspace.defaultPolicy)) {
      throw new Error(`Workspace '${workspace.id}' defaultPolicy '${workspace.defaultPolicy}' is not in policies.`);
    }
    for (const policyId of workspace.policies) {
      referencedPolicies.add(policyId);
      const policy = POLICY_BY_ID[policyId];
      if (!policy) throw new Error(`Workspace '${workspace.id}' policy '${policyId}' is missing.`);
      for (const name of [...selectionNames(policy.allow.builtin), ...(policy.deny ?? [])]) {
        if (!registered.has(name)) {
          throw new Error(`Policy '${policyId}' tool '${name}' is not registered.`);
        }
        if (!selected.has(name)) {
          throw new Error(`Policy '${policyId}' tool '${name}' is outside workspace '${workspace.id}'.`);
        }
      }
    }
  }
  for (const agent of AGENTS) {
    AgentDefSchema.parse(agent);
    for (const instruction of agent.instructions) {
      if (!isBuiltinInstructionId(instruction)) {
        throw new Error(`Agent '${agent.id}' instruction '${instruction}' is not registered.`);
      }
    }
    const workspace = WORKSPACES.find((entry) => entry.agents.includes(agent.id));
    if (!workspace) throw new Error(`Agent '${agent.id}' is in no workspace.`);
    if (agent.startableBy.includes('user')) {
      for (const policyId of workspace.policies) {
        const policy = POLICY_BY_ID[policyId];
        if (!policy?.choosable.includes('user')) {
          throw new Error(`User workspace '${workspace.id}' policy '${policyId}' is not user-choosable.`);
        }
      }
    }
  }
  for (const policy of POLICIES) {
    PolicyDefSchema.parse(policy);
    if (!referencedPolicies.has(policy.id)) {
      throw new Error(`Policy '${policy.id}' is not selected by a workspace.`);
    }
  }
}
