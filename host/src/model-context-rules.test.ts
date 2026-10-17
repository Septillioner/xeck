import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveContextLength, maxContextThreshold } from '../../shared/model-context.ts';

test('MAX thresholds recognize current model families and provider-qualified IDs', () => {
  for (const model of ['gpt-6', 'gpt-6.1', 'gpt-6-sol', 'openai/gpt-6-luna', 'GPT-5-6', 'gpt-5.6']) {
    assert.equal(maxContextThreshold(model), 272_000, model);
  }
  assert.equal(maxContextThreshold('gpt-5.4'), 250_000);
  assert.equal(maxContextThreshold('gpt-5-5'), 250_000);
  assert.equal(maxContextThreshold('google/gemini-3-pro-preview'), 200_000);
  assert.equal(maxContextThreshold('anthropic/claude-sonnet-4-5'), 200_000);
  assert.equal(maxContextThreshold('claude-haiku-5-5'), 100_000);
});

test('unlisted models use the configured default threshold and empty selections have none', () => {
  assert.equal(maxContextThreshold('custom/large-model'), 250_000);
  assert.equal(maxContextThreshold(''), undefined);
});

test('MAX switches between the threshold and full context without enlarging small or unknown windows', () => {
  assert.equal(effectiveContextLength('gpt-6-luna', 922_000, false), 272_000);
  assert.equal(effectiveContextLength('gpt-6-luna', 922_000, true), 922_000);
  assert.equal(effectiveContextLength('custom/large-model', 900_000, undefined), 250_000);
  assert.equal(effectiveContextLength('custom/large-model', 900_000, true), 900_000);
  assert.equal(effectiveContextLength('gpt-6-luna', 128_000, false), 128_000);
  assert.equal(effectiveContextLength('gpt-6-luna', undefined, false), undefined);
});
