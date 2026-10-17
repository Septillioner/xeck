import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isPlanStatus,
  type PlanSnapshot,
  type PlanStatus,
  type PlanTodo,
} from '../../../shared/types.ts';
import { dataLock } from '../infra/data-lock.ts';
import { sessionPlansDir } from '../infra/data-dir.ts';
import { isMissingFile } from '../infra/fs-safe.ts';
import {
  MAX_PLAN_BODY_CHARS,
  MAX_PLAN_ID_CHARS,
  MAX_PLAN_NAME_CHARS,
  MAX_PLAN_NOTE_CHARS,
  MAX_PLAN_TODO_CONTENT_CHARS,
  MAX_PLAN_TODOS,
} from '../infra/limits.ts';

const FRONT_MATTER_FENCE = '---';
/** Generated block markers. Exported so context accounting can recognise plan markdown. */
export const TODOS_BLOCK_START = '<!-- todos:start -->';
export const TODOS_BLOCK_END = '<!-- todos:end -->';
const PLAN_FILE_SUFFIX = '.plan.md';
const DEFAULT_PLAN_SLUG = 'plan';
/** A slug is at most this long, so a plan file name stays inside every path limit. */
export const PLAN_SLUG_MAX_CHARS = 48;
const TEMP_SUFFIX = '.tmp';
const TODO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TODO_ID_PREFIX = 't';

/** Told to the model whenever a write would overwrite a newer plan. */
export const STALE_PLAN_REVISION_MESSAGE =
  'Plan changed on disk. Call plan_read first to get the current revision, then write again.';

/** A plan the caller wants to store. `revision` is owned by the store. */
export interface PlanDraft {
  name: string;
  body: string;
  todos: PlanTodo[];
}

/** What one plan file currently holds. */
export interface PlanDocument {
  name: string;
  revision: number;
  todos: PlanTodo[];
  /** Free markdown below the front matter, with the todo block already applied. */
  body: string;
  /** ISO timestamp of the first write. Missing on a file written before this existed. */
  createdAt?: string;
  /** ISO timestamp of the most recent write. */
  updatedAt?: string;
}

export interface StoredPlan {
  slug: string;
  plan: PlanDocument;
  /** The file text as stored, including a todo block the user may have edited. */
  markdown: string;

}

/** Domain rejection turned into a tool/API error by the caller. */
export class PlanRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanRejected';
  }
}

/** File name for a plan slug. */
export function planFileName(slug: string): string {
  return `${slugifyPlanName(slug)}${PLAN_FILE_SUFFIX}`;
}

export function planPath(sessionId: string, slug: string): string {
  return path.join(sessionPlansDir(sessionId), planFileName(slug));
}

