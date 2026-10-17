import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { builtinMcpTools } from '../../tools/builtin/connection.ts';
import { createSession, listChildSessions, listSessions, readSession } from '../../../stores/sessions.ts';
import { writeSkill } from '../../../stores/instruction-store.ts';
import { updateProvider } from '../../../stores/provider-store.ts';
import { delegateAgents } from './subagents.ts';
import { startSessionTurn } from './turn.ts';
import { subscribeLive } from '../events/live-chat.ts';
import type { SubagentUpdate } from '../../../../../shared/types.ts';

test('the built-in MCP delegation creates hidden child sessions and returns per-child results', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-delegation-'));
  process.env.APPDATA = directory;
  try {
    await writeSkill({ name: 'inspection', description: 'Inspect source', content: 'Read the supplied source and report concrete findings.' });
    const parent = await createSession(null, undefined, undefined, 'coder', 'coder-agent');
    const tools = await builtinMcpTools(new Set());
    const delegate = Object.values(tools).find((tool) => tool.name.endsWith('__delegate_agents'));
    assert.ok(delegate);
    assert.match(delegate.description, /subagent-coder, subagent-general/);
    const unknown = await delegate.execute({
      tasks: [{ agentId: 'researcher', task: 'Summarize task delegation' }],
    }, { sessionId: parent.id }) as { content: string; isError?: boolean };
    assert.equal(unknown.isError, true);
    assert.match(unknown.content, /Unknown agent 'researcher'. Available agent IDs: subagent-coder, subagent-general/);
    assert.equal((await listChildSessions(parent.id)).length, 0);
    const mainAgent = await delegate.execute({ tasks: [{ agentId: 'coder', task: 'Inspect a module' }] }, { sessionId: parent.id }) as { content: string; isError?: boolean };
    assert.equal(mainAgent.isError, true);
    assert.match(mainAgent.content, /cannot be started by another agent/);
    assert.equal((await listChildSessions(parent.id)).length, 0);
    const response = await delegate.execute({
      tasks: [
        { agentId: 'subagent-general', task: 'Summarize the design' },
        { agentId: 'subagent-coder', task: 'Check the implementation' },
      ],
    }, { sessionId: parent.id }) as { content: string; isError?: boolean };
    assert.equal(response.isError, undefined);
    const payload = JSON.parse(response.content) as { results: { sessionId: string; status: string }[] };
    assert.equal(payload.results.length, 2);
    assert.ok(payload.results.every((result) => result.status === 'failed'));
    const children = await listChildSessions(parent.id);
    assert.equal(children.length, 2);
    assert.deepEqual((await listSessions()).map((session) => session.id), [parent.id]);
    for (const child of children) {
      const stored = await readSession(child.id);
      assert.equal(stored?.messages[0]?.role, 'user');
      assert.equal(stored?.subagentStatus, 'failed');
      assert.ok(stored?.origin?.by === 'agent' && stored.origin.grant.tools.includes('load_skill'));
    }
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});

