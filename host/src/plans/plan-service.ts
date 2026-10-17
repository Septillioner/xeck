import type {
  ChangedFile,
  FileChange,
  PlanSnapshot,
  PlanStatus,
  PlanTodo,
  PlanView,
  StoredSession,
  TranscriptMessage,
} from '../../../shared/types.ts';
import { isPlanStatus } from '../../../shared/types.ts';
import { messageBlocks } from '../../../shared/transcript.ts';
import { readSession, setSessionActivePlan } from '../stores/sessions.ts';

import { chatIdentityFromSession } from '../agent/workspaces/resolve.ts';
import { isToolAllowedInPolicy } from '../agent/tools/policy-context.ts';
import { TODO_UPDATE_TOOL } from '../agent/tools/builtin/plan.ts';
import { BUILTIN_TOOL_PREFIX } from '../agent/tools/builtin/identity.ts';
import {
  nextTodoId,
  openTodoIds,
  PlanRejected,
  planSnapshot,
  readPlan,
  slugifyPlanName,
  writePlan,
  type PlanDocument,
  type StoredPlan,
} from './plan-store.ts';

/** Result every plan tool answers with. `markdown` only comes back from plan_read. */
export interface PlanToolResult {
  plan: PlanSnapshot | null;
  markdown?: string;
  /** Set when the chat has no plan, so the model calls plan_write instead of retrying. */
  message?: string;
}

/** A drafting policy cannot start or finish steps. The model retries plan_write. */
const DRAFT_ONLY_REASON =
  'This policy only drafts the plan. Call plan_write again with every step status pending. Do not switch policy.';


const NO_PLAN_MESSAGE =
  'This chat has no plan yet. Call plan_write. Every step status must be pending.';

export interface TodoUpdate {
  id: string;
  status: PlanStatus;
  note?: string;
}

const USER_EVIDENCE = 'Marked by the user.';
/**
 * A policy that does not allow `todo_update` may only draft. The refusal tells
 * the model to send plan_write again; it does not use the policy deniedReason,
 * which tells the model to switch policy.
 */
function draftDeniedReason(session: { policyId?: unknown; workspace?: unknown; agentId?: unknown }): string | null {
  const { policyId } = chatIdentityFromSession(session);
  // The policy filter knows built-in tools by the name the model sees. The bare
  // server-side name reads as an external tool and is always allowed, which would
  // switch drafting off in every policy.
  if (isToolAllowedInPolicy({ toolName: `${BUILTIN_TOOL_PREFIX}${TODO_UPDATE_TOOL}`, policyId })) return null;
  return DRAFT_ONLY_REASON;
}

/** The plan file of a session, together with the record that points at it. */
interface ActivePlan {
  session: StoredSession;
  stored: StoredPlan | null;
}

/**
 * Plan tools are per session, so every call starts from the session record: it
 * carries the active plan slug, the policy id, and is the only place the plan
 * can be attached to or detached from the chat.
 */
async function activePlan(sessionId: string): Promise<ActivePlan> {
  const session = await readSession(sessionId);
  if (!session) throw new PlanRejected('No active session to work on its plan.');
  const stored = session.activePlan ? await readPlan(sessionId, session.activePlan) : null;
  return { session, stored };
}

/** Current plan as the UI and the host read it. */
export async function readPlanView(sessionId: string): Promise<PlanView | null> {
  const { stored } = await activePlan(sessionId);
  if (!stored) return null;
  return {
    ...planSnapshot(stored.plan),
    body: stored.plan.body,
    markdown: stored.markdown,
  };
}


/**
 * Every file this chat changed, one row per file.
 *
 * The transcript already stores each change with its diff and line counts, so
 * this only folds them together: repeated edits to the same file are summed into
 * one row, because the question the list answers is "what did this chat touch",
 * not "how many times". The newest change carries the diff that is shown.
 */