/** `Add OAuth` becomes `add-oauth`. The slug is fixed when the plan is created. */
export function slugifyPlanName(name: string): string {
  const slug = (typeof name === 'string' ? name : '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PLAN_SLUG_MAX_CHARS)
    .replace(/-+$/g, '');
  return slug || DEFAULT_PLAN_SLUG;
}


export function planSnapshot(plan: PlanDocument): PlanSnapshot {
  const todos = plan.todos.map((todo) => ({ ...todo }));
  return {
    name: plan.name,
    revision: plan.revision,
    todos,
    done: todos.filter((todo) => todo.status === 'completed').length,
    total: todos.length,
  };
}

/** Todo ids that still need work, in plan order. */
export function openTodoIds(plan: PlanDocument): string[] {
  return plan.todos
    .filter((todo) => todo.status === 'pending' || todo.status === 'in_progress')
    .map((todo) => todo.id);
}

export function nextTodoId(todos: PlanTodo[]): string {
  const used = new Set(todos.map((todo) => todo.id));
  let index = 1;
  while (used.has(`${TODO_ID_PREFIX}${index}`)) index += 1;
  return `${TODO_ID_PREFIX}${index}`;
}

/**
 * Front matter is the single source of truth. The `<!-- todos -->` block in the
 * body is a rendering of it, so parsing ignores the block completely and a write
 * always regenerates it from the front matter.
 */
export function parsePlanMarkdown(markdown: string): PlanDocument {
  const text = normalizeNewlines(markdown);
  const lines = text.split('\n');
  if (lines[0]?.trim() !== FRONT_MATTER_FENCE) {
    throw new PlanRejected('Plan file is missing its front matter.');
  }
  const fence = lines.findIndex((line, index) => index > 0 && line.trim() === FRONT_MATTER_FENCE);
  if (fence < 0) throw new PlanRejected('Plan file is missing its front matter.');

  const { name, revision, todos, createdAt, updatedAt } = parseFrontMatter(lines.slice(1, fence));
  // The blank line between the front matter and the body is layout, not content.
  const body = lines.slice(fence + 1).join('\n').replace(/^\n+/, '');
  return {
    name,
    revision,
    todos,
    // Omitted rather than set to `undefined`: a plan written before the
    // timestamps existed must serialize back to exactly the file it came from.
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    body: stripTodosBlock(body),
  };
}

export function serializePlanMarkdown(plan: PlanDocument): string {
  const front = [
    FRONT_MATTER_FENCE,
    `name: ${plan.name}`,
    `revision: ${plan.revision}`,
    // The timestamps sit next to the revision they move with, so a plan file
    // read on its own says when it was opened and last touched.
    ...(plan.createdAt ? [`createdAt: ${plan.createdAt}`] : []),
    ...(plan.updatedAt ? [`updatedAt: ${plan.updatedAt}`] : []),
    'todos:',
    ...plan.todos.flatMap((todo) => [
      `  - id: ${todo.id}`,
      `    content: ${todo.content}`,
      `    status: ${todo.status}`,
      ...(todo.note ? [`    note: ${todo.note}`] : []),
    ]),
    FRONT_MATTER_FENCE,
  ].join('\n');
  return `${front}\n\n${withTodosBlock(plan.body, plan.todos)}`;
}

/**
 * Enforces what a plan write may contain: bounds, unique ids, one step in
 * progress at a time, evidence for steps that just moved to completed/blocked,
 * and completed steps that plan_write cannot drop.
 */
export function validatePlan(plan: PlanDocument, previous?: PlanDocument): void {
  const name = typeof plan.name === 'string' ? plan.name.trim() : '';
  if (!name) throw new PlanRejected('Plan name is required.');
  if (name.length > MAX_PLAN_NAME_CHARS) {
    throw new PlanRejected(`Plan name is too long. Keep it under ${MAX_PLAN_NAME_CHARS} characters.`);
  }
  if (!Number.isInteger(plan.revision) || plan.revision < 1) {
    throw new PlanRejected('Plan revision must be a positive whole number.');
  }
  const body = typeof plan.body === 'string' ? plan.body : '';
  if (body.length > MAX_PLAN_BODY_CHARS) {
    throw new PlanRejected(`Plan body is too long. Keep it under ${MAX_PLAN_BODY_CHARS} characters.`);
  }
  if (!Array.isArray(plan.todos)) throw new PlanRejected('Plan todos must be a list.');
  if (plan.todos.length > MAX_PLAN_TODOS) {
    throw new PlanRejected(`A plan can hold at most ${MAX_PLAN_TODOS} todos.`);
  }

  const ids = new Set<string>();
  let inProgress = 0;
  const before = new Map((previous?.todos ?? []).map((todo) => [todo.id, todo]));
  for (const todo of plan.todos) {
    const id = typeof todo.id === 'string' ? todo.id.trim() : '';
    if (!id) throw new PlanRejected('Every todo needs an id.');
    if (id.length > MAX_PLAN_ID_CHARS) throw new PlanRejected(`Todo id "${id}" is too long.`);
    if (!TODO_ID_PATTERN.test(id)) {
      throw new PlanRejected(`Todo id "${id}" may only contain letters, digits, dot, dash, and underscore.`);
    }
    if (ids.has(id)) throw new PlanRejected(`Todo id "${id}" is used more than once.`);
    ids.add(id);

    const content = typeof todo.content === 'string' ? todo.content.trim() : '';
    if (!content) throw new PlanRejected(`Todo ${id} needs a description.`);
    if (content.length > MAX_PLAN_TODO_CONTENT_CHARS) {
      throw new PlanRejected(
        `Todo ${id} is too long. Keep the description under ${MAX_PLAN_TODO_CONTENT_CHARS} characters.`,
      );
    }
    for (const [label, value] of [
      ['name', name],
      ['description', content],
      ['note', todo.note ?? ''],
    ] as const) {
      if (/\r|\n/.test(value)) throw new PlanRejected(`Todo ${id} ${label} must be a single line.`);
    }
    const note = typeof todo.note === 'string' ? todo.note.trim() : '';
    if (note.length > MAX_PLAN_NOTE_CHARS) {
      throw new PlanRejected(`Todo ${id} note is too long. Keep it under ${MAX_PLAN_NOTE_CHARS} characters.`);
    }
    if (!isPlanStatus(todo.status)) throw new PlanRejected(`Todo ${id} has an unknown status.`);
    if (todo.status === 'in_progress') inProgress += 1;
    if (todo.status === 'completed' || todo.status === 'blocked') {
      const was = before.get(id);
      const moved = !was || was.status !== todo.status;
      if (!note && moved) {
        throw new PlanRejected(
          todo.status === 'completed'
            ? `Todo ${id} needs a short note as evidence before it is completed.`
            : `Todo ${id} needs a note saying why it is blocked.`,
        );
      }
    }
  }
  if (inProgress > 1) throw new PlanRejected('Only one todo can be in progress at a time.');
  if (previous) {
    const dropped = previous.todos
      .filter((todo) => todo.status === 'completed' && !ids.has(todo.id))
      .map((todo) => todo.id);
    if (dropped.length > 0) {
      throw new PlanRejected(`Completed todos cannot be deleted: ${dropped.join(', ')}.`);
    }
  }
}

/** Reads one plan file under the shared data lock. `null` when it does not exist. */
export async function readPlan(sessionId: string, slug: string): Promise<StoredPlan | null> {
  return dataLock(async () => readPlanFile(sessionId, slug));
}


/**
 * Stores a plan. The caller passes the document it wants; the store owns the
 * revision (one more than what is stored) and re-validates the whole plan before
 * the file is replaced. `expectedRevision` is what the caller last read: a stale
 * value is rejected instead of overwriting someone else's edit.
 */
export async function writePlan(
  sessionId: string,
  slug: string,
  draft: PlanDraft,
  expectedRevision?: number,
): Promise<StoredPlan> {
  return dataLock(async () => {
    const stored = await readPlanFile(sessionId, slug);
    if (stored && expectedRevision !== stored.plan.revision) {
      throw new PlanRejected(STALE_PLAN_REVISION_MESSAGE);
    }
    const name = typeof draft.name === 'string' ? draft.name.trim() : '';
    const previousById = new Map((stored?.plan.todos ?? []).map((todo) => [todo.id, todo]));
    const now = new Date().toISOString();
    const plan: PlanDocument = {
      name: name || stored?.plan.name || DEFAULT_PLAN_SLUG,
      revision: (stored?.plan.revision ?? 0) + 1,
      // A file written before the timestamps existed adopts them on its next
      // write, so every plan eventually carries both.
      createdAt: stored?.plan.createdAt ?? now,
      updatedAt: now,
      body: typeof draft.body === 'string' ? draft.body : '',
      todos: normalizeTodos(draft.todos, previousById),
    };
    validatePlan(plan, stored?.plan);
    await writePlanFile(sessionId, slug, plan);
    return { slug, plan, markdown: serializePlanMarkdown(plan) };
  });
}




async function readPlanFile(sessionId: string, slug: string): Promise<StoredPlan | null> {
  try {
    const markdown = await readFile(planPath(sessionId, slug), 'utf8');
    return { slug, plan: parsePlanMarkdown(markdown), markdown };
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

/** Same directory temp file plus rename, so a reader never sees a partial plan. */
async function writePlanFile(sessionId: string, slug: string, plan: PlanDocument): Promise<void> {
  const target = planPath(sessionId, slug);
  const directory = path.dirname(target);
  const temporary = `${target}${process.pid}-${Date.now()}${TEMP_SUFFIX}`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, serializePlanMarkdown(plan), 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function normalizeTodos(todos: unknown, previous: Map<string, PlanTodo>): PlanTodo[] {
  if (!Array.isArray(todos)) throw new PlanRejected('Plan todos must be a list.');
  return todos.map((todo) => {
    const source = todo && typeof todo === 'object' ? (todo as PlanTodo) : ({} as PlanTodo);
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    const note = typeof source.note === 'string' ? source.note.trim() : '';
    return {
      id,
      content: typeof source.content === 'string' ? source.content.trim() : '',
      status: isPlanStatus(source.status) ? source.status : ('pending' as PlanStatus),
      // An update that does not mention the evidence keeps the stored note, so a
      // completed step is never demoted to "missing note" by a partial rewrite.
      note: note || previous.get(id)?.note || undefined,
    };
  });
}

function parseFrontMatter(lines: string[]): {
  name: string;
  revision: number;
  todos: PlanTodo[];
  createdAt?: string;
  updatedAt?: string;
} {
  let name = '';
  let revision = 0;
  let createdAt = '';
  let updatedAt = '';
  const todos: PlanTodo[] = [];
  let current: PlanTodo | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const trimmed = line.trim();
    const isItem = trimmed.startsWith('- ');
    const field = splitField(isItem ? trimmed.slice(2) : trimmed);
    if (isItem) {
      // A new todo line: `id` names it, the following indented lines fill it in.
      current = { id: field.key === 'id' ? field.value : '', content: '', status: 'pending' };
      todos.push(current);
      continue;
    }
    if (field.key === 'todos') continue;
    if (field.key === 'name') name = field.value;
    else if (field.key === 'revision') revision = Number.parseInt(field.value, 10) || 0;
    else if (field.key === 'createdAt') createdAt = field.value;
    else if (field.key === 'updatedAt') updatedAt = field.value;
    else if (current && field.key === 'id') current.id = field.value;
    else if (current && field.key === 'content') current.content = field.value;
    else if (current && field.key === 'status') {
      current.status = isPlanStatus(field.value) ? field.value : 'pending';
    } else if (current && field.key === 'note') current.note = field.value || undefined;
  }
  return {
    name,
    revision,
    todos,
    createdAt: createdAt || undefined,
    updatedAt: updatedAt || undefined,
  };
}

/** `id: t1` becomes `['id', 't1']`; the value keeps any later colon. */
function splitField(line: string): { key: string; value: string } {
  const index = line.indexOf(':');
  if (index < 0) return { key: '', value: '' };
  return { key: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
}

function withTodosBlock(body: string, todos: PlanTodo[]): string {
  return `${stripTodosBlock(body).trimEnd()}\n\n${renderTodosBlock(todos)}\n`;
}

/**
 * `- [x] t2 Add the retry note` marks a completed step; every other status keeps
 * an empty box. The block is regenerated from the front matter on every write.
 */
function renderTodosBlock(todos: PlanTodo[]): string {
  const rows = todos.map((todo) => {
    const mark = todo.status === 'completed' ? 'x' : ' ';
    return `- [${mark}] ${todo.id} ${todo.content}`;
  });
  return [TODOS_BLOCK_START, ...rows, TODOS_BLOCK_END].join('\n');
}

/**
 * Drops the generated block so a rewrite cannot keep a stale copy of it, and
 * closes the gap it leaves behind. The result is exactly the body a write will
 * serialize again, so parse and serialize round trip.
 */
function stripTodosBlock(body: string): string {
  const start = body.indexOf(TODOS_BLOCK_START);
  const end = body.indexOf(TODOS_BLOCK_END);
  if (start < 0 || end <= start) return body;
  const before = body.slice(0, start).replace(/\s+$/, '');
  const after = body.slice(end + TODOS_BLOCK_END.length).replace(/^\s+/, '');
  if (!before) return after;
  return after ? `${before}\n\n${after}` : before;
}

function normalizeNewlines(value: string): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';
}