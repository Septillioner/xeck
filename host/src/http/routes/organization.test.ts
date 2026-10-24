import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sessionRoutes } from './sessions.ts';
import { projectRoutes } from './projects.ts';
import { createSession, listSessions, readSession, saveSession } from '../../stores/sessions.ts';
import { createProject, getProject } from '../../stores/projects.ts';
import { buildHostSystemPrompt } from '../../agent/catalog/prompts/host-system-prompt.ts';

test('organization and bot profile edits survive a stale running-turn save', async () => {
  const previous = process.env.APPDATA;
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'xeck-organization-'));
  process.env.APPDATA = temporary;
  try {
    const chat = await createSession(null);
    const patch = (id: string, body: unknown) => sessionRoutes.request(`/api/sessions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await patch(chat.id, { pinned: true, archived: true })).status, 200);
    await saveSession(chat);
    assert.equal((await readSession(chat.id))?.pinned, true);
    assert.equal((await listSessions()).find((item) => item.id === chat.id)?.archived, true);
    assert.equal((await patch(chat.id, { archived: false })).status, 200);
    assert.equal((await readSession(chat.id))?.archived, false);
    assert.equal((await readSession(chat.id))?.pinned, true);
    for (const invalid of [{ archived: 'true' }, { pinned: 1 }, { botColor: 'pink' }, { botPurpose: 'New purpose' }]) {
      assert.equal((await patch(chat.id, invalid)).status, 400);
    }

    const bot = await createSession(null, undefined, undefined, undefined, undefined, undefined, { name: 'Atlas', color: 'blue', purpose: 'Initial purpose', systemPrompt: 'Initial instructions' });
    assert.equal((await patch(bot.id, { title: 'Nova', botColor: 'pink', botPurpose: 'Help with writing', botBadges: ['Editor'], botSystemPrompt: 'Updated instructions' })).status, 200);
    await saveSession(bot);
    const restored = (await readSession(bot.id))!;
    assert.equal(restored.title, 'Nova');
    assert.deepEqual(restored.bot, { color: 'pink', purpose: 'Help with writing', systemPrompt: 'Updated instructions', badges: ['Editor'] });
    const summary = (await listSessions()).find((item) => item.id === bot.id)!;
    assert.equal(summary.bot?.systemPrompt, undefined);
    assert.equal(summary.bot?.purpose, 'Help with writing');
    for (const invalid of [{ botColor: 'red' }, { botPurpose: '' }, { botPurpose: 'x'.repeat(4001) }]) {
      assert.equal((await patch(bot.id, invalid)).status, 400);
    }
    const prompt = await buildHostSystemPrompt(restored.agentId, { name: restored.title, ...restored.bot });
    assert.match(prompt, /Your current purpose is "Help with writing"/);

    const project = await createProject('Work');
    const response = await projectRoutes.request(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pinned: true }) });
    assert.equal(response.status, 200);
    assert.equal((await getProject(project.id))?.pinned, true);
    assert.equal((await getProject(project.id))?.name, 'Work');
    assert.equal((await projectRoutes.request(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"pinned":"yes"}' })).status, 400);
  } finally {
    if (previous === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previous;
    await rm(temporary, { recursive: true, force: true });
  }
});
