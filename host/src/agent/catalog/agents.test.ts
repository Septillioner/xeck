import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSession, readSessionIdentity } from '../../stores/sessions.ts';
import { AGENTS, CODER_AGENT, SUBAGENT_GENERAL, XECK_AGENT, listStartableAgents } from './agents.ts';
import { policyIdFor, selectedBuiltinNames, validateDefinitions } from '../workspaces/definitions.ts';
import { agentWorkspaceRef, resolveAgentId } from '../workspaces/resolve.ts';
import { CODING_WORKSPACE, GENERAL_WORKSPACE } from './workspaces.ts';
import { registeredBuiltinNames } from '../tools/builtin/registry.ts';
import { buildAgentIdentityText } from './prompts/builtin-instructions/index.ts';

async function withDataDir(t: (root: string) => Promise<void>): Promise<void> {
  const previousAppData = process.env.APPDATA;
  const root = await mkdtemp(path.join(os.tmpdir(), 'xecks-'));
  process.env.APPDATA = root;
  try {
    await t(root);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(root, { recursive: true, force: true });
  }
}

test('validateDefinitions passes for the binary catalog', () => {
  assert.doesNotThrow(() => validateDefinitions());
});

test('core instructions are composed per agent capability', () => {
  const coder = buildAgentIdentityText(CODER_AGENT.instructions);
  const xeck = buildAgentIdentityText(XECK_AGENT.instructions);
  for (const prompt of [coder, xeck]) {
    assert.match(prompt, /list_rules/);
    assert.match(prompt, /list_skills/);
    assert.match(prompt, /memory_search/);
  }
  for (const prompt of [coder, xeck]) {
    assert.match(prompt, /delegate_agents/);
  }
  assert.doesNotThrow(() => buildAgentIdentityText(SUBAGENT_GENERAL.instructions));
});

test('workspace bindings retain the research subagent after General is removed', () => {
  assert.equal(agentWorkspaceRef('coder'), 'coding@1');
  assert.equal(agentWorkspaceRef('subagent-general'), 'general@2');
  assert.deepEqual([...CODING_WORKSPACE.policies], ['coder-plan', 'coder-agent', 'coder-ask']);
  assert.equal(CODING_WORKSPACE.defaultPolicy, 'coder-agent');
  assert.equal(CODING_WORKSPACE.defaultAgent, 'coder');
  assert.deepEqual([...GENERAL_WORKSPACE.policies], ['chat']);
  assert.equal(GENERAL_WORKSPACE.defaultPolicy, 'chat');
  assert.equal(GENERAL_WORKSPACE.defaultAgent, 'subagent-general');
});

test('picker: user-startable agents only, xeck first, showcase metadata present', () => {
  assert.deepEqual(listStartableAgents().map((agent) => agent.id), ['xeck', 'coder']);
  assert.deepEqual(listStartableAgents('agent').map((agent) => agent.id), ['subagent-coder', 'subagent-general']);
  const users = new Set(listStartableAgents().map((agent) => agent.id));
  const subagents = new Set(listStartableAgents('agent').map((agent) => agent.id));
  for (const agent of AGENTS) {
    assert.equal(agent.startableBy.includes('user'), users.has(agent.id));
    assert.equal(agent.startableBy.includes('agent'), subagents.has(agent.id));
    assert.notEqual(users.has(agent.id), subagents.has(agent.id));
  }
  assert.equal(CODER_AGENT.label, 'Coder');
  assert.equal(XECK_AGENT.label, 'Xeck');
  assert.ok(CODER_AGENT.description && XECK_AGENT.description);
  assert.ok(CODER_AGENT.icon && XECK_AGENT.icon);
  assert.ok((XECK_AGENT.order ?? 0) < (CODER_AGENT.order ?? 0));
});

test('missing agent is the catalog default; an unknown id is rejected', () => {
  assert.equal(resolveAgentId(undefined), 'coder');
  assert.throws(() => resolveAgentId('general'), /Unknown agent/);
  assert.throws(() => resolveAgentId('main'), /Unknown agent/);
  assert.throws(() => resolveAgentId('does-not-exist'), /Unknown agent/);
  assert.equal(policyIdFor('coding@1', 'coder-plan'), 'coder-plan');
  assert.equal(policyIdFor('coding@1', 'coder-agent'), 'coder-agent');
  assert.equal(policyIdFor('coding@1', 'coder-ask'), 'coder-ask');
  assert.equal(policyIdFor('general@2', 'coder-agent'), 'chat');
  assert.equal(policyIdFor('general@2', 'coder-plan'), 'chat');
  assert.equal(policyIdFor('coding', 'coder-ask'), 'coder-ask');
});

test('research subagent keeps the chat toolset; coding selects the whole registry', () => {
  assert.equal(CODING_WORKSPACE.toolset.builtin, '*');
  assert.equal(selectedBuiltinNames(CODING_WORKSPACE.toolset.builtin).length, registeredBuiltinNames().length);
  const general = GENERAL_WORKSPACE.toolset.builtin;
  assert.ok(Array.isArray(general));
  const known = new Set<string>(registeredBuiltinNames());
  for (const name of general) assert.ok(known.has(name), `${name} must be a registered builtin`);
  for (const blocked of ['read_file', 'write_file', 'run_command', 'plan_write', 'write_skill']) {
    assert.ok(!general.includes(blocked), `${blocked} must stay out of the general toolset`);
  }
  assert.ok(general.includes('ask_question'));
  assert.ok(general.includes('enable_mcp'));
  assert.equal(GENERAL_WORKSPACE.toolset.mcp, '*');
  assert.equal(GENERAL_WORKSPACE.toolset.skills, true);
});

test('createSession derives workspace/agent from agentId', async () => {
  await withDataDir(async () => {
    const agent = await createSession(null, undefined, undefined, 'xeck');
    assert.equal(agent.agentId, 'xeck');
    assert.equal(agent.workspace, 'xeck@1');
    assert.equal(agent.policyId, 'xeck-agent');

    const fallback = await createSession(null);
    assert.equal(fallback.agentId, 'coder');
    assert.equal(fallback.workspace, 'coding@1');
    assert.equal(fallback.policyId, 'coder-agent');

    assert.deepEqual(await readSessionIdentity(agent.id), { workspace: 'xeck@1', agentId: 'xeck' });
    assert.deepEqual(await readSessionIdentity(fallback.id), { workspace: 'coding@1', agentId: 'coder' });
  });
});