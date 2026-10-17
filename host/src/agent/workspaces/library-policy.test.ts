import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePolicyDenied, resolvePolicyTools } from 'poyraz';
import { policyForId } from './library-policy.ts';

const BUILTIN = 'mcp_xeck__read_file';
const PLAN_ADD = 'mcp_xeck__todo_add';

test('a third-party MCP server whose tools all pass is listed as one pattern', () => {
  const names = [BUILTIN, 'mcp_github__create_issue', 'mcp_github__list_prs', 'mcp_notion__search'];
  const policy = policyForId('coder-agent', names);
  assert.deepEqual(policy.allowedTools, [BUILTIN, 'mcp_github__*', 'mcp_notion__*']);
  // The patterns select exactly the tools the explicit names did.
  assert.deepEqual(resolvePolicyTools(names, policy), names);
});

test('a policy that drops a built-in keeps the others by exact name and denies it by name', () => {
  const names = [BUILTIN, PLAN_ADD, 'mcp_github__create_issue'];
  const policy = policyForId('coder-agent', names);
  assert.deepEqual(policy.allowedTools, [BUILTIN, 'mcp_github__*']);
  assert.deepEqual(policy.deniedTools, [PLAN_ADD]);
  assert.deepEqual(resolvePolicyTools(names, policy), [BUILTIN, 'mcp_github__create_issue']);
  assert.deepEqual(resolvePolicyDenied(names, policy), [PLAN_ADD]);
});

test('the round budget travels in the policy too', () => {
  assert.equal(policyForId('coder-agent', []).maxToolRounds, 100);
  assert.equal(policyForId('coder-ask', []).maxToolRounds, 30);
});
