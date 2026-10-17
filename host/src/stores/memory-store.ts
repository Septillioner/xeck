import { xeckSource } from '../domain/legacy-brand.ts';
import { randomUUID } from 'node:crypto';
import { isMemoryType, RULE_SOURCES, type MemoryRecord, type MemoryType, type RuleSource } from '../../../shared/types.ts';
import {
  DEFAULT_MEMORY_LIST_LIMIT,
  DEFAULT_MEMORY_SEARCH_LIMIT,
  MAX_MEMORY_CONTENT_LENGTH,
  MAX_MEMORY_COUNT,
  MAX_MEMORY_ID_LENGTH,
  MAX_MEMORY_LIST_LIMIT,
  MAX_MEMORY_QUERY_LENGTH,
  MAX_MEMORY_SEARCH_LIMIT,
  MAX_MEMORY_TAG_COUNT,
  MAX_MEMORY_TAG_LENGTH,
  MAX_MEMORY_TITLE_LENGTH,
  MEMORY_SNIPPET_CHARS,
} from '../infra/limits.ts';
import { memoriesPath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';

const exclusive = createMutex();
const MEMORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export class MemoryRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryRejected';
  }
}

export interface MemoryListItem {
  id: string;
  title: string;
  type: MemoryType;
  tags: string[];
  source: RuleSource;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySearchHit {
  id: string;
  title: string;
  snippet: string;
}

export interface MemoryWriteResult {
  id: string;
  status: 'created' | 'updated' | 'deleted';
}

interface MemoryDraft {
  id?: string;
  title: string;
  content: string;
  type?: string;
  tags?: unknown;
  source?: string;
}

export async function readMemories(): Promise<MemoryRecord[]> {
  return exclusive(() => loadMemories());
}

export async function writeMemories(value: unknown): Promise<MemoryRecord[]> {
  return exclusive(async () => {
    const current = await loadMemories();
    const next = reconcileMemories(value, current, Date.now());
    await saveMemories(next);
    return next;
  });
}

export async function upsertMemory(input: MemoryDraft): Promise<MemoryWriteResult> {
  return exclusive(async () => {
    const current = await loadMemories();
    const byId = new Map(current.map((memory) => [memory.id, memory]));
    const applied = applyDraft(input, byId, Date.now());
    if (applied.status === 'created' && current.length >= MAX_MEMORY_COUNT) {
      throw new MemoryRejected(`Cannot add a memory; the limit is ${MAX_MEMORY_COUNT}`);
    }
    const next = current.filter((memory) => memory.id !== applied.record.id);
    next.push(applied.record);
    await saveMemories(next);
    return { id: applied.record.id, status: applied.status };
  });
}

export async function deleteMemory(id: string): Promise<MemoryWriteResult> {
  return exclusive(async () => {
    const memoryId = requireId(id);
    const current = await loadMemories();
    if (!current.some((memory) => memory.id === memoryId)) {
      throw new MemoryRejected(`Memory ${memoryId} not found`);
    }
    await saveMemories(current.filter((memory) => memory.id !== memoryId));
    return { id: memoryId, status: 'deleted' };
  });
}

export async function getMemory(id: string): Promise<MemoryRecord> {
  return exclusive(async () => {
    const memoryId = requireId(id);
    const memory = (await loadMemories()).find((item) => item.id === memoryId);
    if (!memory) throw new MemoryRejected(`Memory ${memoryId} not found`);
    return memory;
  });
}

export async function listMemories(options: {
  type?: string;
  tag?: string;
  limit?: number;
} = {}): Promise<{ memories: MemoryListItem[]; truncated?: true }> {
  return exclusive(async () => {
    const type = options.type === undefined ? undefined : requireType(options.type);
    const tag = options.tag === undefined ? undefined : requireTag(options.tag);
    const limit = boundedLimit(options.limit, DEFAULT_MEMORY_LIST_LIMIT, MAX_MEMORY_LIST_LIMIT);
    const matches = (await loadMemories()).filter((memory) => matchesList(memory, type, tag));
    const memories = matches.slice(0, limit).map(toListItem);
    return matches.length > memories.length ? { memories, truncated: true } : { memories };
  });
}

export async function searchMemories(
  query: string,
  limit?: number,
): Promise<{ results: MemorySearchHit[]; truncated?: true }> {
  return exclusive(async () => {
    const needle = requireQuery(query);
    const maximum = boundedLimit(limit, DEFAULT_MEMORY_SEARCH_LIMIT, MAX_MEMORY_SEARCH_LIMIT);
    const matches = (await loadMemories()).filter((memory) => matchesQuery(memory, needle));
    const results = matches.slice(0, maximum).map((memory) => ({
      id: memory.id,
      title: memory.title,
      snippet: snippetFor(memory),
    }));
    return matches.length > results.length ? { results, truncated: true } : { results };
  });
}

async function loadMemories(): Promise<MemoryRecord[]> {
  const data = await readJson<unknown>(memoriesPath(), { memories: [] });
  return sanitizeStored(data);
}

async function saveMemories(memories: MemoryRecord[]): Promise<void> {
  await writeJson(memoriesPath(), { memories: [...memories].sort(compareMemories) });
}

function reconcileMemories(value: unknown, current: MemoryRecord[], now: number): MemoryRecord[] {
  if (!Array.isArray(value)) throw new MemoryRejected('Memories must be a list');
  if (value.length > MAX_MEMORY_COUNT) {
    throw new MemoryRejected(`Cannot save more than ${MAX_MEMORY_COUNT} memories`);
  }
  const byId = new Map(current.map((memory) => [memory.id, memory]));
  const seen = new Set<string>();
  const next: MemoryRecord[] = [];
  for (const row of value) {
    const applied = applyDraft(draftFromRow(row), byId, now);
    if (seen.has(applied.record.id)) throw new MemoryRejected(`Duplicate memory id: ${applied.record.id}`);
    seen.add(applied.record.id);
    next.push(applied.record);
  }
  return next;
}

function draftFromRow(value: unknown): MemoryDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MemoryRejected('Memory must be an object');
  }
  const row = value as Partial<MemoryRecord>;
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    title: typeof row.title === 'string' ? row.title : '',
    content: typeof row.content === 'string' ? row.content : '',
    type: typeof row.type === 'string' ? row.type : undefined,
    tags: row.tags,
    source: typeof row.source === 'string' ? row.source : undefined,
  };
}

