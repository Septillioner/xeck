import { z } from 'zod';
import { readSkills, removeSkill, writeSkill } from '../../../stores/instruction-store.ts';
import { runTool, serverToolResult } from './results.ts';
import type { BuiltinToolDef } from './types.ts';

export const LIST_SKILLS_TOOL = 'list_skills';
export const WRITE_SKILL_TOOL = 'write_skill';
export const REMOVE_SKILL_TOOL = 'remove_skill';

const APPLIES_ON_NEXT_MESSAGE = 'Applies on the next message.';

export const SKILL_TOOLS: BuiltinToolDef[] = [
  {
    name: LIST_SKILLS_TOOL,
    description: 'List saved skills, including each body.',
    handler: async () => serverToolResult({ skills: await readSkills() }),
  },
  {
    name: WRITE_SKILL_TOOL,
    description: 'Create or replace a skill by name. It applies on the next message. Name, description, and body are required.',
    inputSchema: {
      name: z.string().describe('Skill name'),
      description: z.string().describe('When to use the skill'),
      content: z.string().describe('Skill body'),
    },
    handler: async ({ name, description, content }) =>
      runTool(() => writeSkill({ name, description, content }).then((skill) => ({ skill, message: APPLIES_ON_NEXT_MESSAGE }))),
  },
  {
    name: REMOVE_SKILL_TOOL,
    description: 'Remove a skill by name. It applies on the next message.',
    inputSchema: { name: z.string().describe('Skill name') },
    handler: async ({ name }) => runTool(() => removeSkill(name).then((skill) => ({ skill, message: APPLIES_ON_NEXT_MESSAGE }))),
  },
];
