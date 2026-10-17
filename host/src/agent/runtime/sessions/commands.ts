import { COMMAND_NAME_PATTERN, isContextSummary, parseCommand } from '../../../../../shared/commands.ts';
import { readSkills } from '../../../stores/instruction-store.ts';
import { CREATE_SKILL_COMMAND, CREATE_SKILL_INSTRUCTION } from '@@prompts/builtin-skills/create-skill.ts';

export async function expandCommand(content: string): Promise<string> {
  const command = parseCommand(content);
  if (!command || isContextSummary(content)) return content;

  const name = command.name.toLowerCase();
  if (!COMMAND_NAME_PATTERN.test(command.name)) return content;

  if (name === CREATE_SKILL_COMMAND) {
    return joinInstruction(CREATE_SKILL_INSTRUCTION, command.rest);
  }
  const skills = await readSkills();
  const skill = skills.find((item) => item.name.toLowerCase() === name && COMMAND_NAME_PATTERN.test(item.name));
  if (!skill) return content;
  return joinInstruction(skill.content, command.rest);
}

function joinInstruction(instruction: string, rest: string): string {
  return rest ? `${instruction}\n\n${rest}` : instruction;
}
