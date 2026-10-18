import { type BuiltinInstructionDef } from './schema.ts';
import { CORE_BASE, CORE_IDENTITY, CORE_MEMORY, CORE_RULES, CORE_SKILLS, CORE_SUBAGENT } from './core.ts';
import { CODER_AGENT, CODER_CORE, CODER_IDENTITY, CODER_PLAN, CODER_SUBAGENT } from './coder.ts';
import { XECK_BASE, XECK_IDENTITY } from './xeck.ts';
import { XECKBOT_BASE, XECKBOT_IDENTITY } from './xeckbot.ts';
import { SUBAGENT_TASK, SUBAGENT_CODER, SUBAGENT_GENERAL } from './subagent.ts';

export const BUILTIN_INSTRUCTIONS: readonly BuiltinInstructionDef[] = [
  CORE_IDENTITY,
  CORE_BASE,
  CORE_RULES,
  CORE_SKILLS,
  CORE_MEMORY,
  CORE_SUBAGENT,
  SUBAGENT_TASK,
  SUBAGENT_CODER,
  SUBAGENT_GENERAL,
  CODER_IDENTITY,
  CODER_CORE,
  CODER_PLAN,
  CODER_AGENT,
  CODER_SUBAGENT,
  XECK_BASE,
  XECK_IDENTITY,
  XECKBOT_BASE,
  XECKBOT_IDENTITY,
];

const BY_ID = new Map(BUILTIN_INSTRUCTIONS.map((def) => [def.id, def]));

/** Kayit sirasi. Agent `instructions` validasyonu burayi okur. */
export function registeredBuiltinInstructionIds(): readonly string[] {
  return BUILTIN_INSTRUCTIONS.map((def) => def.id);
}

export function isBuiltinInstructionId(id: string): boolean {
  return BY_ID.has(id);
}

function builtinInstructionText(id: string): string[] {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Instruction '${id}' is not registered.`);
  return [...found.text];
}

/** Sirali birlestirip tekrarlari atar; ilk gecen sira korunur. */
function resolveIds(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Agent instruction metni: agent `instructions` -> katalog metni.
 * Built-in ayarı kapalıysa yalnız agent'a özgü instruction'lar kalır.
 */
export function buildAgentIdentityText(agentInstructions: readonly string[], includeCore = true): string {
  const blocks: string[] = [];
  for (const id of resolveIds([...agentInstructions]).filter((entry) => includeCore || !entry.startsWith('core.'))) {
    for (const line of builtinInstructionText(id)) {
      if (line.trim()) blocks.push(line);
    }
  }
  return blocks.join('\n\n');
}

