import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PlanRejected, readPlan, writePlan } from './plan-store.ts';
import {
  changedFilesIn,
  planRead,
  planWrite,
  readPlanDocument,
  setTodoFromUser,
  todoAdd,
  todoUpdate,
} from './plan-service.ts';
import { createSession, readSession, saveSession, setSessionPolicyId } from '../stores/sessions.ts';

/** A session id for the store-level tests that never create a session file. */
const SESSION = '11111111-1111-4111-8111-111111111111';

async function withDataDir(t: () => Promise<void>): Promise<void> {
  const previousAppData = process.env.APPDATA;
  const root = await mkdtemp(path.join(os.tmpdir(), 'xeck-plan-service-'));
  process.env.APPDATA = root;
  try {
    await t();
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(root, { recursive: true, force: true });
  }
}

test('plan_write creates the session plan and every later call carries the revision', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    const created = await planWrite(session.id, {
      name: 'Add OAuth login',
      body: '# OAuth\n\nTwo steps.',
      todos: [
        { id: 't1', content: 'Read the docs', status: 'pending' },
        { id: 't2', content: 'Write the callback', status: 'pending' },
      ],
    });
    assert.equal(created.revision, 1);
    assert.equal(created.total, 2);
    assert.equal(created.done, 0);
    assert.equal((await readSession(session.id))?.activePlan, 'add-oauth-login');

    const read = await planRead(session.id);
    assert.match(read.markdown ?? '', /revision: 1/);
    assert.match(read.markdown ?? '', /- \[ \] t1 Read the docs/);

    await assert.rejects(
      planWrite(session.id, { name: 'Add OAuth login', body: 'x', todos: [], revision: 9 }),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('plan_read'),
    );
  });
});

test('todo_update closes one step and starts the next in a single round', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    await planWrite(session.id, {
      name: 'Two steps',
      body: '',
      todos: [
        { id: 't1', content: 'First', status: 'in_progress' },
        { id: 't2', content: 'Second', status: 'pending' },
      ],
    });

    const plan = await todoUpdate(session.id, [
      { id: 't1', status: 'completed', note: 'typecheck clean' },
      { id: 't2', status: 'in_progress' },
    ], 1);
    assert.equal(plan.revision, 2);
    assert.equal(plan.done, 1);
    assert.equal(plan.todos[0].note, 'typecheck clean');
    assert.equal(plan.todos[1].status, 'in_progress');

    // A batch that would leave two steps in progress is still rejected.
    await assert.rejects(
      todoUpdate(session.id, [
        { id: 't1', status: 'in_progress' },
        { id: 't2', status: 'in_progress' },
      ], 2),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('one todo'),
    );
    await assert.rejects(
      todoUpdate(session.id, [{ id: 't9', status: 'completed', note: 'x' }], 2),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('plan_read'),
    );
    // A fresh move to completed needs its own evidence.
    await assert.rejects(
      todoUpdate(session.id, [{ id: 't2', status: 'completed' }], 2),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('evidence'),
    );
    // Re-sending the completed step keeps the note it already carries.
    const repeated = await todoUpdate(session.id, [{ id: 't1', status: 'completed' }], 2);
    assert.equal(repeated.todos[0].note, 'typecheck clean');
  });
});

test('todo_add appends or inserts after a step', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    await planWrite(session.id, {
      name: 'Add a step',
      body: '',
      todos: [
        { id: 't1', content: 'First', status: 'pending' },
        { id: 't2', content: 'Second', status: 'pending' },
      ],
    });

    const appended = await todoAdd(session.id, { content: 'Third', revision: 1 });
    assert.deepEqual(appended.todos.map((todo) => todo.id), ['t1', 't2', 't3']);

    const inserted = await todoAdd(session.id, { content: 'Zero', afterId: 't1', revision: appended.revision });
    assert.deepEqual(inserted.todos.map((todo) => todo.id), ['t1', 't4', 't2', 't3']);
    await assert.rejects(
      todoAdd(session.id, { content: 'x', afterId: 'nope', revision: inserted.revision }),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('not in the plan'),
    );
    await assert.rejects(
      todoAdd(session.id, { content: '   ', revision: inserted.revision }),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('required'),
    );
  });
});

