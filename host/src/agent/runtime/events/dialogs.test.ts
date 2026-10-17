import assert from 'node:assert/strict';
import test from 'node:test';
import {
  abortDialogsForSession, listPendingDialogs, requestUserApproval, requestUserInput,
  resolveDialog, subscribeDialog, subscribeDialogResolved,
} from './dialogs.ts';

test('approval and input keep separate resolutions and clear pending entries', async () => {
  const sessionId = 'dialog-resolution';
  const request = { sessionId, title: 'Question', prompt: 'Proceed?' };
  const approval = requestUserApproval(request);
  const input = requestUserInput({ ...request, type: 'multiple_select', options: ['A', 'B'], allowOther: true });
  const [approvalDialog, inputDialog] = listPendingDialogs(sessionId);
  assert.equal(inputDialog.details?.allowOther, true);
  assert.equal(resolveDialog(approvalDialog.id, { approved: true }, 'another-session'), false);
  assert.equal(resolveDialog(approvalDialog.id, { approved: true }, sessionId), true);
  assert.equal(resolveDialog(inputDialog.id, { selections: ['B'] }, sessionId), true);
  assert.equal(await approval, true);
  assert.deepEqual(await input, { selections: ['B'] });
  assert.deepEqual(listPendingDialogs(sessionId), []);
  assert.equal(resolveDialog(inputDialog.id, {}, sessionId), false);
  const empty = requestUserInput(request);
  resolveDialog(listPendingDialogs(sessionId)[0].id, {}, sessionId);
  assert.equal(await empty, null);
});

test('signal and session cancellation reject requests even when subscribers fail', async () => {
  const sessionId = 'dialog-cancellation';
  const signal = new AbortController();
  const unsubscribers = [
    subscribeDialog(sessionId, () => { throw new Error('broken UI subscriber'); }),
    subscribeDialogResolved(sessionId, () => { throw new Error('broken resolution subscriber'); }),
  ];
  try {
    const approval = requestUserApproval({ sessionId, signal: signal.signal, title: 'Approval', prompt: 'Delete?' });
    const input = requestUserInput({ sessionId, title: 'Input', prompt: 'Choose' });
    const rejectedApproval = assert.rejects(approval, /Turn was aborted/);
    const rejectedInput = assert.rejects(input, /Turn was aborted/);
    signal.abort();
    assert.equal(listPendingDialogs(sessionId).length, 1);
    abortDialogsForSession(sessionId);
    await Promise.all([rejectedApproval, rejectedInput]);
    assert.deepEqual(listPendingDialogs(sessionId), []);
    await assert.rejects(requestUserInput({ sessionId, signal: signal.signal, title: 'Late', prompt: 'Late' }), /Turn was aborted/);
    assert.deepEqual(listPendingDialogs(sessionId), []);
  } finally { unsubscribers.forEach((unsubscribe) => unsubscribe()); }
});
