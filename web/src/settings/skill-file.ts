import { t } from '../i18n/index.ts';
import type { SkillRecord } from '../../../shared/types.ts';

const FRONT_MATTER_FENCE = /^-{3,}$/;
const FIELD_LINE = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;
const BLOCK_SCALAR = /^([>|])[+-]?$/;
const NAME_FIELD = 'name';
const DESCRIPTION_FIELD = 'description';
const MISSING_FENCE = 'Skill file needs a front matter fence';
const MISSING_CLOSE = 'Skill file needs a closing front matter fence';
const MISSING_FIELDS = "Name and description are required";
const MISSING_BODY = "Instructions are required";

export function parseSkillFile(source: string): { skill: SkillRecord } | { error: string } {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let open = 0;
  while (open < lines.length && lines[open].trim() === '') open += 1;
  if (open >= lines.length || !FRONT_MATTER_FENCE.test(lines[open].trim())) return { error: MISSING_FENCE };

  let close = open + 1;
  while (close < lines.length && !FRONT_MATTER_FENCE.test(lines[close].trim())) close += 1;
  if (close >= lines.length) return { error: MISSING_CLOSE };

  const fields = readFields(lines.slice(open + 1, close));
  const name = fields[NAME_FIELD]?.trim() ?? '';
  const description = fields[DESCRIPTION_FIELD]?.trim() ?? '';
  const content = lines.slice(close + 1).join('\n').trim();
  if (!name || !description) return { error: MISSING_FIELDS };
  if (!content) return { error: MISSING_BODY };
  return { skill: { name, description, content } };
}

function readFields(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '' || /^\s/.test(line)) {
      index += 1;
      continue;
    }
    const match = FIELD_LINE.exec(line);
    if (!match) {
      index += 1;
      continue;
    }
    const key = match[1];
    const raw = match[2].trim();
    if (BLOCK_SCALAR.test(raw)) {
      const folded = raw.startsWith('>');
      const block: string[] = [];
      index += 1;
      while (index < lines.length && (lines[index].trim() === '' || /^\s/.test(lines[index]))) {
        block.push(lines[index]);
        index += 1;
      }
      fields[key] = joinBlock(block, folded);
      continue;
    }
    if (!raw) {
      index += 1;
      while (index < lines.length && (lines[index].trim() === '' || /^\s/.test(lines[index]))) index += 1;
      continue;
    }
    fields[key] = unquote(raw);
    index += 1;
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