export async function changedFiles(sessionId: string): Promise<ChangedFile[]> {
  const session = await readSession(sessionId);
  if (!session) return [];
  return changedFilesIn(session.messages ?? []);
}

/** The same fold, over an already loaded message list. */
export function changedFilesIn(messages: TranscriptMessage[]): ChangedFile[] {
  /** `order` is internal: it keeps first-seen order without being in the wire type. */
  type Row = ChangedFile & { order: number };
  const byPath = new Map<string, Row>();
  let order = 0;
  messages.forEach((message, messageIndex) => {
    if (message.role !== 'assistant') return;
    for (const change of changesOf(message)) {
      const path = change.path;
      const existing = byPath.get(path);
      const added = change.addedLines ?? 0;
      const removed = change.removedLines ?? 0;
      if (existing) {
        existing.added += added;
        existing.removed += removed;
        existing.changes += 1;
        existing.lastOperation = change.operation;
        existing.lastAt = messageIndex;
        existing.order = order;
        if (change.diff) existing.diff = change.diff;
        if (change.truncated) existing.truncated = true;
        else existing.truncated = false;
      } else {
        byPath.set(path, {
          path,
          added,
          removed,
          changes: 1,
          lastOperation: change.operation,
          lastAt: messageIndex,
          diff: change.diff,
          truncated: change.truncated,
          order: order++,
        });
      }
    }
  });
  return [...byPath.values()]
    .sort((left, right) => (left.order - right.order) || left.path.localeCompare(right.path))
    .map(({ order: _order, ...file }) => file);
}

/** Block changes first, falling back to the flat list older messages carry. */
function changesOf(message: TranscriptMessage): FileChange[] {
  if (message.blocks?.length) {
    return messageBlocks(message)
      .filter((block) => block.kind === 'tool' && block.change)
      .map((block) => (block.kind === 'tool' ? block.change as FileChange : undefined))
      .filter((change): change is FileChange => Boolean(change));
  }
  return message.changes ?? [];
}

/** The stored plan document, used by the host to enforce open steps. */
export async function readPlanDocument(sessionId: string, slug?: string): Promise<StoredPlan | null> {
  // The continuation loop already holds the session, so it passes the slug and
  // skips a second session read on every round of the turn.
  if (slug) {
    const stored = await readPlan(sessionId, slug);
    return stored;
  }
  const { stored } = await activePlan(sessionId);
  return stored;
}

/**
 * Writes a plan for the chat. Every call reuses the active file; a new file is
 * created only when the session has no readable active plan.
 *
 * When the caller omits `revision`, the host uses the revision it just read.
 * This keeps simple upserts concise while explicit revisions still reject stale
 * writes from a model or another window.
 *
 * Under a drafting policy every step must be pending, so drafting cannot claim
 * work is done.
 */
export async function planWrite(
  sessionId: string,
  input: { name: string; body: string; todos: PlanTodo[]; revision?: number },
): Promise<PlanSnapshot> {
  const { session, stored: active } = await activePlan(sessionId);
  const drafting = draftDeniedReason(session) !== null;
  const todos = drafting ? input.todos.map(asPendingTodo) : input.todos;
  const slug = active?.slug ?? slugifyPlanName(input.name);
  const revision = input.revision ?? active?.plan.revision;
  const stored = await writePlan(
    sessionId,
    slug,
    { name: input.name, body: input.body, todos },
    revision,
  );
  await setSessionActivePlan(sessionId, slug);
  return planSnapshot(stored.plan);

}

function asPendingTodo(todo: PlanTodo): PlanTodo {
  return { ...todo, status: 'pending' };
}


/** plan_read: the markdown plus the status of every step. No plan is an empty result, not a failure. */
export async function planRead(sessionId: string): Promise<PlanToolResult> {
  const { stored } = await activePlan(sessionId);
  if (!stored) return { plan: null, message: NO_PLAN_MESSAGE };
  return { plan: planSnapshot(stored.plan), markdown: stored.markdown };
}

