import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sessionPlansDir } from '../infra/data-dir.ts';
import { MAX_PLAN_TODOS } from '../infra/limits.ts';
import {
  nextTodoId,
  parsePlanMarkdown,
  planPath,
  PlanRejected,
  readPlan,
  serializePlanMarkdown,
  slugifyPlanName,
  STALE_PLAN_REVISION_MESSAGE,
  writePlan,
  type PlanDocument,
} from './plan-store.ts';
import { POLICY_BY_ID } from '../agent/catalog/policies.ts';
import { createSession, deleteSession, readSessionPolicyId, setSessionPolicyId } from '../stores/sessions.ts';

const SESSION = '11111111-1111-4111-8111-111111111111';

function plan(overrides: Partial<PlanDocument> = {}): PlanDocument {
  return {
    name: 'Add OAuth login',
    revision: 1,
    todos: [{ id: 't1', content: 'Read the auth docs', status: 'pending' }],
    body: '# OAuth\n\nWork through the steps.',
    ...overrides,
  };
}

async function withDataDir(t: (root: string) => Promise<void>): Promise<void> {
  const previousAppData = process.env.APPDATA;
  const root = await mkdtemp(path.join(os.tmpdir(), 'xeck-plans-'));
  process.env.APPDATA = root;
  try {
    await t(root);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(root, { recursive: true, force: true });
  }
}

test('front matter round trips and the todo block is regenerated, never parsed', async (t) => {
  await t.test('serialize then parse keeps the plan', () => {
    const source = plan({
      revision: 4,
      todos: [
        { id: 't1', content: 'Read the docs', status: 'completed', note: 'read_file ok' },
        { id: 't2', content: 'Write the callback', status: 'in_progress' },
        { id: 't3', content: 'Ask for approval', status: 'blocked', note: 'waiting on legal' },
      ],
    });
    assert.deepEqual(parsePlanMarkdown(serializePlanMarkdown(source)), source);
  });

  await t.test('the generated block mirrors the front matter', () => {
    const markdown = serializePlanMarkdown(plan({
      todos: [
        { id: 't1', content: 'First', status: 'completed', note: 'done' },
        { id: 't2', content: 'Second', status: 'pending' },
      ],
    }));
    assert.match(markdown, /- \[x\] t1 First/);
    assert.match(markdown, /- \[ \] t2 Second/);
    assert.match(markdown, /revision: 1/);
  });

  await t.test('a hand edited block is ignored while parsing', () => {
    const markdown = serializePlanMarkdown(plan());
    const tampered = markdown.replace('- [ ] t1 Read the auth docs', '- [x] t9 Ghost step');
    const parsed = parsePlanMarkdown(tampered);
    assert.deepEqual(parsed.todos, [{ id: 't1', content: 'Read the auth docs', status: 'pending' }]);
  });

  await t.test('an unknown status falls back to pending instead of failing the read', () => {
    const parsed = parsePlanMarkdown(['---', 'name: X', 'revision: 2', 'todos:', '  - id: t1', '    content: Step', '    status: done', '---', '', 'body'].join('\n'));
    assert.equal(parsed.todos[0].status, 'pending');
  });
});

test('writes are atomic, bump the revision, and leave no temp file behind', async () => {
  await withDataDir(async (root) => {
    const slug = slugifyPlanName('Add OAuth login');
    assert.equal(slug, 'add-oauth-login');

    const first = await writePlan(SESSION, slug, plan());
    assert.equal(first.plan.revision, 1);

    const second = await writePlan(SESSION, slug, plan({ body: '# OAuth\n\nRewritten.' }), first.plan.revision);
    assert.equal(second.plan.revision, 2);

    const stored = await readFile(planPath(SESSION, slug), 'utf8');
    assert.match(stored, /revision: 2/);
    assert.match(stored, /Rewritten\./);
    assert.deepEqual(await readdir(sessionPlansDir(SESSION)), ['add-oauth-login.plan.md']);

    const reread = await readPlan(SESSION, slug);
    assert.equal(reread?.plan.revision, 2);
    assert.equal(await readPlan(SESSION, 'missing-plan'), null);
    assert.ok(root.length > 0);
  });
});

