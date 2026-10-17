import assert from 'node:assert/strict';
import test from 'node:test';
import { agentRoutes } from './agents.ts';
import { type AgentPublic } from '../../../../shared/types.ts';
import { buildAgentIdentityText } from '../../agent/catalog/prompts/builtin-instructions/index.ts';
import { AGENT_BY_ID } from '../../agent/catalog/agents.ts';

test('agent catalog separates user agents from dedicated subagent targets', async () => {
  const users = await (await agentRoutes.request('/api/agents')).json() as AgentPublic[];
  const children = await (await agentRoutes.request('/api/agents?startableBy=agent')).json() as AgentPublic[];
  assert.deepEqual(users.map((agent) => agent.id), ['xeck', 'coder']);
  assert.equal(users[0].label, 'Xeck');
  assert.deepEqual(children.map((agent) => agent.id), ['subagent-coder', 'subagent-general']);
  assert.equal(children[0].workspace, 'coding@1');
  assert.equal(children[1].workspace, 'general@2');
  assert.equal((await agentRoutes.request('/api/agents?startableBy=invalid')).status, 400);
  for (const child of children) {
    assert.doesNotThrow(() => buildAgentIdentityText(AGENT_BY_ID[child.id].instructions));
    assert.ok(!AGENT_BY_ID[child.id].instructions.includes('core.subagent'));
    assert.ok(!AGENT_BY_ID[child.id].startableBy.includes('user'));
  }
});
