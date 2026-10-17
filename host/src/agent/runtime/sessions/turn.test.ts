import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sessionRoutes } from '../../../http/routes/sessions.ts';
import { updateProvider } from '../../../stores/provider-store.ts';
import { writeSettings } from '../../../stores/settings-store.ts';
import { createSession, createSubagentSession, listSessions, readSession, saveSession } from '../../../stores/sessions.ts';
import { HOST_SUMMARY_PREFIX } from '../../../domain/summary.ts';
import type { StoredSession } from '../../../../../shared/types.ts';
import { abortChat, acquireAgentTurn, dropAgent } from '../agents/pool.ts';
import { getLiveChat } from '../events/live-chat.ts';
import { startSessionTurn } from './turn.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** A real local provider: first round calls a builtin, second round can pause or fail. */
async function fixture(failAfterTool = false) {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-session-turn-'));
  const reachedSecondRound = deferred();
  const release = deferred();
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    const parsed = JSON.parse(body) as {
      messages: Array<{ role: string }>;
      tools?: Array<{ function?: { name?: string } }>;
    };
    if (!parsed.tools?.length) {
      send(response, { role: 'assistant', content: 'The earlier task and its decisions were preserved.' }, 'stop');
      return;
    }
    if (parsed.messages.some((message) => message.role === 'tool')) {
      reachedSecondRound.resolve();
      await release.promise;
      if (failAfterTool) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Mock provider failed after file read' } }));
      } else send(response, { role: 'assistant', content: 'The file contains turn-test-evidence.' }, 'stop');
      return;
    }
    const readFile = parsed.tools?.find((tool) => tool.function?.name?.endsWith('__read_file'))?.function?.name;
    // The local provider limits large root catalogs. list_rules is exposed there;
    // the child's exact grant exposes read_file and exercises a real file read.
    const name = readFile ?? parsed.tools?.find((tool) => tool.function?.name?.endsWith('__list_rules'))?.function?.name;
    if (!name) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: `Expected read_file in the real tool catalog: ${JSON.stringify(parsed.tools?.map((tool) => tool.function?.name))}` } }));
      return;
    }
    send(response, { role: 'assistant', tool_calls: [{
      index: 0, id: 'read-evidence', type: 'function',
      function: { name, arguments: JSON.stringify(readFile ? { path: 'evidence.txt', startLine: 1, endLine: 1 } : {}) },
    }] }, 'tool_calls');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.APPDATA = directory;
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const host = `http://127.0.0.1:${address.port}`;
  await writeFile(path.join(directory, 'evidence.txt'), 'turn-test-evidence\n', 'utf8');
  await writeSettings({ workspaceRoot: directory, fullFileAccess: false, autocompleteProfile: null });
  await updateProvider('llamacpp', { enabled: true, host, model: 'turn-mock' });
  const parent = await createSession({ provider: 'llamacpp', model: 'turn-mock', host }, undefined, undefined, 'coder', 'coder-agent');
  return {
    parent, reachedSecondRound, release,
    child: () => createSubagentSession({ parentId: parent.id, agentId: 'subagent-coder', task: 'Read evidence.txt and report its first line.', toolGrant: ['mcp_xeck__read_file'] }),
    async dispose() {
      dropAgent(parent.id);
      release.resolve();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousAppData === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = previousAppData;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function send(response: http.ServerResponse, delta: Record<string, unknown>, finishReason: string) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end([
    'data: ' + JSON.stringify({ id: 'turn-mock', choices: [{ index: 0, delta }] }),
    'data: ' + JSON.stringify({ id: 'turn-mock', choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }),
    'data: [DONE]', '',
  ].join('\n\n'));
}

function assertPersistedTool(session: StoredSession, fileRead = true) {
  const call = session.libraryMessages.find((message) => message.role === 'assistant' && message.tool_calls);
  assert.ok(call, 'model tool call is saved for replay');
  assert.match(JSON.stringify(call.tool_calls), fileRead ? /evidence\.txt/ : /list_rules/);
  const result = session.libraryMessages.find((message) => message.role === 'tool');
  assert.ok(result, 'real tool result is saved for replay');
  if (fileRead) assert.match(result.content, /turn-test-evidence/);
  assert.equal(result.tool_call_id, 'read-evidence');
  assert.ok(session.messages.some((message) => message.blocks?.some((block) => block.kind === 'tool' && block.callId === 'read-evidence' && !block.pending)));
  assert.ok((session.usage?.totalTokens ?? 0) >= 10, 'completed provider round usage survives');
}

test('retired General sessions remain readable but cannot silently run as another agent', async () => {
  const f = await fixture();
  try {
    f.parent.agentId = 'general';
    f.parent.workspace = 'general@2';
    await saveSession(f.parent);
    assert.equal((await sessionRoutes.request(`/api/sessions/${f.parent.id}`)).status, 200);
    const response = await sessionRoutes.request(`/api/sessions/${f.parent.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Continue' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { error: string }).error, /unavailable agent/);
    assert.equal(abortChat(f.parent.id), false);
    assert.equal((await readSession(f.parent.id))?.messages.length, 0);
    const create = await sessionRoutes.request('/api/sessions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: 'general' }),
    });
    assert.equal(create.status, 400);
  } finally { await f.dispose(); }
});

test('a child exposes live tool replay and the standard session transcript', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const child = await f.child();
    const turn = await startSessionTurn(child, child.origin?.by === 'agent' ? child.origin.task : '');
    await f.reachedSecondRound.promise;
    assert.equal(getLiveChat(child.id), turn.liveChat);
    const get = await sessionRoutes.request(`/api/sessions/${child.id}`);
    assert.equal(get.status, 200);
    const running = await get.json() as StoredSession;
    assert.equal(running.origin?.by, 'agent');
    assert.equal(running.subagentStatus, 'running');

    const stream = await sessionRoutes.request(`/api/sessions/${child.id}/stream`);
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let replay = '';
    while (!replay.includes('event: tool.call.result')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      replay += decoder.decode(chunk.value);
    }
    assert.match(replay, /event: tool.call.start/);
    assert.match(replay, /evidence\.txt/);
    assert.match(replay, /turn-test-evidence/);
    f.release.resolve();
    const outcome = await turn.completion;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      replay += decoder.decode(chunk.value);
    }
    assert.match(replay, /event: done/);
    assert.equal(outcome.session.subagentStatus, 'done');
    const saved = await readSession(child.id);
    assert.ok(saved);
    assertPersistedTool(saved);
    assert.equal(saved.messages.at(-1)?.content, 'The file contains turn-test-evidence.');
    assert.deepEqual((await listSessions()).map((session) => session.id), [f.parent.id]);
    assert.equal(getLiveChat(child.id), null);
    assert.equal(abortChat(child.id), false);

    for (const [method, suffix, payload] of [
      ['POST', '/messages', { content: 'Continue this child directly' }],
      ['PATCH', '', { profile: f.parent.profile }],
      ['PUT', '/policy', { policyId: 'coder-ask' }],
    ] as const) {
      const response = await sessionRoutes.request(`/api/sessions/${child.id}${suffix}`, {
        method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      assert.equal(response.status, 403, `${method} ${suffix} preserves the read-only child`);
    }
  } finally { await f.dispose(); }
});

test('root and child preparation respect early cancellation and emit the same terminal event', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const preparing = startSessionTurn(f.parent, 'A cancelled root task');
    await assert.rejects(startSessionTurn(f.parent, 'A concurrent task'), /Chat already running/);
    assert.equal(abortChat(f.parent.id), true);
    const root = await preparing;
    const rootResult = await root.completion;
    assert.equal(rootResult.aborted, true);
    assert.equal(rootResult.error, undefined);
    assert.ok(root.liveChat.events.some((event) => event.event === 'done'));
    assert.ok(!root.liveChat.events.some((event) => event.event === 'error' || event.event === 'tool.call.start'));
    assert.equal(abortChat(f.parent.id), false);

    const parent = new AbortController();
    parent.abort();
    const child = await f.child();
    const delegated = await startSessionTurn(child, 'A cancelled delegated task', parent.signal);
    const childResult = await delegated.completion;
    assert.equal(childResult.aborted, true);
    assert.equal(childResult.error, undefined);
    assert.equal(childResult.session.subagentStatus, 'cancelled');
    assert.ok(delegated.liveChat.events.some((event) => event.event === 'done'));
    assert.equal(abortChat(child.id), false);
  } finally { await f.dispose(); }
});

test('the root /summary command compacts replay history through the shared turn lifecycle', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    f.parent.libraryMessages = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant', content: `Earlier turn ${index}: retain this decision.`,
    }));
    await saveSession(f.parent);
    const response = await sessionRoutes.request(`/api/sessions/${f.parent.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '/summary' }),
    });
    assert.equal(response.status, 200);
    const events = await response.text();
    assert.match(events, /"phase":"summarized"/);
    assert.match(events, /event: done/);
    assert.doesNotMatch(events, /event: error/);
    const saved = await readSession(f.parent.id);
    assert.ok(saved);
    assert.ok(saved.libraryMessages.length < 8);
    assert.ok(saved.libraryMessages.some((message) => message.content.startsWith(HOST_SUMMARY_PREFIX) && message.content.includes('earlier task')));
    assert.equal(saved.messages.length, 0, 'summary does not add a user or assistant transcript message');
    assert.equal(getLiveChat(f.parent.id), null);
    assert.equal(abortChat(f.parent.id), false);
  } finally { await f.dispose(); }
});