function applyDraft(
  draft: MemoryDraft,
  current: Map<string, MemoryRecord>,
  now: number,
): { record: MemoryRecord; status: 'created' | 'updated' } {
  const title = requireText(draft.title, 'title', MAX_MEMORY_TITLE_LENGTH);
  const content = requireText(draft.content, 'content', MAX_MEMORY_CONTENT_LENGTH);
  const type = draft.type === undefined ? 'memory' : requireType(draft.type);
  const tags = normalizeTags(draft.tags);
  const source = draft.source === undefined ? existingSource(draft.id, current) : requireSource(draft.source);
  const requestedId = draft.id?.trim() ?? '';
  const id = requestedId ? requireId(requestedId) : randomUUID();
  const existing = current.get(id);
  if (!existing) {
    return {
      record: { id, title, content, type, tags, source, createdAt: now, updatedAt: now },
      status: 'created',
    };
  }
  const unchanged = existing.title === title
    && existing.content === content
    && existing.type === type
    && sameTags(existing.tags, tags)
    && existing.source === source;
  return {
    record: {
      id,
      title,
      content,
      type,
      tags,
      source,
      createdAt: existing.createdAt,
      updatedAt: unchanged ? existing.updatedAt : now,
    },
    status: 'updated',
  };
}

function sanitizeStored(value: unknown): MemoryRecord[] {
  const rows = Array.isArray(value) ? value : recordList(value, 'memories');
  const memories: MemoryRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const memory = readStoredMemory(row);
    if (!memory || seen.has(memory.id)) continue;
    seen.add(memory.id);
    memories.push(memory);
  }
  return memories.sort(compareMemories);
}

