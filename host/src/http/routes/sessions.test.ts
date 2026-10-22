import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sessionRoutes } from './sessions.ts';
import { createProject } from '../../stores/projects.ts';
import { readSession, listSessions, patchSession } from '../../stores/sessions.ts';
import { writeSettings } from '../../stores/settings-store.ts';
import { updateProvider } from '../../stores/provider-store.ts';
import { startSessionTurn } from '../../agent/runtime/sessions/turn.ts';
import { dropAgent } from '../../agent/runtime/agents/pool.ts';
import { buildHostSystemPrompt } from '../../agent/catalog/prompts/host-system-prompt.ts';
import { XECKBOT_CREATOR_PROMPT } from '../../agent/catalog/prompts/xeckbot-creator.ts';
import { XECKBOT_AGENT } from '../../agent/catalog/agents.ts';
import { XECKBOT_WORKSPACE } from '../../agent/catalog/workspaces.ts';
import type { StoredSession, SessionSummary } from '../../../../shared/types.ts';

test('XeckBot creation generates and persists an identity using the default model, then applies it to chat', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-bot-api-'));
  const requests: { model: string; messages: { role: string; content: string }[]; tools?: unknown[] }[] = [];
  const identity = 'You are Atlas, an English conversation coach. Ask practice questions and explain language mistakes.';
  let mode: 'identity' | 'reply' | 'empty' | 'error' = 'identity';
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    requests.push(JSON.parse(body));
    if (mode === 'error') { response.writeHead(500); response.end('Model unavailable'); return; }
    const content = mode === 'identity' ? identity : mode === 'empty' ? '' : 'Let us practice English.';
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end([
      'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content } }] }),
      'data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
      'data: [DONE]', '',
    ].join('\n\n'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  process.env.APPDATA = directory;
  const post = (body: unknown) => sessionRoutes.request('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let botId: string | undefined;
  try {
    for (const bot of [null, {}, { name: ' ', color: 'blue' }, { name: 'x'.repeat(81), color: 'blue' }, { name: 'Bot', color: 'invalid' }, { name: 'Bot', color: 'blue' }, { name: 'Bot', color: 'blue', purpose: ' ' }, { name: 'Bot', color: 'blue', purpose: 'x'.repeat(4001) }]) {
      assert.equal((await post({ bot })).status, 400);
    }
    const input = { name: '  Atlas  ', color: 'blue', purpose: 'Help me practice English.' };
    await writeSettings({ defaultProfile: null, autocompleteProfile: null });
    assert.equal((await post({ bot: input })).status, 409);
    assert.equal((await listSessions()).length, 0);
    assert.equal(requests.length, 0);
    const profile = { provider: 'llamacpp' as const, model: 'identity-default', host: 'http://127.0.0.1:' + address.port };
    await updateProvider('llamacpp', { enabled: true, host: profile.host, model: profile.model });
    await writeSettings({ defaultProfile: profile, autocompleteProfile: null });
    const response = await post({ bot: input });
    assert.equal(response.status, 201);
    const bot = await response.json() as StoredSession;
    botId = bot.id;
    assert.equal(bot.agentId, XECKBOT_AGENT.id);
    assert.equal(bot.workspace, `${XECKBOT_WORKSPACE.id}@${XECKBOT_WORKSPACE.version}`);
    assert.equal(bot.policyId, XECKBOT_WORKSPACE.defaultPolicy);
    assert.equal((await post({ agentId: XECKBOT_AGENT.id })).status, 400);
    assert.equal(bot.title, 'Atlas');
    assert.equal(bot.titleSource, 'user');
    assert.deepEqual(bot.bot, { color: 'blue', purpose: input.purpose, systemPrompt: identity });
    assert.deepEqual((await readSession(bot.id))?.bot, bot.bot);
    assert.equal(requests[0].model, 'identity-default');
    assert.ok(requests[0].messages.some((message) => message.role === 'system' && message.content.includes(XECKBOT_CREATOR_PROMPT)));
    assert.deepEqual(JSON.parse(requests[0].messages.find((message) => message.role === 'user')!.content), { name: 'Atlas', purpose: input.purpose });
    assert.ok(!requests[0].tools?.length, 'identity generation has no tools');
    const sessions = await (await sessionRoutes.request('/api/sessions')).json() as SessionSummary[];
    assert.deepEqual(sessions.find((session) => session.id === bot.id)?.bot, { color: 'blue', purpose: input.purpose }, 'summaries expose profile metadata but exclude the full prompt');
    const badgeResponse = await sessionRoutes.request('/api/sessions/' + bot.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ botBadges: ['English', 'Conversation coach'] }) });
    assert.equal(badgeResponse.status, 200);
    assert.deepEqual((await readSession(bot.id))?.bot?.badges, ['English', 'Conversation coach']);
    const revisedPrompt = `${identity}\n\nFocus on short speaking exercises.`;
    const instructionResponse = await sessionRoutes.request('/api/sessions/' + bot.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ botSystemPrompt: revisedPrompt }) });
    assert.equal(instructionResponse.status, 200);
    assert.equal((await readSession(bot.id))?.bot?.systemPrompt, revisedPrompt);
    mode = 'reply';
    await writeSettings({ defaultProfile: null });
    const updatedBot = await readSession(bot.id);
    assert.ok(updatedBot);
    const turn = await (await startSessionTurn(updatedBot, 'Start practicing')).completion;
    assert.equal(turn.error, undefined);
    assert.equal(requests.length, 2, 'opening a bot does not regenerate its identity or generate a chat title');
    const system = requests[1].messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
    assert.ok(system.includes(revisedPrompt));
    assert.ok(!system.includes('You are the Xeck assistant.'));
    assert.ok(!system.includes('You are Xeck, a general-purpose assistant'));
    await patchSession(bot.id, { title: 'Nova' });
    const renamed = await readSession(bot.id);
    const renamedPrompt = await buildHostSystemPrompt(bot.agentId, { name: renamed!.title, systemPrompt: renamed!.bot!.systemPrompt });
    assert.ok(renamedPrompt.includes('Your current name is "Nova"'));
    await writeSettings({ defaultProfile: profile });
    for (const failure of ['empty', 'error'] as const) {
      mode = failure;
      assert.equal((await post({ bot: input })).status, 502);
      assert.equal((await listSessions()).length, 1, 'generation failures never leave incomplete bots');
    }
    const project = await createProject('Project');
    assert.equal((await post({ projectId: project.id, bot: input })).status, 400);
    assert.equal((await sessionRoutes.request('/api/sessions/' + bot.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) })).status, 400);
  } finally {
    if (botId) dropAgent(botId);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});
