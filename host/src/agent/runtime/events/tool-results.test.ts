import assert from 'node:assert/strict';
import test from 'node:test';
import { parseToolResult } from './tool-results.ts';

test('ordinary, malformed and incomplete tool output does not produce structured cards', () => {
  for (const content of [undefined, 'plain output', '{', 'null', '42', '{}', '{"change":{},"plan":{},"command":"ls"}']) {
    assert.deepEqual(parseToolResult(content), {});
  }
});

test('structured output retains file, plan and terminal details for the shared stream', () => {
  const change = { operation: 'write', path: 'src/app.ts' };
  const plan = { name: 'Implementation', revision: 2, todos: [] };
  const terminal = { command: 'npm test', cwd: '/workspace', stdout: 'Tests passed', stderr: '', ok: true, timedOut: false };
  assert.deepEqual(parseToolResult(JSON.stringify({ change, plan })), { change, plan });
  assert.deepEqual(parseToolResult(JSON.stringify(terminal)), { terminal });
});
