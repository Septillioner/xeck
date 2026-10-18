import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSettings, writeSettings } from './settings-store.ts';
import { settingsRoutes } from '../http/routes/settings.ts';
import { settingsPath } from '../infra/data-dir.ts';
import { writeJson } from '../infra/json-file.ts';

test('tool usage preferences default for old settings, persist, and reject invalid modes', async () => {
  const previousAppData = process.env.APPDATA;
  const testDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-tool-settings-'));
  process.env.APPDATA = testDirectory;
  try {
    const initial = await readSettings();
    assert.equal(initial.hideToolUsages, false);
    assert.equal(initial.toolUsageViewMode, 'balanced');
    await writeSettings({ hideToolUsages: true, toolUsageViewMode: 'compact' });
    const compact = await readSettings();
    assert.equal(compact.hideToolUsages, true);
    assert.equal(compact.toolUsageViewMode, 'compact');
    await writeSettings({ hideToolUsages: false });
    assert.equal((await readSettings()).toolUsageViewMode, 'compact');
    const invalid = await writeSettings({ toolUsageViewMode: 'unknown', hideToolUsages: 'true' });
    assert.equal(invalid.toolUsageViewMode, 'balanced');
    assert.equal(invalid.hideToolUsages, false);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(testDirectory, { recursive: true, force: true });
  }
});

test('subagent model settings persist, validate mutations and tolerate stale stored entries', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-model-settings-'));
  process.env.APPDATA = directory;
  try {
    assert.deepEqual((await readSettings()).agentProfiles, {});
    const profile = { provider: 'ollama', model: 'mini', host: 'http://127.0.0.1:11434' };
    await writeSettings({ agentProfiles: { 'subagent-coder': profile, 'subagent-general': null } });
    assert.deepEqual((await readSettings()).agentProfiles, { 'subagent-coder': profile, 'subagent-general': null });
    await writeSettings({ enterToSend: false });
    assert.deepEqual((await readSettings()).agentProfiles['subagent-coder'], profile);
    for (const agentProfiles of [null, [], { coder: profile }, { 'subagent-coder': {} }, { 'subagent-coder': { ...profile, provider: 'invalid' } }]) {
      const response = await settingsRoutes.request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentProfiles }) });
      assert.equal(response.status, 400);
      assert.deepEqual((await readSettings()).agentProfiles['subagent-coder'], profile);
    }
    await writeJson(settingsPath(), { agentProfiles: { removed: profile, 'subagent-coder': profile, 'subagent-general': {} }, enterToSend: false });
    assert.deepEqual((await readSettings()).agentProfiles, { 'subagent-coder': profile });
    assert.equal((await readSettings()).enterToSend, false);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent settings patches preserve the subagent selection and unrelated preferences', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-settings-patches-'));
  process.env.APPDATA = directory;
  try {
    const profile = { provider: 'ollama', model: 'mini', host: 'http://127.0.0.1:11434' };
    await Promise.all([
      writeSettings({ agentProfiles: { 'subagent-coder': profile } }),
      writeSettings({ enterToSend: false }),
      writeSettings({ theme: 'light' }),
    ]);
    const saved = await readSettings();
    assert.deepEqual(saved.agentProfiles, { 'subagent-coder': profile });
    assert.equal(saved.enterToSend, false);
    assert.equal(saved.theme, 'light');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});


test('language preferences default for older settings and persist through unrelated updates', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-language-settings-'));
  process.env.APPDATA = directory;
  try {
    assert.equal((await readSettings()).language, 'system');
    for (const language of ['tr', 'en', 'system'] as const) {
      const response = await settingsRoutes.request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language }) });
      assert.equal(response.status, 200);
      assert.equal((await readSettings()).language, language);
    }
    await writeSettings({ language: 'tr' });
    await writeSettings({ showReasoning: true });
    assert.equal((await readSettings()).language, 'tr');
    assert.equal((await writeSettings({ language: 'unsupported' })).language, 'system');
    await writeJson(settingsPath(), { showUsage: false });
    assert.equal((await readSettings()).language, 'system');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});