test('a stale revision is rejected and points the model back at plan_read', async () => {
  await withDataDir(async () => {
    const slug = slugifyPlanName('Add OAuth login');
    const created = await writePlan(SESSION, slug, plan());

    await assert.rejects(
      writePlan(SESSION, slug, plan({ body: 'new body' }), created.plan.revision - 1),
      (error: unknown) => error instanceof PlanRejected && error.message === STALE_PLAN_REVISION_MESSAGE,
    );
    await assert.rejects(
      writePlan(SESSION, slug, plan({ body: 'new body' })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('plan_read'),
    );

    // The rejected writes left the stored revision alone.
    assert.equal((await readPlan(SESSION, slug))?.plan.revision, 1);
    // A hand edit that bumps the revision invalidates the model's cached copy.
    const file = planPath(SESSION, slug);
    await writeFile(file, (await readFile(file, 'utf8')).replace('revision: 1', 'revision: 7'), 'utf8');
    await assert.rejects(
      writePlan(SESSION, slug, plan(), created.plan.revision),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('plan_read'),
    );
  });
});

test('only one todo may be in progress', async () => {
  await withDataDir(async () => {
    const slug = slugifyPlanName('Two steps');
    await assert.rejects(
      writePlan(SESSION, slug, plan({
        todos: [
          { id: 't1', content: 'First', status: 'in_progress' },
          { id: 't2', content: 'Second', status: 'in_progress' },
        ],
      })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('one todo'),
    );
    const stored = await writePlan(SESSION, slug, plan({
      todos: [{ id: 't1', content: 'First', status: 'in_progress' }],
    }));
    assert.equal(stored.plan.todos[0].status, 'in_progress');
  });
});

test('completed needs evidence, blocked needs a reason, and completed steps cannot be deleted', async () => {
  await withDataDir(async () => {
    const slug = slugifyPlanName('Evidence');
    await assert.rejects(
      writePlan(SESSION, slug, plan({ todos: [{ id: 't1', content: 'Step', status: 'completed' }] })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('evidence'),
    );
    await assert.rejects(
      writePlan(SESSION, slug, plan({ todos: [{ id: 't1', content: 'Step', status: 'blocked' }] })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('blocked'),
    );

    const stored = await writePlan(SESSION, slug, plan({
      todos: [{ id: 't1', content: 'Step', status: 'completed', note: 'tests pass' }],
    }));
    assert.equal(stored.plan.revision, 1);

    await assert.rejects(
      writePlan(SESSION, slug, plan({ todos: [] }), 1),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('cannot be deleted'),
    );

    // Re-sending the completed step without its note keeps the stored evidence.
    const kept = await writePlan(SESSION, slug, plan({
      todos: [{ id: 't1', content: 'Step', status: 'completed' }],
    }), 1);
    assert.equal(kept.plan.todos[0].note, 'tests pass');
  });
});

test('plan limits are enforced', async () => {
  await withDataDir(async () => {
    const slug = slugifyPlanName('Limits');
    const many = Array.from({ length: MAX_PLAN_TODOS + 1 }, (_, index) => ({
      id: `t${index + 1}`,
      content: `Step ${index + 1}`,
      status: 'pending' as const,
    }));
    await assert.rejects(
      writePlan(SESSION, slug, plan({ todos: many })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('at most'),
    );
    await assert.rejects(
      writePlan(SESSION, slug, plan({ todos: [{ id: 't1', content: 'x'.repeat(121), status: 'pending' }] })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('too long'),
    );
    await assert.rejects(
      writePlan(SESSION, slug, plan({ body: 'y'.repeat(20_001) })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('body is too long'),
    );
    await assert.rejects(
      writePlan(SESSION, slug, plan({
        todos: [
          { id: 't1', content: 'Step', status: 'pending' },
          { id: 't1', content: 'Step again', status: 'pending' },
        ],
      })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('more than once'),
    );
    await assert.rejects(
      writePlan(SESSION, slug, plan({ todos: [{ id: 'has space', content: 'Step', status: 'pending' }] })),
      (error: unknown) => error instanceof PlanRejected && error.message.includes('may only contain'),
    );

    const accepted = await writePlan(SESSION, slug, plan({
      todos: Array.from({ length: MAX_PLAN_TODOS }, (_, index) => ({
        id: `t${index + 1}`,
        content: `Step ${index + 1}`,
        status: 'pending' as const,
      })),
    }));
    assert.equal(accepted.plan.todos.length, MAX_PLAN_TODOS);
  });
});

test('deleting a session deletes its plans, and the policy defaults to the workspace', async () => {
  await withDataDir(async () => {
    const session = await createSession(null);
    const slug = slugifyPlanName('Session plan');
    await writePlan(session.id, slug, plan({ name: 'Session plan' }));
    assert.equal((await readdir(sessionPlansDir(session.id))).length, 1);

    assert.equal(await readSessionPolicyId(session.id, 'coder-agent'), 'coder-agent');
    const switched = await setSessionPolicyId(session.id, 'coder-plan', POLICY_BY_ID['coder-plan']?.entryLine);
    assert.equal(switched?.policyId, 'coder-plan');
    assert.equal(switched?.libraryMessages.at(-1)?.content, 'Mode is now plan: write the plan with plan_write before executing.');
    assert.equal(await readSessionPolicyId(session.id, 'coder-agent'), 'coder-plan');
    assert.equal(await setSessionPolicyId('99999999-9999-4999-8999-999999999999', 'coder-plan'), null);

    assert.equal(await deleteSession(session.id), true);
    assert.deepEqual(await readdir(sessionPlansDir(session.id)).catch(() => []), []);
    assert.equal(await readSessionPolicyId(session.id, 'coder-agent'), 'coder-agent');
  });
});

test('new todo ids follow the t1, t2 pattern without reusing one', () => {
  assert.equal(nextTodoId([{ id: 't1', content: 'Step', status: 'pending' }]), 't2');
  assert.equal(nextTodoId([{ id: 't2', content: 'Step', status: 'pending' }]), 't1');
  assert.equal(slugifyPlanName('   '), 'plan');
});