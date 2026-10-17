import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import test from 'node:test';
import { bridgeBuiltinTool } from './bridge.ts';

test('built-in MCP bridge forwards the tool abort signal', async () => {
  let receivedSignal: AbortSignal | undefined;
  const client = {
    callTool: (_params: unknown, _schema?: unknown, options?: { signal?: AbortSignal }) => {
      receivedSignal = options?.signal;
      return new Promise<never>((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(new Error('Request aborted'));
          return;
        }
        signal.addEventListener('abort', () => reject(new Error('Request aborted')), { once: true });
      });
    },
  } as unknown as Client;
  const tool = bridgeBuiltinTool(client, {
    name: 'unregistered_test_tool',
    description: 'Test cancellation bridge',
    inputSchema: { type: 'object', properties: {} },
  }, new Set());
  const controller = new AbortController();

  const pending = tool.execute({}, { abortSignal: controller.signal });
  controller.abort();
  const result = await pending;

  assert.equal(receivedSignal, controller.signal);
  assert.ok(result && typeof result === 'object' && 'isError' in result && result.isError);
});

test('bridge checks the exposed name for child grants and parent policy before invoking tools', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { createSession, createSubagentSession } = await import('../../../stores/sessions.ts');
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-bridge-policy-'));
  process.env.APPDATA = directory;
  let calls = 0;
  const client = { callTool: async () => { calls += 1; return { content: [{ type: 'text', text: 'read contents' }] }; } } as unknown as Client;
  const listed = (name: string) => ({ name, description: 'test tool', inputSchema: { type: 'object' as const, properties: {} } });
  try {
    const parent = await createSession(null, undefined, undefined, 'coder', 'coder-plan');
    const read = bridgeBuiltinTool(client, listed('read_file'), new Set());
    const child = await createSubagentSession({ parentId: parent.id, agentId: 'subagent-coder', task: 'Inspect', toolGrant: [read.name] });
    const result = await read.execute({}, { sessionId: child.id }) as { isError?: boolean };
    assert.equal(result.isError, false);
    assert.equal(calls, 1);
    const write = bridgeBuiltinTool(client, listed('write_file'), new Set());
    const blockedParent = await write.execute({}, { sessionId: parent.id }) as { isError?: boolean };
    const blockedChild = await write.execute({}, { sessionId: child.id }) as { isError?: boolean; content: string };
    assert.equal(blockedParent.isError, true);
    assert.equal(blockedChild.isError, true);
    assert.match(blockedChild.content, /did not grant/);
    assert.equal(calls, 1);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});
