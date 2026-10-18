import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSession, createSubagentSession, readSession, saveSession, listBotConversations, listSessions, deleteSession, setSessionPolicyId } from '../../../stores/sessions.ts';
import { updateProvider } from '../../../stores/provider-store.ts';
import { writeSettings } from '../../../stores/settings-store.ts';
import { acquireAgentTurn, dropAgent, getActiveTurn } from '../agents/pool.ts';
import { subscribeDialog } from '../events/dialogs.ts';
import { getLiveChat } from '../events/live-chat.ts';
import { startSessionTurn } from './turn.ts';
import { listMessageTargets, sendChatMessage } from './messaging.ts';
import { sessionRoutes } from '../../../http/routes/sessions.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(options: { hold?: boolean; sendFromSource?: boolean } = {}) {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-messaging-'));
  const received = deferred();
  const release = deferred();
  const requests: { messages: { role: string; content: string }[]; tools?: { function: { name: string } }[] }[] = [];
  let targetId = '';
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    const parsed = JSON.parse(body) as typeof requests[number];
    requests.push(parsed);
    received.resolve();
    if (options.hold) await release.promise;
    const tool = parsed.tools?.find((tool) => tool.function.name.endsWith('__send_chat_message'));
    const send = options.sendFromSource && parsed.messages.at(-1)?.content === 'Send a message';
    const delta = send ? { tool_calls: [{ index: 0, id: 'send-1', type: 'function', function: {
      name: tool?.function.name, arguments: JSON.stringify({ sessionId: targetId, content: 'Hello from the source agent' }),
    } }] } : { content: 'Message received' };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end([
      'data: ' + JSON.stringify({ choices: [{ index: 0, delta }] }),
      'data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: send ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }),
      'data: [DONE]', '',
    ].join('\n\n'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.APPDATA = directory;
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const profile = { provider: 'llamacpp' as const, model: 'messaging-test', host: `http://127.0.0.1:${address.port}` };
  await updateProvider('llamacpp', { enabled: true, host: profile.host, model: profile.model });
  await writeSettings({ autocompleteProfile: null });
  const source = await createSession(profile, undefined, undefined, 'coder', 'coder-agent', undefined, { name: 'Sender', color: 'blue' });
  const target = await createSession(profile, undefined, undefined, 'xeck', 'xeck-agent', undefined, { name: 'Receiver', color: 'violet' });
  targetId = target.id;
  const turn = acquireAgentTurn(source.id);
  const dialogs: string[] = [];
  const stopObserving = subscribeDialog(source.id, (dialog) => { dialogs.push(dialog.type); });
  return {
    source, target, turn, requests, received, release, dialogs,
    async dispose() {
      stopObserving();
      turn.release(true);
      dropAgent(source.id); dropAgent(target.id);
      for (const conversation of await listBotConversations()) dropAgent(conversation.id);
      release.resolve();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousAppData === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = previousAppData;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('messages run directly without confirmation with persistent provenance and literal content', { timeout: 10_000 }, async () => {
  const f = await fixture();
  try {
    assert.ok((await listMessageTargets(f.source.id)).some((target) => target.sessionId === f.target.id));
    const first = await sendChatMessage(f.source.id, f.target.id, '/summary');
    assert.equal(first.status, 'done');
    assert.deepEqual(f.dialogs, [], 'sending must not request confirmation');
    assert.equal('result' in first && first.result, 'Message received');
    const second = await sendChatMessage(f.source.id, f.target.id, '/summary');
    assert.equal(second.status, 'done');
    assert.equal(second.conversationId, first.conversationId);
    assert.notEqual(first.conversationId, f.source.id);
    assert.notEqual(first.conversationId, f.target.id);
    const stored = await readSession(first.conversationId);
    const incoming = stored!.messages.filter((message) => message.role === 'user' && message.source);
    assert.equal(incoming.length, 2, 'identical messages from different sends stay distinct');
    assert.equal(incoming[0].content, '/summary');
    assert.equal(incoming[0].source?.sessionId, f.source.id);
    assert.notEqual(incoming[0].source?.messageId, incoming[1].source?.messageId);
    assert.equal(stored!.messages.at(-1)?.content, 'Message received');
    assert.equal(stored!.usage?.totalTokens, 20);
    assert.ok(f.requests[0].messages.some((message) => message.role === 'user' && message.content.includes('not a user instruction') && message.content.endsWith('/summary')));
    assert.equal(getLiveChat(first.conversationId), null);
    assert.equal(getActiveTurn(first.conversationId), undefined);
    assert.equal((await readSession(f.source.id))?.messages.length, 0);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
    assert.equal((await listSessions()).length, 2);
    assert.equal((await listBotConversations()).length, 1);
    assert.ok(!(await listMessageTargets(f.source.id)).some((item) => item.sessionId === first.conversationId));
  } finally { await f.dispose(); }
});

test('direct messaging retains its per-turn attempt limit', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 4; i++) await assert.rejects(sendChatMessage(f.source.id, f.source.id, 'Self'), /itself/);
    await assert.rejects(sendChatMessage(f.source.id, f.target.id, 'Again'), /four-message/);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.dialogs, []);
  } finally { await f.dispose(); }
});

