import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSession, listSessions, readSession, setSessionPolicyId } from '../../../stores/sessions.ts';
import { updateProvider } from '../../../stores/provider-store.ts';
import { writeSettings } from '../../../stores/settings-store.ts';
import { acquireAgentTurn } from './pool.ts';
import { createXeckBot } from './create-xeckbot.ts';
import { BOT_TOOLS } from '../../tools/builtin/bots.ts';
import { closeLiveChat, startLiveChat } from '../events/live-chat.ts';

test('XeckBots create persistent peers using generated identities and respect policy and cancellation', async () => {
  const previous = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-bot-create-'));
  let requests = 0;
  const server = http.createServer(async (request, response) => {
    for await (const _ of request) { /* consume request */ }
    requests++;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: 'You are a research assistant.' } }] }) + '\n\ndata: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.APPDATA = directory;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const profile = { provider: 'llamacpp' as const, model: 'bot-create-test', host: `http://127.0.0.1:${address.port}` };
    await updateProvider('llamacpp', { enabled: true, host: profile.host, model: profile.model });
    await writeSettings({ defaultProfile: profile, autocompleteProfile: null });
    const source = await createSession(profile, undefined, undefined, undefined, undefined, undefined, { name: 'Creator', color: 'blue' });
    const draft = { name: 'Researcher', purpose: 'Research questions', color: 'violet' as const };
    await assert.rejects(createXeckBot(source.id, draft), /active personal/);
    const turn = acquireAgentTurn(source.id);
    const live = startLiveChat(source.id);
    try {
      const result = await createXeckBot(source.id, draft);
      const stored = await readSession(result.sessionId);
      assert.equal(stored?.title, draft.name);
      assert.equal(stored?.bot?.systemPrompt, 'You are a research assistant.');
      assert.equal(stored?.bot?.purpose, draft.purpose);
      assert.equal(stored?.origin?.by, 'user');
      assert.equal(stored?.messages.length, 0);
      assert.ok((await listSessions()).some((session) => session.id === result.sessionId));
      assert.deepEqual(live.events.map((event) => event.event), ['session.created']);
      assert.deepEqual(live.events[0].data, { session: stored });
      await setSessionPolicyId(source.id, 'xeckbot-ask');
      await assert.rejects(createXeckBot(source.id, draft), /policy/);
      await setSessionPolicyId(source.id, 'xeckbot-agent');
      const cancelled = new AbortController();
      cancelled.abort();
      await assert.rejects(createXeckBot(source.id, draft, cancelled.signal), /abort/i);
      assert.equal(requests, 1);
      const tool = BOT_TOOLS[0];
      assert.ok('execute' in tool);
      const invalid = await tool.execute({ name: '', purpose: '' }, { sessionId: source.id });
      assert.equal(invalid.isError, true);
      assert.equal((await listSessions()).length, 2);
      const xeck = await createSession(profile, undefined, undefined, 'xeck');
      const xeckTurn = acquireAgentTurn(xeck.id);
      try {
        const peer = await createXeckBot(xeck.id, { ...draft, name: 'Backend' });
        assert.equal((await readSession(peer.sessionId))?.title, 'Backend');
        assert.equal(requests, 2);
      } finally { xeckTurn.release(true); }
      assert.equal(live.events.length, 1);
    } finally { closeLiveChat(live); turn.release(true); }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previous === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
