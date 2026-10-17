import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSession, createSubagentSession, readSession, saveSession, setSessionPolicyId } from '../../../stores/sessions.ts';
import { updateProvider } from '../../../stores/provider-store.ts';
import { writeSettings } from '../../../stores/settings-store.ts';
import { acquireAgentTurn, dropAgent, getActiveTurn } from '../agents/pool.ts';
import { resolveDialog, subscribeDialog } from '../events/dialogs.ts';
import { getLiveChat } from '../events/live-chat.ts';
import { startSessionTurn } from './turn.ts';
import { listMessageTargets, sendChatMessage } from './messaging.ts';

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
  const source = await createSession(profile, undefined, undefined, 'coder', 'coder-agent');
  const target = await createSession(profile, undefined, undefined, 'xeck', 'xeck-agent');
  targetId = target.id;
  const turn = acquireAgentTurn(source.id);
  return {
    source, target, turn, requests, received, release,
    approve: (approved = true) => subscribeDialog(source.id, (dialog) => {
      assert.equal(dialog.type, 'approval');
      queueMicrotask(() => resolveDialog(dialog.id, { approved }, source.id));
    }),
    async dispose() {
      turn.release(true);
      dropAgent(source.id); dropAgent(target.id);
      release.resolve();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousAppData === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = previousAppData;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('approved messages run through the recipient session with persistent provenance and literal content', async () => {
  const f = await fixture();
  const unsubscribe = f.approve();
  try {
    assert.ok((await listMessageTargets(f.source.id)).some((target) => target.sessionId === f.target.id));
    const first = await sendChatMessage(f.source.id, f.target.id, '/summary');
    assert.equal(first.status, 'done');
    assert.equal('result' in first && first.result, 'Message received');
    const second = await sendChatMessage(f.source.id, f.target.id, '/summary');
    assert.equal(second.status, 'done');
    const stored = await readSession(f.target.id);
    const incoming = stored!.messages.filter((message) => message.source);
    assert.equal(incoming.length, 2, 'identical messages from different sends stay distinct');
    assert.equal(incoming[0].content, '/summary');
    assert.equal(incoming[0].source?.sessionId, f.source.id);
    assert.notEqual(incoming[0].source?.messageId, incoming[1].source?.messageId);
    assert.equal(stored!.messages.at(-1)?.content, 'Message received');
    assert.equal(stored!.usage?.totalTokens, 20);
    assert.ok(f.requests[0].messages.some((message) => message.role === 'user' && message.content.includes('not a user instruction') && message.content.endsWith('/summary')));
    assert.equal(getLiveChat(f.target.id), null);
    assert.equal(getActiveTurn(f.target.id), undefined);
  } finally { unsubscribe(); await f.dispose(); }
});

test('declined messages never modify or run the target and attempts are bounded', async () => {
  const f = await fixture();
  const unsubscribe = f.approve(false);
  try {
    for (let i = 0; i < 4; i++) assert.equal((await sendChatMessage(f.source.id, f.target.id, 'Hello')).status, 'declined');
    await assert.rejects(sendChatMessage(f.source.id, f.target.id, 'Again'), /four-message/);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
    assert.equal(f.requests.length, 0);
  } finally { unsubscribe(); await f.dispose(); }
});

test('cancellation while waiting for approval never delivers a message', async () => {
  const f = await fixture();
  const waiting = deferred();
  const unsubscribe = subscribeDialog(f.source.id, () => waiting.resolve());
  try {
    const sent = sendChatMessage(f.source.id, f.target.id, 'Wait for approval');
    const rejected = assert.rejects(sent, /Turn was aborted/);
    await waiting.promise;
    f.turn.abort();
    await rejected;
    assert.equal(f.requests.length, 0);
    assert.equal((await readSession(f.target.id))?.messages.length, 0);
  } finally { unsubscribe(); await f.dispose(); }
});

test('self, busy, unrelated-child, child-sender and read-only sends are rejected by the host', async () => {
  const f = await fixture();
  try {
    await assert.rejects(sendChatMessage(f.source.id, f.source.id, 'Self'), /itself/);
    const busy = acquireAgentTurn(f.target.id);
    try { await assert.rejects(sendChatMessage(f.source.id, f.target.id, 'Busy'), /busy/); }
    finally { busy.release(); }
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
  const unsubscribe = f.approve();
  try {
    const sent = sendChatMessage(f.source.id, f.target.id, 'Wait for a response');
    await f.received.promise;
    assert.ok(getLiveChat(f.target.id));
    f.turn.abort();
    assert.equal((await sent).status, 'cancelled');
    assert.equal(getLiveChat(f.target.id), null);
    assert.equal(getActiveTurn(f.target.id), undefined);
    assert.equal((await readSession(f.target.id))?.messages[0].source?.sessionId, f.source.id);
  } finally { unsubscribe(); await f.dispose(); }
});

test('a real master tool call approves and delivers a message using both ordinary turn lifecycles', async () => {
  const f = await fixture({ sendFromSource: true });
  f.turn.release();
  const unsubscribe = f.approve();
  try {
    const result = await (await startSessionTurn(f.source, 'Send a message')).completion;
    assert.equal(result.error, undefined);
    const receiver = await readSession(f.target.id);
    assert.equal(receiver?.messages[0].content, 'Hello from the source agent');
    assert.equal(receiver?.messages[0].source?.sessionId, f.source.id);
    assert.ok(result.session.libraryMessages.some((message) => message.role === 'tool' && message.content.includes('"status":"done"')));
    assert.ok(result.session.messages.some((message) => message.blocks?.some((block) => block.kind === 'dialog' && block.resolved)));
    assert.equal(f.requests.length, 3);
    assert.ok((result.session.lastUsage?.totalTokens ?? 0) >= 30, 'sender accounts for the recipient provider requests');
  } finally { unsubscribe(); await f.dispose(); }
});

test('an owner can follow up on its completed child while retaining the child tool grant', async () => {
  const f = await fixture();
  const unsubscribe = f.approve();
  try {
    const child = await createSubagentSession({ parentId: f.source.id, agentId: 'subagent-general', task: 'First task', toolGrant: [] });
    await (await startSessionTurn(child, 'First task')).completion;
    assert.equal((await sendChatMessage(f.source.id, child.id, 'Follow up')).status, 'done');
    const saved = await readSession(child.id);
    assert.equal(saved?.subagentStatus, 'done');
    assert.deepEqual(saved?.origin?.by === 'agent' && saved.origin.grant.tools, []);
    assert.equal(saved?.messages.filter((message) => message.source).length, 1);
  } finally { unsubscribe(); await f.dispose(); }
});

test('target changes while approval is pending invalidate that approval', async () => {
  const f = await fixture();
  const waiting = deferred();
  let dialogId = '';
  const unsubscribe = subscribeDialog(f.source.id, (dialog) => { dialogId = dialog.id; waiting.resolve(); });
  try {
    const sent = sendChatMessage(f.source.id, f.target.id, 'Review');
    await waiting.promise;
    f.target.title = 'Changed target';
    await saveSession(f.target);
    resolveDialog(dialogId, { approved: true }, f.source.id);
    await assert.rejects(sent, /changed while approval/);
    assert.equal(f.requests.length, 0);
  } finally { unsubscribe(); await f.dispose(); }
});
