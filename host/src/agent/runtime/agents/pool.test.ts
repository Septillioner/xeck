import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Agent } from 'poyraz';
import { acquireAgentTurn, abortChat, ChatInFlightError, dropAgent } from './pool.ts';
import { inspectContext } from './execution.ts';
import { createSession, setSessionPolicyId } from '../../../stores/sessions.ts';

test('a turn exclusively owns its session; abort and stale release cannot affect a replacement', () => {
  const parent = new AbortController();
  const first = acquireAgentTurn('pool-ownership', parent.signal);
  const independent = acquireAgentTurn('pool-independent');
  try {
    assert.throws(() => acquireAgentTurn(first.sessionId), ChatInFlightError);
    parent.abort();
    assert.equal(first.signal.aborted, true);
    assert.equal(independent.signal.aborted, false);
    assert.throws(() => acquireAgentTurn(first.sessionId), ChatInFlightError, 'abort holds ownership until final persistence');
    first.release();
    const next = acquireAgentTurn(first.sessionId);
    try {
      first.release(true);
      assert.equal(next.signal.aborted, false);
      assert.equal(abortChat(next.sessionId), true);
      assert.equal(next.signal.aborted, true);
    } finally { next.release(); }
    assert.equal(abortChat(first.sessionId), false);
  } finally {
    first.release();
    independent.release();
  }
});

test('the pool reuses configured agents, reloads session context, isolates inspection and rebuilds on policy changes', async (t) => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-pool-'));
  process.env.APPDATA = directory;
  const profile = { provider: 'llamacpp' as const, model: 'pool-test', host: 'http://127.0.0.1:1' };
  const session = await createSession(profile, undefined, undefined, 'coder', 'coder-agent');
  const input = { profile, apiKey: '', libraryMessages: [{ role: 'user' as const, content: 'Keep this decision' }] };
  let turn = acquireAgentTurn(session.id);
  try {
    const first = await turn.getAgent(input, true);
    first.continuedReplies.push('An earlier continuation');
    turn.release();
    turn = acquireAgentTurn(session.id);
    const history = [{ role: 'user' as const, content: 'Current session context' }];
    const reused = await turn.getAgent({ ...input, libraryMessages: history }, true);
    assert.equal(reused.agent, first.agent);
    assert.deepEqual(reused.continuedReplies, [], 'continuation text belongs to one turn');
    assert.ok(reused.agent.getHistory().some((message) => message.content === history[0].content));
    assert.ok(!reused.agent.getHistory().some((message) => message.content === input.libraryMessages[0].content));
    const beforeInspection = reused.agent.getHistory();
    await inspectContext({ sessionId: session.id, ...input });
    assert.deepEqual(reused.agent.getHistory(), beforeInspection, 'inspection cannot replace active context');
    turn.release();
    await setSessionPolicyId(session.id, 'coder-ask');
    turn = acquireAgentTurn(session.id);
    const changed = await turn.getAgent(input, true);
    assert.notEqual(changed.agent, first.agent);
    const names = changed.agent.compileRequest().tools.map((tool) => tool.function.name);
    assert.ok(names.length > 0);
    assert.ok(!names.includes('mcp_xeck__write_file'));
    turn.release(true);
    turn = acquireAgentTurn(session.id);
    assert.notEqual((await turn.getAgent(input, true)).agent, changed.agent, 'discard releases the instance too');
    turn.release(true);
    turn = acquireAgentTurn(session.id);
    let reachedInit!: () => void;
    let resumeInit!: () => void;
    const initializing = new Promise<void>((resolve) => { reachedInit = resolve; });
    const resume = new Promise<void>((resolve) => { resumeInit = resolve; });
    const originalInit = Agent.prototype.init;
    let cancelledAgent: Agent | undefined;
    const init = t.mock.method(Agent.prototype, 'init', async function (this: Agent) {
      cancelledAgent = this;
      reachedInit();
      await resume;
      return originalInit.call(this);
    });
    const pending = turn.getAgent(input, true);
    await initializing;
    dropAgent(session.id);
    resumeInit();
    await assert.rejects(pending, { name: 'AbortError' });
    init.mock.restore();
    turn.release();
    turn = acquireAgentTurn(session.id);
    const afterCancellation = await turn.getAgent(input, true);
    assert.notEqual(afterCancellation.agent, cancelledAgent, 'late initialization was not reinserted');
    assert.equal(afterCancellation.agent.getHistory().at(-1)?.content, input.libraryMessages[0].content);
  } finally {
    turn.release(true);
    dropAgent(session.id);
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});

test('a cancelled or released turn cannot prepare or reinsert an agent', async () => {
  const parent = new AbortController();
  parent.abort();
  const turn = acquireAgentTurn('pool-pre-cancel', parent.signal);
  const input = { profile: { provider: 'llamacpp' as const, model: 'unused', host: '' }, apiKey: '', libraryMessages: [] };
  try {
    await assert.rejects(turn.getAgent(input, true), { name: 'AbortError' });
  } finally { turn.release(); }
  const released = acquireAgentTurn('pool-released');
  released.release();
  await assert.rejects(released.getAgent(input, true), /released/);
});
