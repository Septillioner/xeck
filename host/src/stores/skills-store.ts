import fs from 'node:fs/promises';
import path from 'node:path';
import type { SkillRecord } from '../../../shared/types.ts';
import { fileExists, readDirSafe, readFileSafe } from '../infra/fs-safe.ts';
import {
  MAX_SKILL_CONTENT_LENGTH,
  MAX_SKILL_COUNT,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_SKILL_NAME_LENGTH,
  MIGRATED_EXTENSION,
  SKILL_ALT_FILE_NAME,
  SKILL_FILE_NAME,
} from '../infra/limits.ts';
import { legacySkillsPath, skillsDir } from '../infra/data-dir.ts';
import { readJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { InstructionRejected, recordList } from './instruction-support.ts';

/** Serializes read-modify-write on skills/ so two writers cannot drop each other's folders. */
const exclusive = createMutex();
let skillsMigrated = false;

/** Skill folders written by an older version were prefixed with an index. */
const SKILL_DIR_INDEX = /^\d+-/;

export async function readSkills(): Promise<SkillRecord[]> {
  return exclusive(() => loadSkills());
}

export async function writeSkills(value: unknown): Promise<SkillRecord[]> {
  return exclusive(async () => {
    const skills = normalizeSkillsInput(value);
    await migrateSkillsOnce();
    await syncSkillsToDisk(skills);
    return skills;
  });
}

export async function writeSkill(input: SkillRecord): Promise<SkillRecord> {
  return exclusive(async () => {
    const skill = requireSkill(input);
    const skills = await loadSkills();
    const index = skills.findIndex((item) => item.name === skill.name);
    if (index < 0 && skills.length >= MAX_SKILL_COUNT) {
      throw new InstructionRejected(`Cannot add a skill; the limit is ${MAX_SKILL_COUNT}`);
    }
    const next = [...skills];
    if (index < 0) next.push(skill);
    else next[index] = skill;
    await syncSkillsToDisk(next);
    return skill;
  });
}

export async function removeSkill(name: string): Promise<SkillRecord> {
  return exclusive(async () => {
    const skillName = name.trim();
    const skills = await loadSkills();
    const skill = skills.find((item) => item.name === skillName);
    if (!skill) throw new InstructionRejected(`Unknown skill: ${skillName}`);
    await syncSkillsToDisk(skills.filter((item) => item.name !== skillName));
    return skill;
  });
}

// -- Migration ----------------------------------------------------------------

async function migrateSkillsOnce(): Promise<void> {
  if (skillsMigrated) return;
  const legacy = legacySkillsPath();
  const migrated = legacy + MIGRATED_EXTENSION;
  if (!await fileExists(legacy) || await fileExists(migrated)) {
    skillsMigrated = true;
    return;
  }
  if (!await skillsDirHasEntries()) {
    const data = await readJson<unknown>(legacy, { skills: [] });
    const skills = normalizeSkillsInput(data);
    if (skills.length > 0) await syncSkillsToDisk(skills);
  }
  await fs.rename(legacy, migrated);
  skillsMigrated = true;
}

// -- Disk I/O -----------------------------------------------------------------

async function loadSkills(): Promise<SkillRecord[]> {
  await migrateSkillsOnce();
  if (await indexedSkillDirs()) await syncSkillsToDisk(await readSkillRecords());
  return readSkillRecords();
}

async function readSkillRecords(): Promise<SkillRecord[]> {
  const dir = skillsDir();
  const entries = await readDirSafe(dir);
  const skillDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const skills: SkillRecord[] = [];
  const seen = new Set<string>();
  for (const name of skillDirs) {
    const content = await readSkillSource(dir, name);
    if (!content) continue;
    const parsed = parseSkillMd(content);
    if (!parsed || seen.has(parsed.name)) continue;
    seen.add(parsed.name);
    skills.push(parsed);
  }
  return skills;
}

/** Wipe and rewrite the entire skills/ directory to match the given array. */
async function syncSkillsToDisk(skills: SkillRecord[]): Promise<void> {
  const dir = skillsDir();
  await fs.mkdir(dir, { recursive: true });

  const usedSlugs = new Set<string>();
  const nextDirs = new Set<string>();
  for (const skill of skills) {
    const folder = uniqueSlug(sanitizeDirName(skill.name), usedSlugs);
    usedSlugs.add(folder);
    nextDirs.add(folder);
    const skillDir = path.join(dir, folder);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, SKILL_FILE_NAME), serializeSkillMd(skill), 'utf8');
  }

  const existing = await readDirSafe(dir);
  for (const entry of existing) {
    if (entry.isDirectory() && !nextDirs.has(entry.name)) {
      await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
    }
  }
}

async function indexedSkillDirs(): Promise<boolean> {
  const entries = await readDirSafe(skillsDir());
  return entries.some((entry) => entry.isDirectory() && SKILL_DIR_INDEX.test(entry.name));
}

async function skillsDirHasEntries(): Promise<boolean> {
  const entries = await readDirSafe(skillsDir());
  return entries.some((entry) => entry.isDirectory());
}

