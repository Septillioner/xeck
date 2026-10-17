import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { listBuiltinMcpTools } from './builtin/connection.ts';
import { PLAN_TOOL_NAMES } from './builtin/plan.ts';
import { blocksToolInPolicy, policyRejection } from './policy-context.ts';
import { createSession, setSessionPolicyId } from '../../stores/sessions.ts';
import { buildXeckSystemInstructions } from '@@prompts/system-prompt.ts';
import { maxToolRoundsForPolicy, policyForId } from '../workspaces/library-policy.ts';
import { buildAgentIdentityText } from '@@prompts/builtin-instructions/index.ts';
import { CODER_AGENT } from '../catalog/agents.ts';
import { PLAN_POLICY_DENIED_REASON, POLICY_BY_ID } from '../catalog/policies.ts';
import { selectedBuiltinNames } from '../workspaces/definitions.ts';

const TOOLS = ['mcp_xeck__write_file', 'mcp_xeck__replace_lines', 'mcp_xeck__delete_file', 'mcp_xeck__run_command'];

async function withDataDir(t: (root: string) => Promise<void>): Promise<void> {
  const previousAppData = process.env.APPDATA;
  const root = await mkdtemp(path.join(os.tmpdir(), 'xeck-plan-mode-'));
  process.env.APPDATA = root;
  try {
    await t(root);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(root, { recursive: true, force: true });
  }
}

test('plan mode rejects mutating tools before they run', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);

    // Agent mode is the default and lets every tool through.
    for (const tool of TOOLS) assert.equal(await policyRejection(tool, session.id), null);

    await setSessionPolicyId(session.id, 'coder-plan');
    for (const tool of TOOLS) {
      assert.equal(await policyRejection(tool, session.id), PLAN_POLICY_DENIED_REASON);
    }
    // Reading, searching and the plan tools stay available in plan mode.
    for (const tool of ['mcp_xeck__read_file', 'mcp_xeck__search_files', ...PLAN_TOOL_NAMES.filter((name) => name !== 'todo_update').map((name) => `mcp_xeck__${name}`)]) {
      assert.equal(blocksToolInPolicy(tool, 'coder-plan'), false);
    }
    // No session means nothing to check the policy against.
    assert.equal(await policyRejection('mcp_xeck__write_file'), null);
  });
});

test('todo_add is plan-only and todo_update is agent-only', () => {
  const allowed = ['load_skill', 'mcp_xeck__read_file', 'mcp_xeck__plan_write', 'mcp_xeck__todo_add', 'mcp_xeck__todo_update', 'mcp_xeck__write_file', 'mcp_xeck__run_command'];
  const plan = policyForId('coder-plan', allowed);
  const agent = policyForId('coder-agent', allowed);

  assert.deepEqual([...agent.allowedTools], ['load_skill', 'mcp_xeck__read_file', 'mcp_xeck__plan_write', 'mcp_xeck__todo_update', 'mcp_xeck__write_file', 'mcp_xeck__run_command']);
  assert.equal(agent.id, 'coder-agent');
  assert.equal(agent.hardBlockDeniedTools, true);

  assert.deepEqual([...plan.allowedTools], ['load_skill', 'mcp_xeck__read_file', 'mcp_xeck__plan_write', 'mcp_xeck__todo_add']);
  assert.equal(plan.id, 'coder-plan');
  assert.equal(plan.hardBlockDeniedTools, true);
  assert.equal(plan.deniedToolReason, PLAN_POLICY_DENIED_REASON);

  assert.equal(maxToolRoundsForPolicy('coder-agent'), 100);
  assert.equal(maxToolRoundsForPolicy('coder-plan'), 100);
  assert.equal(maxToolRoundsForPolicy('coder-ask'), 30);
});

test('the error circuit breaker stays off in every policy', () => {
  const allowed = ['load_skill', 'mcp_xeck__read_file', 'mcp_xeck__write_file'];
  for (const policyId of ['coder-plan', 'coder-agent', 'coder-ask'] as const) {
    assert.equal(policyForId(policyId, allowed).errorBreaker, 'off');
  }
});

test('the plan policy allow list is the only plan gate', () => {
  const allow = POLICY_BY_ID['coder-plan']?.allow.builtin;
  assert.ok(Array.isArray(allow));
  const allowed = new Set(allow);
  for (const name of selectedBuiltinNames('*')) {
    const tool = `mcp_xeck__${name}`;
    assert.equal(blocksToolInPolicy(tool, 'coder-plan'), !allowed.has(name), name);
  }
  for (const name of [...PLAN_TOOL_NAMES.filter((tool) => tool !== 'todo_update'), 'read_file', 'search_files', 'list_directory', 'ask_question', 'memory_search']) {
    assert.equal(blocksToolInPolicy(`mcp_xeck__${name}`, 'coder-plan'), false, `${name} must stay available`);
  }
  assert.equal(blocksToolInPolicy('load_skill', 'coder-plan'), false);
  assert.equal(blocksToolInPolicy('mcp_github__create_issue', 'coder-plan'), false);
  assert.equal(blocksToolInPolicy('mcp_xeck__some_future_tool', 'coder-plan'), true);
});

test('nothing about the mode reaches the system prompt', () => {
  // The prompt builder takes no mode at all, so a switch cannot change the cached
  // prefix. The plan tool rules are part of the Coder agent's instructions
  // (builtin-instructions/coder.ts), not of this base prompt.
  const prompt = buildXeckSystemInstructions('custom', true);
  assert.match(prompt, /custom/);
  assert.match(buildAgentIdentityText(CODER_AGENT.instructions), /ask_question/);
  assert.doesNotMatch(buildAgentIdentityText(CODER_AGENT.instructions, false), /Questions\. Use ask_question/);
  assert.doesNotMatch(prompt, /plan mode|agent mode|implements? the plan/i);
  assert.equal(buildXeckSystemInstructions('custom', true), prompt);
});

test('the built-in server exposes the plan tools in a stable order', async () => {
  const tools = await listBuiltinMcpTools();
  const names = tools.map((tool) => tool.name);
  const planNames = names.filter((name) => PLAN_TOOL_NAMES.includes(name as (typeof PLAN_TOOL_NAMES)[number]));
  assert.deepEqual(planNames, [...PLAN_TOOL_NAMES]);
  for (const name of planNames) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, `${name} must be registered`);
    assert.match(tool.description, /[A-Za-z]/);
    assert.doesNotMatch(tool.description, /plan mode|agent mode/i);
  }
  // Reconnecting lists the same tools in the same order.
  const again = await listBuiltinMcpTools();
  assert.deepEqual(again.map((tool) => tool.name), names);
});