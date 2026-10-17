import { xeckSource } from '../domain/legacy-brand.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RULE_SOURCES, type RuleRecord, type RuleSource } from '../../../shared/types.ts';
import { fileExists, readDirSafe } from '../infra/fs-safe.ts';
import {
  DEFAULT_RULE_SLUG,
  MAX_RULE_COUNT,
  MAX_RULE_TEXT_LENGTH,
  MIGRATED_EXTENSION,
  RULE_FILE_EXTENSION,
  RULE_INDEX_WIDTH,
  RULE_SLUG_MAX_CHARS,
} from '../infra/limits.ts';
import { legacyRulesPath, rulesDir } from '../infra/data-dir.ts';
import { readJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { InstructionRejected, recordList } from './instruction-support.ts';

/** Serializes read-modify-write on rules/ so two writers cannot renumber each other. */
const exclusive = createMutex();
let rulesMigrated = false;

export async function readRules(): Promise<string[]> {
  return exclusive(() => loadRules());
}

export async function readRuleRecords(): Promise<RuleRecord[]> {
  return exclusive(() => loadRuleRecords());
}

export async function writeRules(value: unknown): Promise<string[]> {
  return exclusive(async () => {
    const rules = normalizeRulesInput(value).map((text) => ({ text, source: 'user' as const }));
    await migrateRulesOnce();
    await syncRulesToDisk(rules);
    return rules.map((rule) => rule.text);
  });
}

export async function writeRuleRecords(value: unknown): Promise<RuleRecord[]> {
  return exclusive(async () => {
    const rules = normalizeRuleRecords(value);
    await migrateRulesOnce();
    await syncRulesToDisk(rules);
    return rules;
  });
}

export async function addRule(text: string, source: RuleSource = 'user'): Promise<{ index: number; text: string; source: RuleSource }> {
  return exclusive(async () => {
    const rule = text.trim();
    if (!rule) throw new InstructionRejected('Rule text is empty');
    if (rule.length > MAX_RULE_TEXT_LENGTH) {
      throw new InstructionRejected(`Rule text is longer than ${MAX_RULE_TEXT_LENGTH} characters`);
    }
    const rules = await loadRuleRecords();
    if (rules.some((item) => item.text === rule)) throw new InstructionRejected('Rule already exists');
    if (rules.length >= MAX_RULE_COUNT) {
      throw new InstructionRejected(`Cannot add a rule; the limit is ${MAX_RULE_COUNT}`);
    }
    const next = [...rules, { text: rule, source: requireRuleSource(source) }];
    await syncRulesToDisk(next);
    return { index: next.length - 1, text: rule, source: next[next.length - 1].source };
  });
}

export async function removeRule(index: number): Promise<{ index: number; text: string }> {
  return exclusive(async () => {
    const rules = await loadRuleRecords();
    if (!Number.isInteger(index) || index < 0 || index >= rules.length) {
      throw new InstructionRejected('Rule index is out of range');
    }
    const removed = rules[index];
    const text = removed?.text ?? '';
    const next = rules.filter((_, ruleIndex) => ruleIndex !== index);
    await syncRulesToDisk(next);
    return { index, text, source: removed?.source ?? 'user' };
  });
}

// -- Migration ----------------------------------------------------------------

async function migrateRulesOnce(): Promise<void> {
  if (rulesMigrated) return;
  const legacy = legacyRulesPath();
  const migrated = legacy + MIGRATED_EXTENSION;
  if (!await fileExists(legacy) || await fileExists(migrated)) {
    rulesMigrated = true;
    return;
  }
  // A folder that already has rule files is the source of truth. Importing the json on top of it would bring back replaced rules.
  if (!await rulesDirHasFiles()) {
    const data = await readJson<unknown>(legacy, { rules: [] });
    // Legacy rows are plain strings; normalizeRuleRecords keeps them and stamps the
    // `user` source the same way a fresh legacy rule file is normalized on read.
    const rules = normalizeRuleRecords(data);
    if (rules.length > 0) await syncRulesToDisk(rules);
  }
  await fs.rename(legacy, migrated);
  rulesMigrated = true;
}

// -- Disk I/O -----------------------------------------------------------------

async function loadRules(): Promise<string[]> {
  return (await loadRuleRecords()).map((rule) => rule.text);
}

async function loadRuleRecords(): Promise<RuleRecord[]> {
  await migrateRulesOnce();
  const dir = rulesDir();
  const entries = await readDirSafe(dir);
  const mdFiles = entries
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith(RULE_FILE_EXTENSION))
    .map((entry) => entry.name)
    .sort();

  const rules: RuleRecord[] = [];
  for (const file of mdFiles) {
    const text = (await fs.readFile(path.join(dir, file), 'utf8')).trim();
    const parsed = parseRuleFile(text);
    if (parsed) rules.push(parsed);
  }
  return rules;
}

