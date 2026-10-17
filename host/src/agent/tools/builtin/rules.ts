import { z } from 'zod';
import { addRule, readRuleRecords, removeRule } from '../../../stores/instruction-store.ts';
import { runTool, serverToolResult } from './results.ts';
import type { BuiltinToolDef } from './types.ts';

export const LIST_RULES_TOOL = 'list_rules';
export const ADD_RULE_TOOL = 'add_rule';
export const REMOVE_RULE_TOOL = 'remove_rule';

const APPLIES_ON_NEXT_MESSAGE = 'Applies on the next message.';

export const RULE_TOOLS: BuiltinToolDef[] = [
  {
    name: LIST_RULES_TOOL,
    description: 'List saved rules with their indexes.',
    handler: async () => serverToolResult({ rules: (await readRuleRecords()).map((rule, index) => ({ index, ...rule })) }),
  },
  {
    name: ADD_RULE_TOOL,
    description:
      'Append one rule. It applies on the next message. Empty text, an exact duplicate, and a rule past the size or count limit are rejected.',
    inputSchema: { text: z.string().describe('Rule text') },
    handler: async ({ text }) =>
      runTool(() => addRule(text, 'xeck').then((added) => ({ ...added, message: APPLIES_ON_NEXT_MESSAGE }))),
  },
  {
    name: REMOVE_RULE_TOOL,
    description: 'Remove the rule at an index from list_rules. It applies on the next message.',
    inputSchema: { index: z.number().int().describe('Zero-based index from list_rules') },
    handler: async ({ index }) =>
      runTool(() => removeRule(index).then((removed) => ({ ...removed, message: APPLIES_ON_NEXT_MESSAGE }))),
  },
];
