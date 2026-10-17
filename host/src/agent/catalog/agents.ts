/** Agent = identity: vitrin + talimat, izin yok. */
import { AgentDefSchema, type AgentDef } from '@@core/definitions/index.ts';

export const CODER_AGENT: AgentDef = AgentDefSchema.parse({
  id: 'coder',
  startableBy: ['user'],
  instructions: ['core.base', 'core.rules', 'core.skills', 'core.memory',  'coder.identity','coder.subagent', 'coder.core', 'coder.plan', 'coder.agent'],
  model: null,
  label: 'Coder',
  description: 'Plans and builds with the full workspace toolset.',
  icon: 'code',
  order: 2,
});

export const XECK_AGENT: AgentDef = AgentDefSchema.parse({
  id: 'xeck',
  startableBy: ['user'],
  instructions: ['core.base', 'core.rules', 'core.skills', 'core.memory', 'core.subagent', 'xeck.identity', 'xeck.base'],
  model: null,
  label: 'Xeck',
  description: 'General-purpose agent with the full workspace toolset.',
  icon: 'star',
  order: 1,
});

export const SUBAGENT_CODER: AgentDef = AgentDefSchema.parse({
  id: 'subagent-coder',
  startableBy: ['agent'],
  instructions: ['subagent.task', 'subagent.coder'],
  model: null,
  label: 'Subagent Coder',
  description: 'Focused implementation, code inspection and verification tasks.',
  icon: 'code',
  order: 4,
});

export const SUBAGENT_GENERAL: AgentDef = AgentDefSchema.parse({
  id: 'subagent-general',
  startableBy: ['agent'],
  instructions: ['subagent.task', 'subagent.general'],
  model: null,
  label: 'Subagent General',
  description: 'Focused research, analysis and summarization tasks.',
  icon: 'chat',
  order: 5,
});

export const AGENTS: AgentDef[] = [XECK_AGENT, CODER_AGENT, SUBAGENT_CODER, SUBAGENT_GENERAL];

export const AGENT_BY_ID: Record<string, AgentDef> = Object.fromEntries(
  AGENTS.map((agent) => [agent.id, agent]),
);

/** Kullanıcının başlatabildiği agent'lar, vitrin sırasına göre. */
export function listStartableAgents(by: 'user' | 'agent' = 'user'): AgentDef[] {
  return [...AGENTS]
    .filter((agent) => agent.startableBy.includes(by))
    .sort((left, right) => (left.order ?? 99) - (right.order ?? 99));
}