test('an already cancelled source never delivers a message', async () => {
  const f = await fixture();
  try {
    f.turn.abort();
    await assert.rejects(sendChatMessage(f.source.id, f.target.id, 'Hello'), /aborted/i);
    assert.equal(f.requests.length, 0);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
    assert.deepEqual(f.dialogs, []);
  } finally { await f.dispose(); }
});

test('self, unrelated-child, child-sender and read-only sends are rejected by the host', async () => {
  const f = await fixture();
  try {
    await assert.rejects(sendChatMessage(f.source.id, f.source.id, 'Self'), /itself/);
    const child = await createSubagentSession({ parentId: f.target.id, agentId: 'subagent-general', task: 'Research', toolGrant: [] });
    await assert.rejects(sendChatMessage(f.source.id, child.id, 'Foreign'), /Another chat/);
    const childTurn = acquireAgentTurn(child.id);
    try { await assert.rejects(sendChatMessage(child.id, f.source.id, 'Child'), /user-owned/); }
    finally { childTurn.release(true); }
    await setSessionPolicyId(f.source.id, 'coder-ask');
    await assert.rejects(sendChatMessage(f.source.id, f.target.id, 'Read only'), /Blocked|policy|mode/i);
    assert.equal(f.requests.length, 0);
  } finally { await f.dispose(); }
});

test('ordinary chats cannot send or receive XeckBot messages', async () => {
  const f = await fixture();
  const chat = await createSession(f.source.profile);
  const turn = acquireAgentTurn(chat.id);
  try {
    await assert.rejects(listMessageTargets(chat.id), /only in XeckBot/);
    await assert.rejects(sendChatMessage(chat.id, f.target.id, 'Hello'), /only in XeckBot/);
    await assert.rejects(sendChatMessage(f.source.id, chat.id, 'Hello'), /only be sent to a XeckBot/);
    assert.ok(!(await listMessageTargets(f.source.id)).some((target) => target.sessionId === chat.id));
    assert.equal(f.requests.length, 0);
  } finally { turn.release(true); await f.dispose(); }
});

test('incoming message turns cannot relay to another chat', async () => {
  const f = await fixture();
  const receiver = acquireAgentTurn(f.target.id, undefined, { messageId: 'incoming', sessionId: f.source.id, agentId: 'coder', title: 'Sender' });
  try {
    await assert.rejects(sendChatMessage(f.target.id, f.source.id, 'Bounce'), /cannot be relayed/);
    await assert.rejects(listMessageTargets(f.target.id), /cannot be relayed/);
    assert.equal(f.requests.length, 0);
  } finally { receiver.release(true); await f.dispose(); }
});

