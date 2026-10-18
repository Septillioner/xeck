import { Hono } from 'hono';
import type { AgentPublic } from '../../../../shared/types.ts';
import { listStartableAgents } from '../../agent/catalog/agents.ts';
import { workspaceOffersPlan } from '../../agent/workspaces/definitions.ts';
import { POLICY_BY_ID } from '../../agent/catalog/policies.ts';
import { agentWorkspaceRef } from '../../agent/workspaces/resolve.ts';
import { WORKSPACE_BY_REF } from '../../agent/catalog/workspaces.ts';

/**
 * The user-facing agent catalog for the new-chat picker. Only agents
 * `startableBy: ['user']` appear, ordered by their showcase `order`.
 */
export const agentRoutes = new Hono();

agentRoutes.get('/api/agents', (c) => {
  const by = c.req.query('startableBy') ?? 'user';
  if (by !== 'user' && by !== 'agent' && by !== 'bot') return c.json({ error: 'Invalid agent audience' }, 400);
  const agents: AgentPublic[] = listStartableAgents(by).map((agent) => {
    const workspaceRef = agentWorkspaceRef(agent.id);
    const workspace = WORKSPACE_BY_REF[workspaceRef];
    const policies = (workspace?.policies ?? []).map((policyId) => {
      const policy = POLICY_BY_ID[policyId];
      if (!policy) throw new Error(`Workspace policy '${policyId}' is not registered.`);
      return {
        id: policyId,
        label: policy.label ?? policyId,
        accentColor: policy.accentColor,
      };
    });
    return {
      id: agent.id,
      botOnly: agent.startableBy.includes('bot'),
      label: agent.label ?? agent.id,
      description: agent.description ?? '',
      icon: agent.icon ?? 'chat',
      workspace: workspaceRef,
      defaultPolicy: workspace?.defaultPolicy ?? '',
      policies,
      plan: workspace ? workspaceOffersPlan(workspace) : false,
    };
  });
  return c.json(agents);
});
