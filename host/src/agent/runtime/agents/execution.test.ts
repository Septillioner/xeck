import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSession } from '../../../stores/sessions.ts';
import { updateProvider } from '../../../stores/provider-store.ts';
import { writeSettings } from '../../../stores/settings-store.ts';
import { startSessionTurn } from '../sessions/turn.ts';
import { dropAgent } from './pool.ts';

test('unsupported tools retry once, stay disabled on later turns and preserve a retry failure', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-tool-fallback-'));
  const requests: boolean[] = [];
  const sessionIds: string[] = [];
  let failTextRequest = false;
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    const parsed = JSON.parse(body) as { tools?: unknown[] };
    const hasTools = Boolean(parsed.tools?.length);
    requests.push(hasTools);
    if (hasTools || failTextRequest) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: hasTools ? 'model does not support tools' : 'Text provider failed' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end([
      'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: 'Text answer' } }] }),
      'data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }),
      'data: [DONE]', '',
    ].join('\n\n'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.APPDATA = directory;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const profile = { provider: 'llamacpp' as const, model: 'fallback', host: `http://127.0.0.1:${address.port}` };
    await updateProvider('llamacpp', { enabled: true, host: profile.host, model: profile.model });
    await writeSettings({ autocompleteProfile: null });
    const session = await createSession(profile);
    sessionIds.push(session.id);
    const first = await (await startSessionTurn(session, 'First request')).completion;
    assert.equal(first.error, undefined);
    assert.equal(first.content, 'Text answer');
    assert.deepEqual(requests, [true, false]);
    const second = await (await startSessionTurn(first.session, 'Next request')).completion;
    assert.equal(second.error, undefined);
    assert.deepEqual(requests, [true, false, false]);
    const otherModel = await createSession({ ...profile, model: 'fallback-failure' });
    sessionIds.push(otherModel.id);
    failTextRequest = true;
    const failed = await (await startSessionTurn(otherModel, 'A failing retry')).completion;
    assert.match(failed.error ?? '', /Text provider failed/);
    assert.deepEqual(requests, [true, false, false, true, false]);
  } finally {
    sessionIds.forEach(dropAgent);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});