test('a user can tick a step without writing an evidence note', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    await planWrite(session.id, {
      name: 'User edits',
      body: '',
      todos: [{ id: 't1', content: 'Check me', status: 'pending' }],
    });

    const done = await setTodoFromUser(session.id, 't1', { status: 'completed', revision: 1 });
    assert.equal(done.done, 1);
    assert.match(String(done.todos[0].note), /user/i);

    // Un-ticking keeps working and the revision still guards the write.
    const back = await setTodoFromUser(session.id, 't1', { status: 'pending', revision: done.revision });
    assert.equal(back.done, 0);
    await assert.rejects(
      setTodoFromUser(session.id, 't1', { status: 'completed', revision: done.revision - 1 }),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('plan_read'),
    );
    await assert.rejects(
      setTodoFromUser(session.id, 't1', { status: 'finished', revision: back.revision }),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('status must be'),
    );
  });
});

test('plan mode drafts the plan and refuses to start a step', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    await setSessionPolicyId(session.id, 'coder-plan');

    // Drafting is exactly what plan mode is for.
    const draft = await planWrite(session.id, {
      name: 'Add OAuth login',
      body: '# OAuth\n\nTwo steps.',
      todos: [
        { id: 't1', content: 'Read the docs', status: 'pending' },
        { id: 't2', content: 'Write the callback', status: 'pending' },
      ],
    });
    assert.equal(draft.revision, 1);
    assert.equal(draft.done, 0);

    // Claiming a step is started is not: the plan stays a draft. planWrite does not
    // reject such a plan, it files every step as pending.
    const claimed = await planWrite(session.id, {
      name: 'Add OAuth login',
      body: 'x',
      todos: [
        { id: 't1', content: 'Read the docs', status: 'completed', note: 'already done' },
        { id: 't2', content: 'Write the callback', status: 'pending' },
      ],
      revision: draft.revision,
    });
    assert.equal(claimed.done, 0);
    assert.equal(claimed.todos.every((todo) => todo.status === 'pending'), true);
    const started = await planWrite(session.id, {
      name: 'Add OAuth login',
      body: 'x',
      todos: [
        { id: 't1', content: 'Read the docs', status: 'in_progress' },
        { id: 't2', content: 'Write the callback', status: 'pending' },
      ],
      revision: claimed.revision,
    });
    assert.equal(started.todos[0].status, 'pending');

    // Marking progress through the model tools is refused too.
    await assert.rejects(
      todoUpdate(session.id, [{ id: 't1', status: 'in_progress' }], started.revision),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('status pending') && !error.message.includes('agent mode'),
    );
    await assert.rejects(
      todoUpdate(session.id, [{ id: 't1', status: 'completed', note: 'done' }], started.revision),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('status pending') && !error.message.includes('agent mode'),
    );

    // Adding a step is still drafting, so it stays available.
    const appended = await todoAdd(session.id, { content: 'Third', revision: started.revision });
    assert.deepEqual(appended.todos.map((todo) => todo.id), ['t1', 't2', 't3']);
    assert.equal(appended.todos.every((todo) => todo.status === 'pending'), true);

    // The user stays in charge of their own checklist.
    const ticked = await setTodoFromUser(session.id, 't1', { status: 'completed', revision: appended.revision });
    assert.equal(ticked.done, 1);
  });
});

test('agent mode marks progress as soon as the plan is built', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    await setSessionPolicyId(session.id, 'coder-plan');
    await planWrite(session.id, {
      name: 'Build it',
      body: '',
      todos: [{ id: 't1', content: 'First', status: 'pending' }],
    });

    // Build: one click moves the chat to agent mode.
    await setSessionPolicyId(session.id, 'coder-agent');
    const started = await todoUpdate(session.id, [{ id: 't1', status: 'in_progress' }], 1);
    assert.equal(started.todos[0].status, 'in_progress');

    const done = await todoUpdate(session.id, [{ id: 't1', status: 'completed', note: 'typecheck clean' }], started.revision);
    assert.equal(done.done, 1);

    // Agent mode may also write a plan that already carries progress.
    const progressed = await planWrite(session.id, {
      name: 'Build it',
      body: '',
      todos: [{ id: 't1', content: 'First', status: 'completed', note: 'typecheck clean' }, { id: 't2', content: 'Second', status: 'pending' }],
      revision: done.revision,
    });
    assert.equal(progressed.todos[0].status, 'completed');
    assert.equal(progressed.todos[0].note, 'typecheck clean');
  });
});