test('delegated sessions run through Poyraz AgentBuilder and persist separate replies', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-delegation-run-'));
  const requests: string[] = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    requests.push(body);
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end([
      'data: ' + JSON.stringify({ id: 'mock', choices: [{ index: 0, delta: { role: 'assistant', content: 'Task complete' } }] }),
      'data: ' + JSON.stringify({ id: 'mock', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }),
      'data: [DONE]',
      '',
    ].join('\n\n'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.APPDATA = directory;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const host = `http://127.0.0.1:${address.port}`;
    await updateProvider('llamacpp', { enabled: true, host, model: 'mock' });
    const parent = await createSession({ provider: 'llamacpp', model: 'mock', host }, undefined, undefined, 'coder', 'coder-agent');
    const results = await delegateAgents(parent.id, [
      { agentId: 'subagent-general', task: 'Summarize the plan' },
      { agentId: 'subagent-coder', task: 'Review the plan' },
    ]);
    assert.deepEqual(results.map((result) => result.status), ['done', 'done']);
    assert.deepEqual(results.map((result) => result.result), ['Task complete', 'Task complete']);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      const body = JSON.parse(request) as { tools?: { function?: { name?: string } }[] };
      const names = (body.tools ?? []).map((tool) => tool.function?.name);
      assert.ok(!names.some((name) => name?.endsWith('__delegate_agents') || name?.endsWith('__ask_question')));
    }
    for (const [index, result] of results.entries()) {
      const child = await readSession(result.sessionId);
      assert.equal(child?.messages[0]?.role, 'user');
      assert.equal(child?.messages[0]?.content, index === 0 ? 'Summarize the plan' : 'Review the plan');
      assert.equal(child?.messages[1]?.content, 'Task complete');
      assert.equal(child?.subagentStatus, 'done');
      assert.ok(child?.usage?.totalTokens);
    }
    const turn = await startSessionTurn(parent, 'Can you delegate?');
    const outcome = await turn.completion;
    assert.equal(outcome.error, undefined);
    const masterRequest = JSON.parse(requests.at(-1) ?? '{}') as { tools?: { function?: { name?: string } }[] };
    assert.ok(masterRequest.tools?.some((tool) => tool.function?.name?.endsWith('__delegate_agents')));
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('a master tool call delegates one simple task and uses the child result', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-delegation-tool-call-'));
  const requests: Array<{ messages?: Array<{ role: string; content?: string }>; tools?: Array<{ function?: { name?: string } }> }> = [];
  const childAnswer = 'Delegation lets developers split independent work. Specialists can finish their parts in parallel.';
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    const parsed = JSON.parse(body) as (typeof requests)[number];
    requests.push(parsed);
    const delegateName = parsed.tools?.find((tool) => tool.function?.name?.endsWith('__delegate_agents'))?.function?.name;
    const hasToolResult = parsed.messages?.some((message) => message.role === 'tool');
    let delta: Record<string, unknown>;
    let finishReason = 'stop';
    if (delegateName && !hasToolResult) {
      delta = {
        role: 'assistant',
        tool_calls: [{
          index: 0,
          id: 'delegate-1',
          type: 'function',
          function: {
            name: delegateName,
            arguments: JSON.stringify({
              tasks: [{ agentId: 'subagent-general', task: 'Summarize the benefits of task delegation in two sentences.' }],
            }),
          },
        }],
      };
      finishReason = 'tool_calls';
    } else {
      delta = { role: 'assistant', content: hasToolResult ? `Child result: ${childAnswer}` : childAnswer };
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end([
      'data: ' + JSON.stringify({ id: 'mock', choices: [{ index: 0, delta }] }),
      'data: ' + JSON.stringify({ id: 'mock', choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }),
      'data: [DONE]',
      '',
    ].join('\n\n'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.APPDATA = directory;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const host = `http://127.0.0.1:${address.port}`;
    await updateProvider('llamacpp', { enabled: true, host, model: 'mock' });
    const parent = await createSession({ provider: 'llamacpp', model: 'mock', host }, undefined, undefined, 'coder', 'coder-agent');
    const turn = await startSessionTurn(parent, 'Delegate a simple task about task delegation.');
    const updates: SubagentUpdate[] = [];
    const unsubscribe = subscribeLive(turn.liveChat, (event) => {
      if (event.event === 'subagent.update') updates.push(event.data as SubagentUpdate);
    });
    try {
      const result = await turn.completion;
      assert.equal(result.error, undefined);
      assert.equal(result.content, `Child result: ${childAnswer}`);
    } finally {
      unsubscribe();
    }
    const children = await listChildSessions(parent.id);
    assert.equal(children.length, 1);
    const child = await readSession(children[0].id);
    assert.equal(child?.agentId, 'subagent-general');
    assert.equal(child?.subagentStatus, 'done');
    assert.equal(child?.messages.at(-1)?.content, childAnswer);
    assert.equal(updates[0]?.sessionId, child?.id);
    assert.equal(updates[0]?.activity, 'Thinking');
    assert.ok(updates.some((update) => update.activity === 'Writing a response'));
    assert.equal(updates.at(-1)?.status, 'done');
    assert.equal(updates.at(-1)?.activity, 'Complete');
    assert.deepEqual((await listSessions()).map((session) => session.id), [parent.id]);
    assert.equal(requests.length, 3);
    const task = 'Summarize the benefits of task delegation in two sentences.';
    assert.equal(child?.origin?.by, 'agent');
    assert.ok(requests[1].messages?.some((message) => message.role === 'user' && message.content === task));
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
