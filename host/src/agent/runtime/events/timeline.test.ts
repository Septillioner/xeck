import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TranscriptBlock } from '../../../../../shared/types.ts';
import { applyUserTurn, createSession, readSession, saveSession } from '../../../stores/sessions.ts';
import { assistantMessage, createTimeline, persistPartial } from './timeline.ts';

test('subagent status updates become one persistent card in the parent transcript', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-subagent-card-'));
  process.env.APPDATA = temporaryDirectory;
  try {
    const session = await createSession(null);
    const timeline = createTimeline();
    timeline.subagentUpdate({ sessionId: 'child-1', agentId: 'general', task: 'Summarize a topic', status: 'running', activity: 'Thinking' });
    timeline.subagentUpdate({ sessionId: 'child-1', agentId: 'general', task: 'Summarize a topic', status: 'running', activity: 'Reading files' });
    timeline.subagentUpdate({ sessionId: 'child-1', agentId: 'general', task: 'Summarize a topic', status: 'done', activity: 'Complete' });
    assert.equal(timeline.blocks.length, 1);
    session.messages.push(assistantMessage(timeline.blocks));
    await saveSession(session);
    const reopened = await readSession(session.id);
    assert.deepEqual(reopened?.messages.at(-1)?.blocks, [{
      kind: 'subagent',
      sessionId: 'child-1',
      agentId: 'general',
      task: 'Summarize a topic',
      status: 'done',
      activity: 'Complete',
    }]);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('an aborted partial transcript and earlier history survive a session reload', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-partial-transcript-'));
  process.env.APPDATA = temporaryDirectory;

  try {
    const session = await createSession(null);
    applyUserTurn(session, 'Earlier question');
    session.libraryMessages.push({ role: 'user', content: 'Earlier question' });
    session.messages.push({
      id: 'earlier-assistant',
      role: 'assistant',
      content: 'Earlier answer',
      createdAt: new Date().toISOString(),
    });
    session.libraryMessages.push({ role: 'assistant', content: 'Earlier answer' });
    await saveSession(session);

    applyUserTurn(session, 'Run this command');
    const partialBlocks: TranscriptBlock[] = [
      { kind: 'text', text: 'Partial response before Abort.' },
      { kind: 'tool', callId: 'call-1', label: 'Run command', pending: false },
    ];
    const turnLibrary = [...session.libraryMessages, { role: 'user', content: 'Run this command' }];
    const saved = await persistPartial(session, partialBlocks, turnLibrary);
    const reopened = await readSession(saved.id);

    assert.ok(reopened);
    assert.deepEqual(
      reopened.messages.map((message) => [message.role, message.content]),
      [
        ['user', 'Earlier question'],
        ['assistant', 'Earlier answer'],
        ['user', 'Run this command'],
        ['assistant', 'Partial response before Abort.'],
      ],
    );
    assert.deepEqual(reopened.messages.at(-1)?.blocks, partialBlocks);
    assert.equal(reopened.libraryMessages.at(-1)?.content, 'Partial response before Abort.');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
