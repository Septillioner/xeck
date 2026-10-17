import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addCatalogEntry, applyContextLengths, listCatalog, removeCatalogEntry, setCatalogContextLength } from './catalog-store.ts';
import { catalogPath } from '../infra/data-dir.ts';
import { writeJson } from '../infra/json-file.ts';
import { staticContextLength } from '../domain/model-context.ts';
import { listModelsForProvider } from './provider-store.ts';

test('static OpenAI context lengths and backend integration', async (t) => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-context-test-'));
  process.env.APPDATA = temporaryDirectory;
  try {
    await t.test('uses input limits for exact model IDs and excludes other providers', async () => {
      assert.equal(await staticContextLength('openai', 'gpt-4.1'), 1047576);
      assert.equal(await staticContextLength('openai', 'gpt-4o'), 128000);
      assert.equal(await staticContextLength('openai', 'gpt-4o-2024-05-13'), 128000);
      assert.equal(await staticContextLength('openai', 'gpt-5-chat-latest'), 128000);
      assert.equal(await staticContextLength('openai', 'gpt-6-luna'), 922000);
      assert.equal(await staticContextLength('openai', 'gpt-unknown'), undefined);
      assert.equal(await staticContextLength('openai', 'text-embedding-3-small'), undefined);
      assert.equal(await staticContextLength('groq', 'gpt-4o'), undefined);
      assert.equal(await staticContextLength('ollama', 'gpt-4o'), undefined);
    });

    await t.test('fills newly seeded catalog entries without model discovery', async () => {
      const entries = await listCatalog();
      assert.equal(entries.find((entry) => entry.slug === 'openai/gpt-4.1')?.contextLength, 1047576);
      assert.equal(entries.find((entry) => entry.slug === 'openai/gpt-4o')?.contextLength, 128000);
      assert.equal(entries.find((entry) => entry.slug === 'openrouter/openai/gpt-4.1')?.contextLength, undefined);
    });

    await t.test('fills legacy catalog entries while preserving explicit limits and unknown models', async () => {
      await writeJson(catalogPath(), {
        seeded: true,
        entries: [
          { slug: 'openai/gpt-4o', provider: 'openai', model: 'gpt-4o', name: 'GPT-4o', origin: 'user' },
          { slug: 'openai/gpt-4.1', provider: 'openai', model: 'gpt-4.1', name: 'GPT-4.1', origin: 'user', contextLength: 64000 },
          { slug: 'openai/gpt-unknown', provider: 'openai', model: 'gpt-unknown', name: 'Unknown', origin: 'user' },
        ],
      });
      const before = await readFile(catalogPath(), 'utf8');
      const entries = await listCatalog();
      assert.equal(entries.find((entry) => entry.model === 'gpt-4o')?.contextLength, 128000);
      assert.equal(entries.find((entry) => entry.model === 'gpt-4.1')?.contextLength, 64000);
      assert.equal(entries.find((entry) => entry.model === 'gpt-unknown')?.contextLength, undefined);
      assert.equal(await readFile(catalogPath(), 'utf8'), before, 'reads must not rewrite the catalog');
    });

    await t.test('add and delete responses keep fallback context lengths', async () => {
      const added = await addCatalogEntry('openai', 'gpt-4.1-mini');
      assert.equal(added.find((entry) => entry.model === 'gpt-4.1-mini')?.contextLength, 1047576);
      const explicit = await addCatalogEntry('openai', 'gpt-4.1-mini', undefined, 32000);
      assert.equal(explicit.find((entry) => entry.model === 'gpt-4.1-mini')?.contextLength, 32000);
      const remaining = await removeCatalogEntry('openai/gpt-4.1-mini');
      assert.equal(remaining.find((entry) => entry.model === 'gpt-4o')?.contextLength, 128000);
    });

    await t.test('manual context lengths survive discovery and can be cleared', async () => {
      const slug = 'openai/gpt-4o';
      const manual = await setCatalogContextLength(slug, 64000);
      const manualEntry = manual.find((entry) => entry.slug === slug);
      assert.equal(manualEntry?.contextLength, 64000);
      assert.equal(manualEntry?.contextLengthManual, true);

      await applyContextLengths('openai', [{ id: 'gpt-4o', contextLength: 128000 }]);
      const preserved = (await listCatalog()).find((entry) => entry.slug === slug);
      assert.equal(preserved?.contextLength, 64000);
      assert.equal(preserved?.contextLengthManual, true);

      const cleared = await setCatalogContextLength(slug, null);
      const restored = cleared.find((entry) => entry.slug === slug);
      assert.equal(restored?.contextLength, 128000);
      assert.equal(restored?.contextLengthManual, undefined);
    });

    await t.test('rejects invalid manual context lengths', async () => {
      await assert.rejects(setCatalogContextLength('openai/gpt-4o', 0));
      await assert.rejects(setCatalogContextLength('openai/gpt-4o', 1.5));
      await assert.rejects(setCatalogContextLength('openai/gpt-4o', Number.NaN));
      await assert.rejects(setCatalogContextLength('openai/gpt-4o', 10_000_001));
    });

    await t.test('OpenAI model discovery returns static limits to the frontend', async () => {
      const previousFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify({
        object: 'list',
        data: [
          { id: 'gpt-4o', object: 'model', created: 0, owned_by: 'openai' },
          { id: 'gpt-4.1-mini', object: 'model', created: 0, owned_by: 'openai' },
          { id: 'gpt-unknown', object: 'model', created: 0, owned_by: 'openai' },
        ],
      }), { headers: { 'content-type': 'application/json' } });
      try {
        const models = await listModelsForProvider('openai', { apiKey: 'test-key' });
        assert.equal(models.length, 3);
        assert.equal(models.find((model) => model.id === 'gpt-4o')?.contextLength, 128000);
        assert.equal(models.find((model) => model.id === 'gpt-4.1-mini')?.contextLength, 1047576);
        assert.equal(models.find((model) => model.id === 'gpt-unknown')?.contextLength, undefined);
      } finally {
        globalThis.fetch = previousFetch;
      }
    });
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});