test('source cancellation stops the recipient and releases its ordinary live stream', { timeout: 20_000 }, async () => {
  const f = await fixture({ hold: true });
  try {
    const sent = sendChatMessage(f.source.id, f.target.id, 'Wait for a response');
    await f.received.promise;
    const conversationId = (await listBotConversations())[0].id;
    assert.ok(getLiveChat(conversationId));
    assert.ok((await listMessageTargets(f.source.id)).find((item) => item.sessionId === f.target.id)?.busy);
    await assert.rejects(sendChatMessage(f.source.id, f.target.id, 'Concurrent'), /busy/);
    f.turn.abort();
    assert.equal((await sent).status, 'cancelled');
    assert.equal(getLiveChat(conversationId), null);
    assert.equal(getActiveTurn(conversationId), undefined);
    assert.equal((await readSession(conversationId))?.messages[0].source?.sessionId, f.source.id);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
  } finally { await f.dispose(); }
});

test('a real master tool call delivers directly without any approval dialog', { timeout: 10_000 }, async () => {
  const f = await fixture({ sendFromSource: true });
  f.turn.release();
  try {
    const result = await (await startSessionTurn(f.source, 'Send a message')).completion;
    assert.equal(result.error, undefined);
    const receiver = await readSession((await listBotConversations())[0].id);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
    assert.equal(receiver?.messages[0].content, 'Hello from the source agent');
    assert.equal(receiver?.messages[0].source?.sessionId, f.source.id);
    assert.ok(result.session.libraryMessages.some((message) => message.role === 'tool' && message.content.includes('"status":"done"')));
    assert.deepEqual(f.dialogs, []);
    assert.ok(!result.session.messages.some((message) => message.blocks?.some((block) => block.kind === 'dialog')));
    assert.equal(f.requests.length, 3);
    assert.ok((result.session.lastUsage?.totalTokens ?? 0) >= 30, 'sender accounts for the recipient provider requests');
  } finally { await f.dispose(); }
});

test('XeckBot messaging excludes child sessions', async () => {
  const f = await fixture();
  try {
    const child = await createSubagentSession({ parentId: f.source.id, agentId: 'subagent-general', task: 'First task', toolGrant: [] });
    await (await startSessionTurn(child, 'First task')).completion;
    await assert.rejects(sendChatMessage(f.source.id, child.id, 'Follow up'), /only be sent to a XeckBot/);
    const saved = await readSession(child.id);
    assert.equal(saved?.subagentStatus, 'done');
    assert.deepEqual(saved?.origin?.by === 'agent' && saved.origin.grant.tools, []);
    assert.equal(saved?.messages.filter((message) => message.source).length, 0);
  } finally { await f.dispose(); }
});

