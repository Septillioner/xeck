import assert from 'node:assert/strict';
import test from 'node:test';
import { contextMeterValues } from '../../web/src/chat/context-meter-values.ts';
import type { ContextParts } from '../../shared/types.ts';

const parts: ContextParts = { system: 0, tools: 0, rules: 1000, skills: 0, mcp: 0, summary: 0, conversation: 19617, toolCalls: 0, toolResults: 0, providerMeta: 0 };
const usage = { promptTokens: 20617, completionTokens: 162, totalTokens: 20779 };

test('ring and breakdown use the same maximum with decimal percentages', () => {
  const values = contextMeterValues(usage, 922000, parts);
  assert.equal(values.percent, 2.2);
  assert.equal(values.ratio, 20617 / 922000);
  assert.ok(Math.abs(values.parts.reduce((sum, part) => sum + part.fraction, 0) - values.ratio!) < 1e-12);
});

test('caps occupancy at 100% and rescales stale parts consistently', () => {
  const values = contextMeterValues({ ...usage, promptTokens: 50000 }, 10000, parts);
  assert.equal(values.percent, 100);
  assert.equal(values.ratio, 1);
  assert.equal(values.parts.reduce((sum, part) => sum + part.tokens, 0), 50000);
  assert.ok(Math.abs(values.parts.reduce((sum, part) => sum + part.fraction, 0) - 1) < 1e-12);
});

test('unknown or invalid maximum never produces a fake percentage', () => {
  for (const maximum of [undefined, 0, -10, NaN, Infinity]) {
    const values = contextMeterValues(usage, maximum, parts);
    assert.equal(values.ratio, null);
    assert.equal(values.percent, null);
    assert.equal(values.parts.reduce((sum, part) => sum + part.fraction, 0), 0);
  }
});

test('handles empty input and legacy sessions without breakdowns', () => {
  assert.equal(contextMeterValues({ ...usage, promptTokens: 0 }, 922000, parts).percent, 0);
  const values = contextMeterValues(usage, 922000, undefined);
  assert.equal(values.parts[0].key, 'conversation');
  assert.equal(values.parts[0].fraction, values.ratio);
});