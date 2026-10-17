import assert from 'node:assert/strict';
import test from 'node:test';
import { chatIdentityFromSession } from './resolve.ts';

test('missing session fields use the catalog default', () => {
  assert.deepEqual(chatIdentityFromSession({}), {
    workspace: 'coding@1',
    agentId: 'coder',
    policyId: 'coder-agent',
  });
  assert.equal(
    chatIdentityFromSession({ policyId: 'coder-plan', workspace: 'coding@1', agentId: 'coder' }).policyId,
    'coder-plan',
  );
});

test('stored workspace and agent ids stay as written', () => {
  assert.deepEqual(chatIdentityFromSession({ workspace: 'general@1', agentId: 'main' }), {
    workspace: 'general@1',
    agentId: 'main',
    policyId: 'coder-agent',
  });
  assert.deepEqual(chatIdentityFromSession({ workspace: 'general@2', agentId: 'general' }), {
    workspace: 'general@2',
    agentId: 'general',
    policyId: 'chat',
  });
});