/** Wipe and rewrite the entire rules/ directory to match the given array. */
async function syncRulesToDisk(rules: RuleRecord[]): Promise<void> {
  const dir = rulesDir();
  await fs.mkdir(dir, { recursive: true });

  // Clear existing files
  const existing = await readDirSafe(dir);
  for (const entry of existing) {
    if (!entry.isDirectory() && entry.name.endsWith(RULE_FILE_EXTENSION)) {
      await fs.unlink(path.join(dir, entry.name));
    }
  }

  // Write each rule as a numbered .md file
  const usedSlugs = new Set<string>();
  for (let i = 0; i < rules.length; i++) {
    const slug = uniqueSlug(ruleSlug(rules[i].text, i), usedSlugs);
    usedSlugs.add(slug);
    const fileName = `${String(i).padStart(RULE_INDEX_WIDTH, '0')}-${slug}${RULE_FILE_EXTENSION}`;
    await fs.writeFile(path.join(dir, fileName), formatRuleFile(rules[i]), 'utf8');
  }
}

async function rulesDirHasFiles(): Promise<boolean> {
  const entries = await readDirSafe(rulesDir());
  return entries.some((entry) => !entry.isDirectory() && entry.name.endsWith(RULE_FILE_EXTENSION));
}

function parseRuleFile(value: string): RuleRecord | null {
  const match = /^---\s*\nsource:\s*(user|xeck|poyraz)\s*\n---\s*\n([\s\S]*)$/i.exec(value);
  if (!match) return value ? { text: value, source: 'user' } : null;
  const text = match[2].trim();
  return text ? { text, source: xeckSource(match[1].toLowerCase()) as RuleSource } : null;
}

function formatRuleFile(rule: RuleRecord): string {
  return `---\nsource: ${rule.source}\n---\n${rule.text}\n`;
}

function ruleSlug(text: string, index: number): string {
  const firstLine = text.split('\n')[0] ?? '';
  const slug = firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, RULE_SLUG_MAX_CHARS);
  return slug || `${DEFAULT_RULE_SLUG}-${index}`;
}

/** Deduplicate a slug within a set of already-used slugs. */
function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

// -- Normalization -----------------------------------------------------------

function normalizeRulesInput(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : recordList(value, 'rules');
  const rules: string[] = [];
  for (const row of rows) {
    const text = typeof row === 'string' ? row.trim() : '';
    if (text) rules.push(text);
  }
  return rules;
}

function normalizeRuleRecords(value: unknown): RuleRecord[] {
  const rows = Array.isArray(value) ? value : recordList(value, 'rules');
  const rules: RuleRecord[] = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      const text = row.trim();
      if (text) rules.push({ text, source: 'user' });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const item = row as Partial<RuleRecord>;
    const source = typeof item.source === 'string' ? xeckSource(item.source) as RuleSource : 'user';
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!text) continue;
    rules.push({
      text,
      source: RULE_SOURCES.includes(source) ? source : 'user',
    });
  }
  return rules;
}

function requireRuleSource(value: string): RuleSource {
  value = xeckSource(value);
  if (!RULE_SOURCES.includes(value as RuleSource)) {
    throw new InstructionRejected('Rule source must be user or xeck');
  }
  return value as RuleSource;
}
