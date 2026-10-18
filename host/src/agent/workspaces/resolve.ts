import { xeckAgentId, xeckWorkspace, xeckPolicyId } from '../../domain/legacy-brand.ts';
/**
 * Katalog bağları. Kayıt tutmaz: workspace, agent ve policy satırlarını okur.
 */
import type { AgentDef, WorkspaceDef } from '@@core/definitions/index.ts';
import { AGENT_BY_ID, CODER_AGENT, XECKBOT_AGENT } from '../catalog/agents.ts';
import { POLICY_BY_ID, XECKBOT_ASK_POLICY } from '../catalog/policies.ts';
import { CODING_WORKSPACE, WORKSPACES, XECKBOT_WORKSPACE } from '../catalog/workspaces.ts';

export function defaultAgentId(): string {
  return CODER_AGENT.id;
}

export function defaultWorkspaceRef(): string {
  return `${CODING_WORKSPACE.id}@${CODING_WORKSPACE.version}`;
}

/** Boş id katalog varsayılanıdır. Bilinmeyen id reddedilir. */
export function resolveAgentId(agentId: string | undefined): string {
  if (!agentId) return defaultAgentId();
  agentId = xeckAgentId(agentId);
  if (AGENT_BY_ID[agentId]) return agentId;
  throw new Error(`Unknown agent '${agentId}'.`);
}

/** Bilinen bir agent'a karşılık gelmiyorsa `null`. */
export function lookupAgent(agentId: string): AgentDef | null {
  return AGENT_BY_ID[xeckAgentId(agentId)] ?? null;
}

/** Agent'ın workspace ref'i, örn. `coding@1`. */
export function agentWorkspaceRef(agentId: string): string {
  const resolved = resolveAgentId(agentId);
  const workspace = WORKSPACES.find((entry) => entry.agents.includes(resolved));
  if (!workspace) return defaultWorkspaceRef();
  return `${workspace.id}@${workspace.version}`;
}

export function findWorkspace(workspaceRef: string | undefined): WorkspaceDef {
  if (workspaceRef) {
    workspaceRef = xeckWorkspace(workspaceRef);
    const byRef = WORKSPACES.find((entry) => `${entry.id}@${entry.version}` === workspaceRef);
    if (byRef) return byRef;
    const byId = WORKSPACES.find((entry) => entry.id === workspaceRef);
    if (byId) return byId;
  }
  return CODING_WORKSPACE;
}

/**
 * Eksik workspace veya agent katalog varsayılanıdır. Yazılı id çevrilmez.
 * Eksik policy, bulunan workspace'in `defaultPolicy`'sidir.
 */
export function chatIdentityFromSession(session: {
  policyId?: unknown;
  workspace?: unknown;
  agentId?: unknown;
  bot?: unknown;
}): { workspace: string; agentId: string; policyId: string } {
  if (session.bot) {
    const policyId = typeof session.policyId === 'string' && XECKBOT_WORKSPACE.policies.includes(session.policyId)
      ? session.policyId
      : typeof session.policyId === 'string' && POLICY_BY_ID[session.policyId]?.label === XECKBOT_ASK_POLICY.label
        ? XECKBOT_ASK_POLICY.id
        : XECKBOT_WORKSPACE.defaultPolicy;
    return { agentId: XECKBOT_AGENT.id, workspace: agentWorkspaceRef(XECKBOT_AGENT.id), policyId };
  }
  const workspace = typeof session.workspace === 'string' && session.workspace
    ? xeckWorkspace(session.workspace)
    : defaultWorkspaceRef();
  const agentId = typeof session.agentId === 'string' && session.agentId
    ? xeckAgentId(session.agentId)
    : defaultAgentId();
  if (typeof session.policyId === 'string' && session.policyId) {
    return { workspace, agentId, policyId: xeckPolicyId(session.policyId) };
  }
  return { workspace, agentId, policyId: findWorkspace(workspace).defaultPolicy };
}