/**
 * todo_update: applies every update against the stored plan in one pass, so
 * finishing a step and starting the next one costs a single call. Batch order
 * matters, and a batch that would leave two steps in progress is rejected.
 *
 * The model's progress calls belong to policies that allow `todo_update`. Under
 * a drafting policy the plan is a draft, so the model may add steps but not
 * start them; `setTodoFromUser` is the one path that still ticks a step there,
 * because the user is in charge of it.
 */
export async function todoUpdate(sessionId: string, updates: TodoUpdate[], revision?: number): Promise<PlanSnapshot> {
  return applyUpdates(sessionId, updates, revision, true);
}

/** todo_add: appends a pending step, or inserts it right after an existing one. */
export async function todoAdd(
  sessionId: string,
  input: { content: string; afterId?: string; revision?: number },
): Promise<PlanSnapshot> {
  const { stored } = await activePlan(sessionId);
  if (!stored) throw new PlanRejected('This chat has no plan yet. Call plan_write to create one.');
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!content) throw new PlanRejected('Todo text is required.');
  const todos = [...stored.plan.todos];
  if (input.afterId) {
    const index = todos.findIndex((todo) => todo.id === input.afterId);
    if (index < 0) throw new PlanRejected(`Todo ${input.afterId} is not in the plan. Call plan_read first.`);
    todos.splice(index + 1, 0, { id: nextTodoId(todos), content, status: 'pending' });
  } else {
    todos.push({ id: nextTodoId(todos), content, status: 'pending' });
  }
  return writeTodos(sessionId, stored, todos, input.revision);
}

/**
 * The UI ticking a checkbox. It follows the same lock and revision rules as the
 * model, but a user has no evidence note to give, so one is recorded for them.
 */
export async function setTodoFromUser(
  sessionId: string,
  todoId: string,
  input: { status: string; note?: string; revision?: number },
): Promise<PlanSnapshot> {
  const status = typeof input.status === 'string' && isPlanStatus(input.status) ? input.status : null;
  if (!status) throw new PlanRejected('Todo status must be pending, in_progress, completed, blocked, or cancelled.');
  return applyUpdates(
    sessionId,
    [{ id: todoId, status, note: input.note?.trim() || USER_EVIDENCE }],
    input.revision,
  );
}

async function applyUpdates(
  sessionId: string,
  updates: TodoUpdate[],
  revision?: number,
  fromModel = false,
): Promise<PlanSnapshot> {
  const { session, stored } = await activePlan(sessionId);
  const draftReason = fromModel ? draftDeniedReason(session) : null;
  if (draftReason) throw new PlanRejected(draftReason);
  if (!stored) throw new PlanRejected('This chat has no plan yet. Call plan_write to create one.');
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new PlanRejected('At least one todo update is required.');
  }
  const todos = stored.plan.todos.map((todo) => ({ ...todo }));
  for (const update of updates) {
    const index = todos.findIndex((todo) => todo.id === update.id);
    if (index < 0) throw new PlanRejected(`Todo ${update.id} is not in the plan. Call plan_read first.`);
    const status = isPlanStatus(update.status) ? update.status : null;
    if (!status) {
      throw new PlanRejected(
        'Todo status must be pending, in_progress, completed, blocked, or cancelled.',
      );
    }
    const note = typeof update.note === 'string' && update.note.trim() ? update.note.trim() : undefined;
    todos[index] = { ...todos[index], status, ...(note ? { note } : {}) };
  }
  return writeTodos(sessionId, stored, todos, revision);
}

async function writeTodos(
  sessionId: string,
  stored: StoredPlan,
  todos: PlanTodo[],
  revision?: number,
): Promise<PlanSnapshot> {
  const next = await writePlan(
    sessionId,
    stored.slug,
    { name: stored.plan.name, body: stored.plan.body, todos },
    revision,
  );
  return planSnapshot(next.plan);
}