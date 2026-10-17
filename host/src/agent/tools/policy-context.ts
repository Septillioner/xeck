import type { SessionPolicyId } from '../../../../shared/types.ts';
import { CODING_WORKSPACE } from '../catalog/workspaces.ts';
import { POLICY_BY_ID } from '../catalog/policies.ts';
import { explainTool, type ExplainContext } from '../core/explain.ts';
import { readSession, readSessionPolicyId } from '../../stores/sessions.ts';
import { getToolLabel } from './tool-labels.ts';
import { isBuiltinHostTool, serverSideName } from './builtin/identity.ts';

/**
 * Policy tabanlı filtre: mevcut `blocksToolInPolicy / filterToolsForPolicy`
 * ikilisinin `explain()` üzerinden konuşan karşılığı.
 *
 * Policy explicit allow/deny listesinden gelir (`agent/workspaces/policies.ts`).
 * Davranış değişmez — matris testi kilitler.
 */


export interface PolicyFilterInput {
  toolName: string;
  policyId: SessionPolicyId;
  capabilities?: readonly string[];
  fullFileAccess?: boolean;
}

/** Policy id + tool adından `explain()` bağlamı kurar. */
export function policyContextFor(input: PolicyFilterInput): ExplainContext {
  const policy = POLICY_BY_ID[input.policyId] ?? POLICY_BY_ID[CODING_WORKSPACE.defaultPolicy];
  if (!policy) throw new Error(`Policy '${input.policyId}' is not in the catalog.`);
  const isBuiltin = isBuiltinHostTool(input.toolName);
  const isSkill = input.toolName === 'load_skill';
  return {
    toolName: input.toolName,
    serverSideName: isBuiltin ? serverSideName(input.toolName) : input.toolName,
    isBuiltin,
    isSkillTool: isSkill,
    label: getToolLabel(input.toolName),
    available: true,
    inToolset: true,
    allow: policy.allow,
    deny: policy.deny ?? [],
    capabilities: input.capabilities ?? ['user', 'plan-owner'],
    fullFileAccess: input.fullFileAccess ?? true,
  };
}

/** Policy id altında tool'un modele sunulup sunulmayacağı: tek karar noktası. */
export function isToolAllowedInPolicy(input: PolicyFilterInput): boolean {
  return explainTool(policyContextFor(input)).allowed;
}

/** Kütüphaneye verilen listedeki isimleri policy ile süzer. */
export function filterToolsForPolicy(toolNames: string[], policyId: SessionPolicyId, options: Pick<PolicyFilterInput, 'fullFileAccess'> = {}): string[] {
  return toolNames.filter((toolName) => isToolAllowedInPolicy({ toolName, policyId, ...options }));
}

/** Aktif policy bu aracı reddediyor mu. */
export function blocksToolInPolicy(toolName: string, policyId: string): boolean {
  return !isToolAllowedInPolicy({ toolName, policyId });
}

/**
 * Tur devam ederken policy değişmişse çağrıyı çalıştırmadan durdurur.
 * Ret metni o policy satırının `deniedReason` değeridir.
 */
export async function policyRejection(toolName: string, sessionId?: string): Promise<string | null> {
  if (!sessionId) return null;
  const session = await readSession(sessionId);
  if (session?.origin?.by === 'agent' && !session.origin.grant.tools.includes(toolName)) {
    return 'The parent agent did not grant this tool to the subagent.';
  }
  const policyId = await readSessionPolicyId(sessionId, CODING_WORKSPACE.defaultPolicy);
  if (!blocksToolInPolicy(toolName, policyId)) return null;
  return POLICY_BY_ID[policyId]?.deniedReason ?? 'This policy does not allow that tool.';
}
