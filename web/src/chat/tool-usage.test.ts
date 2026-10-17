import assert from 'node:assert/strict';
import test from 'node:test';
import type { TranscriptToolBlock } from '../../../shared/types.ts';
import { currentActivity, toolDefaultOpen, toolUsageSummary } from './tool-usage.ts';

const tool = (callId: string, label: string, extra: Partial<TranscriptToolBlock> = {}): TranscriptToolBlock => ({
  kind: 'tool', callId, label, pending: false, ...extra,
});

test('compact counts unique successful reads and authoritative line totals without double-counting calls', () => {
  const tools = [
    tool('r1', 'File · Read file · src/a.ts · L1–20'),
    tool('r2', 'File · Read file · src/a.ts · L21–40'),
    tool('r3', 'File · Read file · src/b.ts'),
    tool('r4', 'File · Read file · missing.ts failed'),
    tool('r5', 'File · Read file · pending.ts', { pending: true }),
    tool('w1', 'File · Write file · src/a.ts', { change: { operation: 'write', path: 'src/a.ts', addedLines: 20, removedLines: 10, truncated: true, diff: '+preview' } }),
  ];
  assert.equal(toolUsageSummary([...tools, tools[0]]), '6 tools · 2 files read · 20 lines added · 10 lines removed · 1 failed');
});

test('diff fallback excludes headers and marks truncated counts as lower bounds', () => {
  const change = { operation: 'replace' as const, path: 'a.ts', diff: '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n+++counter\n context', truncated: true };
  assert.equal(toolUsageSummary([tool('w', 'File · Replace file lines', { change })]), '1 tool · 2+ lines added · 1+ line removed');
});

test('opaque tools do not invent read counts; enriched arguments supply external read paths', () => {
  const read = tool('r', 'File · read_file');
  assert.equal(toolUsageSummary([read, tool('cmd', 'Terminal · Run command')]), '2 tools');
  assert.equal(toolUsageSummary([read], [{ id: 'r', label: read.label, args: { path: 'src/a.ts' }, result: 'contents', pending: false }]), '1 tool · 1 file read');
});

test('balanced opens edits and errors; detailed opens routine tools too', () => {
  const read = tool('r', 'File · Read file · a.ts');
  const edit = tool('w', 'File · Write file', { change: { operation: 'write', path: 'a.ts' } });
  const failed = tool('f', 'MCP · search failed');
  assert.equal(toolDefaultOpen(read, 'balanced'), false);
  assert.equal(toolDefaultOpen(edit, 'balanced'), true);
  assert.equal(toolDefaultOpen(failed, 'balanced'), true);
  assert.equal(toolDefaultOpen(read, 'detailed'), true);
  assert.equal(toolDefaultOpen(edit, 'compact'), false);
});

test('status describes pending work and stops showing a tool after it finishes', () => {
  const read = tool('r', 'File · Read file · a.ts', { pending: true });
  assert.deepEqual(currentActivity({ phase: 'thinking', blocks: [read] }), { label: 'Reading files', mood: 'working' });
  assert.equal(currentActivity({ phase: 'thinking', blocks: [{ ...read, pending: false }] }).label, 'Thinking');
  assert.equal(currentActivity({ phase: 'thinking', blocks: [{ ...read, pending: false }, { kind: 'text', text: 'Answer' }] }).label, 'Writing a response');
  assert.equal(currentActivity({ phase: 'thinking', blocks: [tool('w', 'File · replace_lines', { pending: true })] }).label, 'Editing files');
});

test('stopping and waiting states outrank routine tool status', () => {
  const blocks = [tool('r', 'File · Read file · a.ts', { pending: true })];
  assert.equal(currentActivity({ phase: 'thinking', blocks, stopping: true, rateLimit: { retryAt: 1 } }).label, 'Stopping · saving progress');
  assert.equal(currentActivity({ phase: 'thinking', blocks, rateLimit: { retryAt: 1 } }).label, 'Waiting to retry');
  assert.equal(currentActivity({ phase: 'summarizing', blocks }).label, 'Summarizing context');
});
