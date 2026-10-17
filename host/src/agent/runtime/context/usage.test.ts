import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent, defineTool } from 'poyraz';
import { z } from 'zod';

// The host resolves zod 4.6 while the linked library resolves its own 4.5 copy, so a
// `z.ZodObject` built here is nominally different from the one in its typings even
// though the runtime shape is identical. Widening the schema once here keeps the
// tool definition readable instead of pinning the host to a single zod minor.
const noopSchema = z.object({}) as unknown as Parameters<typeof defineTool>[0]['inputSchema'];

test('agent separates final-request context from cumulative tool-round usage', async () => {
  let calls = 0;
  const steps = [
    { content: '', tool_calls: [{ id: 'noop-1', type: 'function' as const, function: { name: 'noop', arguments: {} } }], usage: { promptTokens: 10000, completionTokens: 100, totalTokens: 10100 } },
    { content: 'Done', usage: { promptTokens: 12000, completionTokens: 200, totalTokens: 12200 } },
    { content: 'Next', usage: { promptTokens: 13000, completionTokens: 50, totalTokens: 13050 } },
  ];
  const agent = new Agent({
    provider: { chat: async () => steps[calls++] },
    tools: {
      noop: defineTool({ name: 'noop', description: 'No operation', inputSchema: noopSchema, execute: async () => ({ content: 'ok' }) }),
    },
  });
  const result = await agent.chat('Run noop');
  assert.equal(calls, 2);
  assert.equal(result.usage.promptTokens, 22000);
  assert.equal(result.usage.totalTokens, 22300);
  assert.equal(result.contextUsage?.promptTokens, 12000);
  const next = await agent.chat('Next');
  assert.equal(next.contextUsage?.promptTokens, 13000);
  assert.equal(next.usage.promptTokens, 13000);
});