test('root and child turns preserve tools and billed usage after a provider failure', { timeout: 30_000 }, async (t) => {
  for (const child of [false, true]) await t.test(child ? 'child session' : 'root session', async () => {
    const f = await fixture(true);
    try {
      const session = child ? await f.child() : f.parent;
      const turn = await startSessionTurn(session, 'Read evidence.txt and report its first line.');
      await Promise.race([f.reachedSecondRound.promise, turn.completion.then((result) => {
        throw new Error(`Turn ended before its tool result: ${result.error ?? result.content}`);
      })]);
      f.release.resolve();
      const result = await turn.completion;
      assert.match(result.error ?? '', /Mock provider failed after file read/);
      const saved = await readSession(session.id);
      assert.ok(saved);
      assertPersistedTool(saved, child);
      if (child) assert.equal(saved.subagentStatus, 'failed');
      assert.ok(turn.liveChat.events.some((event) => event.event === 'error'));
      assert.equal(getLiveChat(session.id), null);
      assert.equal(abortChat(session.id), false);
    } finally { await f.dispose(); }
  });
});

test('parent cancellation stops a child and HTTP input/conflict errors do not leak controllers', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const child = await f.child();
    const parent = new AbortController();
    const turn = await startSessionTurn(child, 'Read evidence.txt and report its first line.', parent.signal);
    await f.reachedSecondRound.promise;
    parent.abort();
    const cancelled = await turn.completion;
    assert.equal(cancelled.aborted, true);
    assert.equal(cancelled.session.subagentStatus, 'cancelled');
    assertPersistedTool(cancelled.session);
    assert.equal(getLiveChat(child.id), null);
    assert.equal(abortChat(child.id), false);

    const post = (content: string) => sessionRoutes.request(`/api/sessions/${f.parent.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }),
    });
    assert.equal((await post('')).status, 400);
    assert.equal(abortChat(f.parent.id), false);
    const active = acquireAgentTurn(f.parent.id);
    try {
      assert.equal((await post('A competing turn')).status, 409);
      assert.equal(active.signal.aborted, false);
    } finally { active.release(); }
    const replacement = acquireAgentTurn(f.parent.id);
    assert.equal(replacement.signal.aborted, false);
    replacement.release();
    assert.equal(abortChat(f.parent.id), false);
  } finally { await f.dispose(); }
});
