import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSession, createSubagentSession, deleteSession, listChildSessions, listSessions, readSession, saveSession, applyUserTurn, setSessionTitle, patchSession } from './sessions.ts';
import { writeSettings } from './settings-store.ts';
import { updateProvider } from './provider-store.ts';
import { policyRejection } from '../agent/tools/policy-context.ts';

test('new sessions persist the selected initial policy', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-session-mode-'));
  process.env.APPDATA = temporaryDirectory;

  try {
    const created = await createSession(null, undefined, undefined, 'coder', 'coder-plan');
    assert.equal(created.policyId, 'coder-plan');

    const restored = await readSession(created.id);
    assert.equal(restored?.policyId, 'coder-plan');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('subagent model inheritance and selected models snapshot a normal session profile', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-subagent-model-'));
  process.env.APPDATA = temporaryDirectory;
  try {
    const parent = await createSession({ provider: 'llamacpp', model: 'parent-model', host: 'http://127.0.0.1:8081' }, 'low', undefined, 'coder');
    const input = { parentId: parent.id, agentId: 'subagent-coder', task: 'Inspect the supplied module and report findings.', toolGrant: [] };
    const inherited = await createSubagentSession(input);
    assert.deepEqual(inherited.profile, parent.profile);
    assert.notEqual(inherited.profile, parent.profile);
    assert.equal(inherited.workspace, 'coding@1');
    assert.equal(inherited.reasoningEffort, 'low');

    await updateProvider('ollama', { enabled: true, model: 'mini-model', host: 'http://127.0.0.1:11435' });
    await writeSettings({ agentProfiles: { 'subagent-coder': { provider: 'ollama', model: 'mini-model', host: '' } } });
    const selected = await createSubagentSession(input);
    assert.deepEqual(selected.profile, { provider: 'ollama', model: 'mini-model', host: 'http://127.0.0.1:11435' });
    assert.equal(selected.workspace, inherited.workspace);
    assert.equal(selected.policyId, inherited.policyId);
    assert.deepEqual(selected.origin?.by === 'agent' ? selected.origin.grant : null,
      inherited.origin?.by === 'agent' ? inherited.origin.grant : null);

    parent.profile.model = 'changed-parent';
    await saveSession(parent);
    await updateProvider('ollama', { model: 'new-mini', host: 'http://127.0.0.1:11436' });
    await writeSettings({ agentProfiles: { 'subagent-coder': null } });
    assert.deepEqual((await readSession(selected.id))?.profile, selected.profile);
    assert.equal((await readSession(inherited.id))?.profile.model, 'parent-model');
    assert.equal((await createSubagentSession(input)).profile.model, 'changed-parent');
    await assert.rejects(createSession(null, undefined, undefined, 'subagent-coder'), /cannot be started by a user/);
    await assert.rejects(createSubagentSession({ ...input, agentId: 'coder' }), /cannot be started by another agent/);

    await writeSettings({ agentProfiles: { 'subagent-coder': { provider: 'ollama', model: 'missing-model', host: '' } } });
    const count = (await listChildSessions(parent.id)).length;
    await assert.rejects(createSubagentSession(input), /Selected model.*unavailable/);
    assert.equal((await listChildSessions(parent.id)).length, count);
    await writeSettings({ agentProfiles: { 'subagent-coder': { provider: 'ollama', model: 'new-mini', host: '' } } });
    await updateProvider('ollama', { enabled: false });
    await assert.rejects(createSubagentSession(input), /Selected model.*unavailable/);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('subagent sessions remain attached to their parent and outside the user chat list', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-subagent-session-'));
  process.env.APPDATA = temporaryDirectory;

  try {
    const parent = await createSession(null, undefined, undefined, 'coder', 'coder-agent');
    const child = await createSubagentSession({
      parentId: parent.id,
      agentId: 'subagent-general',
      task: 'Summarize the findings',
      toolGrant: ['mcp_xeck__read_file'],
    });
    assert.equal(child.origin?.by, 'agent');
    if (child.origin?.by === 'agent') assert.equal(child.origin.parent, parent.id);
    assert.equal(child.workspace, 'general@2');
    assert.deepEqual((await listSessions()).map((session) => session.id), [parent.id]);
    assert.deepEqual((await listChildSessions(parent.id)).map((session) => session.id), [child.id]);
    assert.match(await policyRejection('mcp_xeck__write_file', child.id) ?? '', /did not grant/);
    assert.equal(await deleteSession(parent.id), true);
    assert.equal(await readSession(child.id), null);
    assert.deepEqual(await listChildSessions(parent.id), []);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('startup recovery finalizes interrupted children and repairs parent cards once', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-recovery-'));
  process.env.APPDATA = directory;
  try {
    const { recoverInterruptedSubagents, applyUserTurn } = await import('./sessions.ts');
    const parent = await createSession(null, undefined, undefined, 'coder');
    applyUserTurn(parent, 'Delegate inspection');
    await saveSession(parent);
    const child = await createSubagentSession({ parentId: parent.id, agentId: 'subagent-coder', task: 'Inspect the file', toolGrant: ['mcp_xeck__read_file'] });
    assert.equal((await readSession(child.id))?.subagentStatus, 'running');
    assert.equal(await recoverInterruptedSubagents(), 1);
    const recovered = await readSession(child.id);
    assert.equal(recovered?.subagentStatus, 'failed');
    assert.match(recovered?.subagentError ?? '', /host stopped/);
    assert.match(recovered?.messages.at(-1)?.content ?? '', /host stopped/);
    const card = (await readSession(parent.id))?.messages.at(-1)?.blocks?.find((block) => block.kind === 'subagent');
    assert.equal(card?.kind === 'subagent' ? card.status : undefined, 'failed');
    assert.equal(await recoverInterruptedSubagents(), 0);
    assert.equal((await readSession(child.id))?.messages.length, recovered?.messages.length);
    assert.deepEqual((await listSessions()).map((session) => session.id), [parent.id]);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});


test('XeckBot creation persists its color, fixed name and conversation across reloads', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-bot-session-'));
  process.env.APPDATA = directory;
  try {
    const bot = await createSession(null, undefined, undefined, undefined, undefined, undefined, { name: 'New chat', color: 'violet' });
    assert.deepEqual((await listSessions()).find((item) => item.id === bot.id)?.bot, { color: 'violet' });
    applyUserTurn(bot, 'Keep this conversation');
    await saveSession(bot);
    await setSessionTitle(bot.id, 'Generated title');
    const restored = await readSession(bot.id);
    assert.equal(restored?.title, 'New chat');
    assert.equal(restored?.messages[0].content, 'Keep this conversation');
    assert.deepEqual(restored?.bot, { color: 'violet' });
    await patchSession(bot.id, { title: 'Renamed bot' });
    assert.equal((await readSession(bot.id))?.title, 'Renamed bot');
    assert.deepEqual((await listSessions()).find((item) => item.id === bot.id)?.bot, { color: 'violet' });
    await deleteSession(bot.id);
    assert.equal(await readSession(bot.id), null);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});