function readStoredMemory(value: unknown): MemoryRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<MemoryRecord>;
  const source = typeof row.source === 'string' ? xeckSource(row.source) as RuleSource : 'user';
  if (typeof row.id !== 'string' || !MEMORY_ID_PATTERN.test(row.id) || row.id.length > MAX_MEMORY_ID_LENGTH) return null;
  if (typeof row.title !== 'string' || typeof row.content !== 'string') return null;
  if (typeof row.type !== 'string' || !isMemoryType(row.type)) return null;
  if (!Array.isArray(row.tags) || row.tags.some((tag) => typeof tag !== 'string')) return null;
  if (!isTimestamp(row.createdAt) || !isTimestamp(row.updatedAt)) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    tags: row.tags.map((tag) => tag.trim()).filter(Boolean),
    source: RULE_SOURCES.includes(source) ? source : 'user',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toListItem(memory: MemoryRecord): MemoryListItem {
  return {
    id: memory.id,
    title: memory.title,
    type: memory.type,
    tags: memory.tags,
    source: memory.source,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

function matchesList(memory: MemoryRecord, type: MemoryType | undefined, tag: string | undefined): boolean {
  if (type && memory.type !== type) return false;
  if (tag && !memory.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;
  return true;
}

function matchesQuery(memory: MemoryRecord, query: string): boolean {
  const needle = query.toLowerCase();
  return memory.id.toLowerCase().includes(needle)
    || memory.title.toLowerCase().includes(needle)
    || memory.tags.some((tag) => tag.toLowerCase().includes(needle));
}

function snippetFor(memory: MemoryRecord): string {
  const flat = memory.content.replace(/\s+/g, ' ').trim();
  if (flat.length <= MEMORY_SNIPPET_CHARS) return flat;
  return `${flat.slice(0, MEMORY_SNIPPET_CHARS)}...`;
}

function requireText(value: string, label: string, maximum: number): string {
  const text = value.trim();
  if (!text) throw new MemoryRejected(`Memory ${label} is empty`);
  if (text.length > maximum) throw new MemoryRejected(`Memory ${label} is longer than ${maximum} characters`);
  return text;
}

function requireId(value: string): string {
  const id = value.trim();
  if (!id || id.length > MAX_MEMORY_ID_LENGTH || !MEMORY_ID_PATTERN.test(id)) {
    throw new MemoryRejected('Memory id must contain letters, digits, "_" or "-" and start with a letter or digit');
  }
  return id;
}

function requireType(value: string): MemoryType {
  const type = value.trim();
  if (!isMemoryType(type)) throw new MemoryRejected('Memory type must be memory, rule, decision, or context');
  return type;
}

function requireSource(value: string): RuleSource {
  value = xeckSource(value);
  if (!RULE_SOURCES.includes(value as RuleSource)) {
    throw new MemoryRejected('Memory source must be user or xeck');
  }
  return value as RuleSource;
}

function existingSource(id: string | undefined, current: Map<string, MemoryRecord>): RuleSource {
  return (id ? current.get(id)?.source : undefined) ?? 'user';
}

function requireTag(value: string): string {
  const tag = value.trim();
  if (!tag) throw new MemoryRejected('Memory tag is empty');
  if (tag.length > MAX_MEMORY_TAG_LENGTH) {
    throw new MemoryRejected(`Memory tag is longer than ${MAX_MEMORY_TAG_LENGTH} characters`);
  }
  return tag;
}

function requireQuery(value: string): string {
  const query = value.trim();
  if (!query) throw new MemoryRejected('Memory search query is empty');
  if (query.length > MAX_MEMORY_QUERY_LENGTH) {
    throw new MemoryRejected(`Memory search query is longer than ${MAX_MEMORY_QUERY_LENGTH} characters`);
  }
  return query;
}

function normalizeTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new MemoryRejected('Memory tags must be a list');
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (typeof row !== 'string') throw new MemoryRejected('Memory tags must be strings');
    const tag = row.trim();
    if (!tag) continue;
    if (tag.length > MAX_MEMORY_TAG_LENGTH) {
      throw new MemoryRejected(`Memory tag is longer than ${MAX_MEMORY_TAG_LENGTH} characters`);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > MAX_MEMORY_TAG_COUNT) {
    throw new MemoryRejected(`A memory can have at most ${MAX_MEMORY_TAG_COUNT} tags`);
  }
  return tags;
}

function boundedLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new MemoryRejected(`limit must be an integer from 1 to ${maximum}`);
  }
  return value;
}

function sameTags(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function compareMemories(left: MemoryRecord, right: MemoryRecord): number {
  return right.updatedAt - left.updatedAt || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function recordList(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const rows = (value as Record<string, unknown>)[key];
  return Array.isArray(rows) ? rows : [];
}