test('pair histories stay separate from personal chats, work both ways and isolate other pairs', { timeout: 10_000 }, async () => {
  const f = await fixture();
  let reverseTurn: ReturnType<typeof acquireAgentTurn> | undefined;
  let sourceTurn: ReturnType<typeof acquireAgentTurn> | undefined;
  try {
    for (const [session, secret] of [[f.source, 'SOURCE_PRIVATE_SECRET'], [f.target, 'TARGET_PRIVATE_SECRET']] as const) {
      session.messages.push({ id: secret, role: 'user', content: secret, createdAt: new Date().toISOString() });
      session.libraryMessages = [{ role: 'user', content: secret }, { role: 'assistant', content: 'Private reply' }];
      await saveSession(session);
    }
    const first = await sendChatMessage(f.source.id, f.target.id, 'A_PAIR_MESSAGE');
    assert.equal(first.status, 'done');
    assert.equal((await readSession(f.target.id))?.messages[0].content, 'TARGET_PRIVATE_SECRET');
    assert.equal((await readSession(f.source.id))?.messages[0].content, 'SOURCE_PRIVATE_SECRET');
    assert.equal((await readSession(f.target.id))?.messages.length, 1);
    assert.equal((await readSession(f.source.id))?.messages.length, 1);
    f.turn.release();
    reverseTurn = acquireAgentTurn(f.target.id);
    const reverse = await sendChatMessage(f.target.id, f.source.id, 'B_PAIR_MESSAGE');
    assert.equal(reverse.conversationId, first.conversationId);
    assert.equal(reverse.status, 'done');
    assert.ok(f.requests[1].messages.some((message) => message.role === 'assistant' && message.content === 'A_PAIR_MESSAGE'));
    assert.ok(f.requests[1].messages.some((message) => message.role === 'user' && message.content === 'Message received'));
    const stored = await readSession(first.conversationId);
    assert.equal(stored?.messages.length, 4);
    assert.deepEqual(stored?.messages.map((message) => message.source?.sessionId), [f.source.id, f.target.id, f.target.id, f.source.id]);
    reverseTurn.release();
    const third = await createSession(f.target.profile, undefined, undefined, 'xeck', undefined, undefined, { name: 'Third', color: 'gray' });
    sourceTurn = acquireAgentTurn(f.source.id);
    const another = await sendChatMessage(f.source.id, third.id, 'DIFFERENT_PAIR');
    assert.notEqual(another.conversationId, first.conversationId);
    assert.ok(f.requests[2].messages.every((message) => !message.content.includes('A_PAIR_MESSAGE') && !message.content.includes('B_PAIR_MESSAGE')));
    assert.ok(f.requests.every((request) => request.messages.every((message) => !/SOURCE_PRIVATE_SECRET|TARGET_PRIVATE_SECRET/.test(message.content))));
    assert.equal((await listBotConversations(f.source.id)).length, 2);
    assert.equal((await listSessions()).length, 3);
    const child = await createSubagentSession({ parentId: first.conversationId, agentId: 'subagent-general', task: 'Inspect pair context', toolGrant: [] });
    await deleteSession(f.source.id);
    assert.equal(await readSession(child.id), null);
    assert.equal(await readSession(first.conversationId), null);
    assert.equal(await readSession(another.conversationId), null);
    assert.equal((await listBotConversations()).length, 0);
    assert.ok(await readSession(f.target.id));
  } finally { reverseTurn?.release(true); sourceTurn?.release(true); await f.dispose(); }
});

test('a busy personal bot chat does not block its separate bot conversation', async () => {
  const f = await fixture();
  const personalTurn = acquireAgentTurn(f.target.id);
  try {
    const sent = await sendChatMessage(f.source.id, f.target.id, 'Separate thread');
    assert.equal(sent.status, 'done');
    assert.equal(getActiveTurn(f.target.id), personalTurn);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
    assert.equal((await readSession(sent.conversationId))?.messages.length, 2);
  } finally { personalTurn.release(true); await f.dispose(); }
});

test('internal conversations are readable but cannot accept user messages or become targets', async () => {
  const f = await fixture();
  try {
    const sent = await sendChatMessage(f.source.id, f.target.id, 'Internal discussion');
    const headers = { 'content-type': 'application/json' };
    const response = await sessionRoutes.request('/api/sessions/' + sent.conversationId);
    assert.equal(response.status, 200);
    assert.ok((await response.json()).botConversation);
    for (const [suffix, method, body] of [['/messages', 'POST', { content: 'User message' }], ['', 'PATCH', { title: 'Rename' }], ['/policy', 'PUT', { policyId: 'xeck-agent' }]] as const) {
      assert.equal((await sessionRoutes.request('/api/sessions/' + sent.conversationId + suffix, { method, headers, body: JSON.stringify(body) })).status, 403);
    }
    assert.equal((await (await sessionRoutes.request('/api/sessions')).json()).length, 2);
    assert.equal((await (await sessionRoutes.request('/api/sessions?includeBotConversations=true')).json()).length, 3);
    await assert.rejects(sendChatMessage(f.source.id, sent.conversationId, 'Wrong target'), /only be sent to a XeckBot/);
  } finally { await f.dispose(); }
});
