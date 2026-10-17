import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateSessionBrand } from './legacy-brand.ts';
import { createSession, readSession, listSessions } from '../stores/sessions.ts';
import { readSettings, writeSettings } from '../stores/settings-store.ts';
import { readRuleRecords } from '../stores/rules-store.ts';
import { readMemories } from '../stores/memory-store.ts';
import { writeJson } from '../infra/json-file.ts';
import { settingsPath, sessionFilePath, sessionIndexPath, rulesDir, memoriesPath } from '../infra/data-dir.ts';

test('legacy session identifiers migrate while content and arguments remain literal', () => {
  const original = {
    agentId: 'poyraz-agent', workspace: 'poyraz-agent@1', policyId: 'pa-ask',
    origin: { grant: { tools: ['mcp_poyraz__read_file', 'mcp_external__read'] } },
    messages: [{ content: 'poyraz-agent mcp_poyraz__read_file', toolName: 'mcp_poyraz__read_file',
      args: { agentId: 'poyraz-agent' } }],
  };
  const migrated = migrateSessionBrand(original);
  assert.equal(migrated.agentId, 'xeck');
  assert.equal(migrated.workspace, 'xeck@1');
  assert.equal(migrated.policyId, 'xeck-ask');
  assert.deepEqual(migrated.origin.grant.tools, ['mcp_xeck__read_file', 'mcp_external__read']);
  assert.equal(migrated.messages[0].toolName, 'mcp_xeck__read_file');
  assert.equal(migrated.messages[0].content, original.messages[0].content);
  assert.deepEqual(migrated.messages[0].args, original.messages[0].args);
  assert.equal(original.agentId, 'poyraz-agent');
  assert.deepEqual(migrateSessionBrand(migrated), migrated);
});

test('stored sessions, settings, rules and memories retain their meaning after the rename', async () => {
  const previous = process.env.APPDATA;
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'xeck-legacy-'));
  process.env.APPDATA = temporary;
  try {
    await writeJson(settingsPath(), { poyrazInstructionsEnabled: false });
    assert.equal((await readSettings()).xeckInstructionsEnabled, false);
    assert.equal((await writeSettings({ theme: 'dark' })).xeckInstructionsEnabled, false);
    const session = await createSession(null, undefined, undefined, 'poyraz-agent');
    assert.equal(session.agentId, 'xeck');
    const legacy = { ...session, agentId: 'poyraz-agent', workspace: 'poyraz-agent@1', policyId: 'pa-agent' };
    await writeJson(sessionFilePath(session.id), legacy);
    await writeJson(sessionIndexPath(), { sessions: [legacy] });
    assert.equal((await readSession(session.id))?.agentId, 'xeck');
    assert.equal((await readSession(session.id))?.policyId, 'xeck-agent');
    assert.equal((await readSession(session.id))?.workspace, 'xeck@1');
    assert.equal((await listSessions())[0].id, session.id);
    await mkdir(rulesDir(), { recursive: true });
    await writeFile(path.join(rulesDir(), 'legacy.md'), '---\nsource: poyraz\n---\nKeep poyraz library unchanged.\n');
    const rules = await readRuleRecords();
    assert.equal(rules[0].source, 'xeck');
    assert.equal(rules[0].text, 'Keep poyraz library unchanged.');
    await writeJson(memoriesPath(), { memories: [{ id: 'legacy', title: 'Legacy', content: 'poyraz',
      type: 'memory', tags: [], source: 'poyraz', createdAt: 1, updatedAt: 1 }] });
    const memories = await readMemories();
    assert.equal(memories[0].source, 'xeck');
    assert.equal(memories[0].content, 'poyraz');
  } finally {
    if (previous === undefined) delete process.env.APPDATA; else process.env.APPDATA = previous;
    await rm(temporary, { recursive: true, force: true });
  }
});