test('plan tools need a session and a plan', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    const missing = await planRead(session.id);
    assert.equal(missing.plan, null);
    assert.match(missing.message ?? '', /plan_write/);
    assert.match(missing.message ?? '', /pending/);
    assert.equal(await readPlanDocument(session.id), null);

    const other = await createSession(null);
    assert.notEqual(other.id, session.id);
    const saved = await saveSession({ ...(await readSession(other.id))! });
    assert.equal(saved.activePlan, undefined);
    await assert.rejects(
      planWrite('00000000-0000-4000-8000-000000000000', { name: 'x', body: '', todos: [] }),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('No active session'),
    );
  });
});

test('a renamed plan keeps its file', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    await planWrite(session.id, { name: 'First title', body: '', todos: [] });
    const renamed = await planWrite(session.id, { name: 'Second title', body: '', todos: [], revision: 1 });
    assert.equal(renamed.name, 'Second title');
    const stored = await readPlan(session.id, 'first-title');
    assert.equal(stored?.plan.name, 'Second title');
  });
});

test('plan_write without a revision replaces the active file instead of creating history', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    const first = await planWrite(session.id, { name: 'First task', body: 'first', todos: [] });
    assert.equal(first.revision, 1);
    assert.equal((await readSession(session.id))?.activePlan, 'first-task');

    const second = await planWrite(session.id, { name: 'Second task', body: 'second', todos: [] });
    assert.equal(second.revision, 2);
    assert.equal(second.name, 'Second task');
    assert.equal((await readSession(session.id))?.activePlan, 'first-task');


    const repeated = await planWrite(session.id, { name: 'First task', body: 'latest', todos: [] });
    assert.equal(repeated.revision, 3);
    const currentPlan = await planRead(session.id);
    assert.ok(currentPlan);
    assert.match(currentPlan?.markdown ?? '', /latest/);

  });
});

test('changed files are one row per path with summed line counts', async () => {
  const messages = [
    { id: '1', role: 'assistant' as const, content: '', createdAt: '2026-01-01T00:00:00.000Z', blocks: [
      { kind: 'tool' as const, callId: 'a', label: 'write', pending: false, change: { operation: 'write' as const, path: 'src/a.ts', addedLines: 10, removedLines: 2, diff: '@@ -1 +1 @@\n+one' } },
      { kind: 'tool' as const, callId: 'b', label: 'write', pending: false, change: { operation: 'write' as const, path: 'src/b.ts', addedLines: 5, removedLines: 0 } },
    ] },
    { id: '2', role: 'assistant' as const, content: '', createdAt: '2026-01-01T00:01:00.000Z', blocks: [
      // Same file again: the counts add up and the newest diff is the one kept.
      { kind: 'tool' as const, callId: 'c', label: 'write', pending: false, change: { operation: 'replace' as const, path: 'src/a.ts', addedLines: 3, removedLines: 1, diff: '@@ -5 +5 @@\n-two\n+two' } },
    ] },
    { id: '3', role: 'user' as const, content: 'hi', createdAt: '2026-01-01T00:02:00.000Z' },
  ];

  const files = changedFilesIn(messages);
  assert.equal(files.length, 2);
  const a = files.find((file) => file.path === 'src/a.ts');
  assert.equal(a?.added, 13);
  assert.equal(a?.removed, 3);
  assert.equal(a?.changes, 2);
  assert.equal(a?.lastOperation, 'replace');
  assert.match(a?.diff ?? '', /\+two/);
  assert.equal(files.find((file) => file.path === 'src/b.ts')?.added, 5);
});


test('a plan keeps its createdAt across writes and moves updatedAt', async () => {
  await withDataDir(async () => {
    const slug = 'stamped';
    const first = await writePlan(SESSION, slug, {
      name: 'Stamped',
      body: 'one',
      todos: [],
    });
    assert.ok(first.plan.createdAt);
    assert.equal(first.plan.createdAt, first.plan.updatedAt);

    const second = await writePlan(
      SESSION,
      slug,
      { name: 'Stamped', body: 'two', todos: [] },
      first.plan.revision,
    );
    assert.equal(second.plan.createdAt, first.plan.createdAt);
    assert.ok(second.plan.updatedAt);
    assert.ok(
      Date.parse(second.plan.updatedAt ?? '') >= Date.parse(first.plan.updatedAt ?? ''),
    );
    assert.equal(second.plan.revision, 2);

    // The timestamps live in the file, so a plan read back carries them.
    const reread = await readPlan(SESSION, slug);
    assert.equal(reread?.plan.createdAt, first.plan.createdAt);
    assert.equal(reread?.plan.updatedAt, second.plan.updatedAt);
  });
});
