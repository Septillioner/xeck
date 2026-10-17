import assert from 'node:assert/strict';
import test from 'node:test';
import type { SubagentUpdate, TranscriptBlock } from '../../../shared/types.ts';
import { upsertLiveSubagent } from './stream-blocks.ts';

test('live child updates keep independent cards in place and retain terminal outcomes', () => {
  const child: SubagentUpdate = { sessionId: 'child-1', agentId: 'subagent-general', task: 'Research', status: 'running', activity: 'Thinking' };
  let blocks: TranscriptBlock[] = [{ kind: 'text', text: 'Delegating' }];
  blocks = upsertLiveSubagent(blocks, child);
  blocks = upsertLiveSubagent(blocks, { ...child, sessionId: 'child-2' });
  blocks = upsertLiveSubagent(blocks, { ...child, activity: 'Reading' });
  blocks = upsertLiveSubagent(blocks, { ...child, status: 'failed', activity: 'Failed', error: 'Provider unavailable' });
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[1], { kind: 'subagent', ...child, status: 'failed', activity: 'Failed', error: 'Provider unavailable' });
  assert.equal(blocks[2].kind === 'subagent' && blocks[2].status, 'running');
});

test('session list filters child summaries at the client boundary', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { search: '' } } });
  globalThis.fetch = async () => new Response(JSON.stringify([
    { id: 'root' }, { id: 'child', parentId: 'root' }, { id: 'legacy' },
  ]), { headers: { 'content-type': 'application/json' } });
  try {
    const { listSessions } = await import('../api/client.ts');
    assert.deepEqual((await listSessions()).map((session) => session.id), ['root', 'legacy']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
