import { randomUUID } from 'node:crypto';
import type { DialogResolution, DialogType, UserDialog } from '../../../../../shared/types.ts';

interface PendingEntry {
  dialog: UserDialog;
  resolve: (res: DialogResolution) => void;
  reject: (err: unknown) => void;
}

type DialogListener = (dialog: UserDialog) => void;
type DialogResolvedListener = (dialogId: string, resolution?: DialogResolution) => void;

const TURN_ABORTED = 'Turn was aborted';

const pendingEntries = new Map<string, PendingEntry>();
const listenersBySession = new Map<string, Set<DialogListener>>();
const resolveListenersBySession = new Map<string, Set<DialogResolvedListener>>();

export function subscribeDialog(sessionId: string, listener: DialogListener): () => void {
  let listeners = listenersBySession.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    listenersBySession.set(sessionId, listeners);
  }
  listeners.add(listener);

  for (const entry of [...pendingEntries.values()]) {
    if (entry.dialog.sessionId === sessionId) {
      try { listener(entry.dialog); }
      catch { /* Replay has the same subscriber isolation as live delivery. */ }
    }
  }

  return () => {
    const current = listenersBySession.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersBySession.delete(sessionId);
    }
  };
}

export function subscribeDialogResolved(sessionId: string, listener: DialogResolvedListener): () => void {
  let listeners = resolveListenersBySession.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    resolveListenersBySession.set(sessionId, listeners);
  }
  listeners.add(listener);

  return () => {
    const current = resolveListenersBySession.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      resolveListenersBySession.delete(sessionId);
    }
  };
}

export function listPendingDialogs(sessionId: string): UserDialog[] {
  const result: UserDialog[] = [];
  for (const entry of pendingEntries.values()) {
    if (entry.dialog.sessionId === sessionId) {
      result.push(entry.dialog);
    }
  }
  return result;
}

export function resolveDialog(dialogId: string, resolution: DialogResolution, sessionId: string): boolean {
  const entry = pendingEntries.get(dialogId);
  if (!entry || entry.dialog.sessionId !== sessionId) return false;
  pendingEntries.delete(dialogId);
  entry.resolve(resolution);
  notifyResolved(entry.dialog.sessionId, dialogId, resolution);
  return true;
}

export function abortDialogsForSession(sessionId: string): void {
  for (const [id, entry] of pendingEntries.entries()) {
    if (entry.dialog.sessionId !== sessionId) continue;
    pendingEntries.delete(id);
    notifyResolved(sessionId, id);
    entry.reject(new Error(TURN_ABORTED));
  }
}

function notifyResolved(sessionId: string, dialogId: string, resolution?: DialogResolution): void {
  const listeners = resolveListenersBySession.get(sessionId);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    try { listener(dialogId, resolution); }
    catch { /* A subscriber cannot interrupt resolution or cancellation. */ }
  }
}

export function requestUserApproval(input: {
  sessionId: string;
  signal?: AbortSignal;
  title: string;
  prompt: string;
  details?: Record<string, unknown>;
}): Promise<boolean> {
  return requestDialog({
    sessionId: input.sessionId, type: 'approval', title: input.title,
    prompt: input.prompt, details: input.details,
  }, input.signal).then((resolution) => resolution.approved === true);
}

export function requestUserInput(input: {
  sessionId: string;
  signal?: AbortSignal;
  title: string;
  prompt: string;
  type?: Exclude<DialogType, 'approval' | 'question'>;
  options?: string[];
  allowOther?: boolean;
  details?: Record<string, unknown>;
}): Promise<DialogResolution | null> {
  return requestDialog({
    sessionId: input.sessionId, type: input.type ?? 'text', title: input.title,
    prompt: input.prompt,
    details: {
      ...input.details,
      ...(input.options ? { options: input.options } : {}),
      ...(input.allowOther ? { allowOther: true } : {}),
    },
  }, input.signal).then((resolution) => hasResolutionValue(resolution) ? resolution : null);
}

/** Approval and input share registration, resolution, cancellation and listener cleanup. */
function requestDialog(input: Omit<UserDialog, 'id' | 'createdAt'>, signal?: AbortSignal): Promise<DialogResolution> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error(TURN_ABORTED));
    const dialog: UserDialog = { ...input, id: randomUUID(), createdAt: Date.now() };
    const onAbort = () => {
      const entry = pendingEntries.get(dialog.id);
      if (!entry) return;
      pendingEntries.delete(dialog.id);
      notifyResolved(dialog.sessionId, dialog.id);
      entry.reject(new Error(TURN_ABORTED));
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    pendingEntries.set(dialog.id, {
      dialog,
      resolve: (resolution) => { cleanup(); resolve(resolution); },
      reject: (error) => { cleanup(); reject(error); },
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    for (const listener of [...(listenersBySession.get(dialog.sessionId) ?? [])]) {
      try { listener(dialog); }
      catch { /* A subscriber cannot strand a pending request. */ }
    }
  });
}

function hasResolutionValue(resolution: DialogResolution): boolean {
  return typeof resolution.response === 'string'
    || (Array.isArray(resolution.selections) && resolution.selections.length > 0)
    || typeof resolution.other === 'string';
}