async function readSkillSource(dir: string, folder: string): Promise<string | null> {
  const primary = await readFileSafe(path.join(dir, folder, SKILL_FILE_NAME));
  if (primary) return primary;
  return readFileSafe(path.join(dir, folder, SKILL_ALT_FILE_NAME));
}

// -- SKILL.md serialization --------------------------------------------------

function serializeSkillMd(skill: SkillRecord): string {
  const escapedName = skill.name.includes(':') || skill.name.includes('"')
    ? `"${skill.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : skill.name;
  const escapedDescription = skill.description.includes('\n')
    ? `|\n  ${skill.description.replace(/\n/g, '\n  ')}`
    : skill.description;

  return `---\nname: ${escapedName}\ndescription: ${escapedDescription}\n---\n${skill.content}\n`;
}

function parseSkillMd(source: string): SkillRecord | null {
  const text = source.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  let open = 0;
  while (open < lines.length && lines[open].trim() === '') open++;
  if (open >= lines.length || !/^-{3,}$/.test(lines[open].trim())) return null;

  let close = open + 1;
  while (close < lines.length && !/^-{3,}$/.test(lines[close].trim())) close++;
  if (close >= lines.length) return null;

  const fields = parseFrontMatterFields(lines.slice(open + 1, close));
  const name = fields.name?.trim() ?? '';
  const description = fields.description?.trim() ?? '';
  const content = lines.slice(close + 1).join('\n').trim();

  if (!name || !description || !content) return null;
  return { name, description, content };
}

/**
 * Just enough front matter for the fields this app writes: flat `key: value` rows,
 * quoted values, and literal/folded block scalars. Anything else is skipped.
 */
function parseFrontMatterFields(lines: string[]): Record<string, string> {
  const FIELD_LINE = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;
  const BLOCK_SCALAR = /^([>|])[+-]?$/;
  const fields: Record<string, string> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '' || /^\s/.test(line)) {
      index++;
      continue;
    }
    const match = FIELD_LINE.exec(line);
    if (!match) {
      index++;
      continue;
    }
    const key = match[1];
    const raw = match[2].trim();
    if (BLOCK_SCALAR.test(raw)) {
      const folded = raw.startsWith('>');
      const block: string[] = [];
      index++;
      while (index < lines.length && (lines[index].trim() === '' || /^\s/.test(lines[index]))) {
        block.push(lines[index]);
        index++;
      }
      fields[key] = joinBlock(block, folded);
      continue;
    }
    if (!raw) {
      index++;
      while (index < lines.length && (lines[index].trim() === '' || /^\s/.test(lines[index]))) index++;
      continue;
    }
    fields[key] = unquote(raw);
    index++;
  }
  return fields;
}

function joinBlock(lines: string[], folded: boolean): string {
  let indent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const width = line.match(/^[ \t]*/)?.[0].length ?? 0;
    indent = Math.min(indent, width);
  }
  if (!Number.isFinite(indent)) return '';
  const stripped = lines.map((line) => (line.trim() === '' ? '' : line.slice(indent)));
  if (!folded) return stripped.join('\n').trim();

  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of stripped) {
    if (line.trim() === '') {
      if (current.length > 0) paragraphs.push(current.join(' '));
      current = [];
      continue;
    }
    current.push(line.trim());
  }
  if (current.length > 0) paragraphs.push(current.join(' '));
  return paragraphs.join('\n').trim();
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

// -- Normalization -----------------------------------------------------------

function requireSkill(input: SkillRecord): SkillRecord {
  const name = input.name.trim();
  const description = input.description.trim();
  const content = input.content.trim();
  if (!name || !description || !content) {
    throw new InstructionRejected('Skill requires name, description, and content');
  }
  if (name.length > MAX_SKILL_NAME_LENGTH) {
    throw new InstructionRejected(`Skill name is longer than ${MAX_SKILL_NAME_LENGTH} characters`);
  }
  if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    throw new InstructionRejected(`Skill description is longer than ${MAX_SKILL_DESCRIPTION_LENGTH} characters`);
  }
  if (content.length > MAX_SKILL_CONTENT_LENGTH) {
    throw new InstructionRejected(`Skill content is longer than ${MAX_SKILL_CONTENT_LENGTH} characters`);
  }
  return { name, description, content };
}

function normalizeSkillsInput(value: unknown): SkillRecord[] {
  const rows = Array.isArray(value) ? value : recordList(value, 'skills');
  const byName = new Map<string, SkillRecord>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const skill = row as Partial<SkillRecord>;
    const name = typeof skill.name === 'string' ? skill.name.trim() : '';
    const description = typeof skill.description === 'string' ? skill.description.trim() : '';
    const content = typeof skill.content === 'string' ? skill.content.trim() : '';
    if (!name || !description || !content) continue;
    byName.set(name, { name, description, content });
  }
  return [...byName.values()];
}

/** Sanitize a name for use as a directory name. */
function sanitizeDirName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '_')
    .slice(0, MAX_SKILL_NAME_LENGTH) || '_';
}

/** Deduplicate a folder name within a set of already-used ones. */
function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}