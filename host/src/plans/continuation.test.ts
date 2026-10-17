import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTINUE_OPEN_STEPS_HOOK,
  MAX_TODO_CONTINUATIONS,
  openStepsMessage,
  planTailLine,
  todoContinuation,
} from './continuation.ts';

test('an agent turn with open steps is continued, then handed back', () => {
  const input = { open: ['t2', 't3'], loop: CONTINUE_OPEN_STEPS_HOOK, listening: true, planLine: null };

  const first = todoContinuation({ ...input, continuations: 0 });
  assert.equal(first.kind, 'continue');
  assert.equal(
    (first as { message: string }).message,
    'Open steps: t2, t3. Finish them or mark blocked/cancelled with a note.',
  );

  // With a plan tail line the message also carries the plan state.
  const withLine = todoContinuation({ ...input, planLine: 'Plan 1/3, next t2', continuations: 0 });
  assert.equal(
    (withLine as { message: string }).message,
    'Plan 1/3, next t2. Open steps: t2, t3. Finish them or mark blocked/cancelled with a note.',
  );

  assert.equal(todoContinuation({ ...input, continuations: 1 }).kind, 'continue');

  // The cap stops the loop: the open list goes back to the user.
  assert.deepEqual(todoContinuation({ ...input, continuations: MAX_TODO_CONTINUATIONS }), {
    kind: 'handoff',
    open: ['t2', 't3'],
  });
  assert.equal(todoContinuation({ ...input, continuations: MAX_TODO_CONTINUATIONS + 5 }).kind, 'handoff');
});

test('the loop stops without open steps, without the policy loop, and on disconnect', () => {
  const base = { continuations: 0, listening: true, loop: CONTINUE_OPEN_STEPS_HOOK, planLine: null };
  assert.equal(todoContinuation({ ...base, open: [] }).kind, 'stop');
  assert.equal(todoContinuation({ ...base, open: ['t1'], loop: undefined }).kind, 'stop');
  assert.equal(todoContinuation({ ...base, open: ['t1'], listening: false }).kind, 'stop');
  assert.equal(openStepsMessage(['t4'], null), 'Open steps: t4. Finish them or mark blocked/cancelled with a note.');
  assert.equal(openStepsMessage(['t2'], 'Plan 1/2'), 'Plan 1/2. Open steps: t2. Finish them or mark blocked/cancelled with a note.');
});

test('the summary tail line is one line about the plan state', () => {
  const todos = [
    { id: 't1', content: 'First', status: 'completed' as const, note: 'done' },
    { id: 't2', content: 'Second', status: 'in_progress' as const },
    { id: 't3', content: 'Third', status: 'pending' as const },
  ];
  assert.equal(planTailLine(todos, 1, 3), 'Plan 1/3, next t2');
  assert.equal(
    planTailLine(todos.map((todo) => ({ ...todo, status: 'cancelled' as const })), 0, 3),
    'Plan 0/3',
  );
  assert.equal(planTailLine([], 0, 0), null);
});
