/**
 * Policy satırları: explicit allow/deny, extends yok. `builtin: '*'` workspace'in
 * seçtiği araçların hepsidir. İsim listesi o seçimin alt kümesidir.
 */
import { PolicyDefSchema, type PolicyDef } from '@@core/definitions/policy.ts';
import { ASK_QUESTION_TOOL } from '../tools/builtin/dialog.ts';
import {
  LIST_DIRECTORY_TOOL,
  READ_FILE_TOOL,
  SEARCH_FILES_TOOL,
} from '../tools/builtin/file.ts';
import { LIST_MCPS_TOOL } from '../tools/builtin/mcp.ts';
import { MEMORY_GET_TOOL, MEMORY_LIST_TOOL, MEMORY_SEARCH_TOOL } from '../tools/builtin/memory.ts';
import { PLAN_READ_TOOL, PLAN_WRITE_TOOL, TODO_ADD_TOOL } from '../tools/builtin/plan.ts';
import { LIST_RULES_TOOL } from '../tools/builtin/rules.ts';
import { LIST_SKILLS_TOOL } from '../tools/builtin/skills.ts';

/** Message returned when the model calls a tool the plan policy denies. */
export const PLAN_POLICY_DENIED_REASON =
  'Blocked in plan mode. Plan mode only inspects files and drafts the plan with plan_write. Switch to agent mode to make changes.';

const POLICY_ROWS = [
  {
    id: 'coder-plan',
    label: 'Plan',
    accentColor: '#c2410c',
    allow: {
      builtin: [
        PLAN_WRITE_TOOL,
        PLAN_READ_TOOL,
        TODO_ADD_TOOL,
        ASK_QUESTION_TOOL,
        LIST_RULES_TOOL,
        LIST_SKILLS_TOOL,
        LIST_MCPS_TOOL,
        MEMORY_SEARCH_TOOL,
        MEMORY_GET_TOOL,
        MEMORY_LIST_TOOL,
        READ_FILE_TOOL,
        LIST_DIRECTORY_TOOL,
        SEARCH_FILES_TOOL,
      ],
      mcp: '*',
    },
    maxToolRounds: 100,
    choosable: ['user'],
    entryLine: 'Mode is now plan: write the plan with plan_write before executing.',
    deniedReason: PLAN_POLICY_DENIED_REASON,
  },
  {
    id: 'coder-agent',
    label: 'Agent',
    accentColor: '#71717a',
    allow: { builtin: '*', mcp: '*' },
    deny: [TODO_ADD_TOOL],
    maxToolRounds: 100,
    loop: 'continue-open-steps',
    choosable: ['user'],
    entryLine: 'Mode is now agent: execute the request directly; follow an existing plan when present.',
  },
  {
    id: 'coder-ask',
    label: 'Ask',
    accentColor: '#15803d',
    allow: {
      builtin: [
        LIST_RULES_TOOL,
        LIST_SKILLS_TOOL,
        ASK_QUESTION_TOOL,
        MEMORY_SEARCH_TOOL,
        MEMORY_GET_TOOL,
        MEMORY_LIST_TOOL,
        READ_FILE_TOOL,
        LIST_DIRECTORY_TOOL,
        SEARCH_FILES_TOOL,
      ],
      mcp: '*',
    },
    maxToolRounds: 30,
    choosable: ['user'],
    entryLine: 'Mode is now ask: answer with read-only tools; use ask_question if anything is unclear.',
  },
  {
    id: 'chat',
    label: 'Chat',
    accentColor: '#be185d',
    allow: { builtin: '*', mcp: '*' },
    maxToolRounds: 30,
    choosable: ['user'],
    entryLine: 'Mode is now chat.',
  },
  {
    id: 'xeck-agent',
    label: 'Agent',
    accentColor: '#0e7490',
    allow: { builtin: '*', mcp: '*' },
    deny: [TODO_ADD_TOOL, PLAN_READ_TOOL, PLAN_WRITE_TOOL],
    maxToolRounds: 100,
    loop: 'continue-open-steps',
    choosable: ['user'],
    entryLine: 'Mode is now agent: execute the request directly; follow an existing plan when present.',
  },
  {
    id: 'xeck-ask',
    label: 'Ask',
    accentColor: '#15803d',
    allow: {
      builtin: [ASK_QUESTION_TOOL],
      mcp: [],
    },
    deny: [TODO_ADD_TOOL],
    maxToolRounds: 30,
    choosable: ['user'],
    entryLine: 'Mode is now ask: answer from knowledge and conversation; use ask_question if anything is unclear.',
  },
] as const;

export const XECKBOT_AGENT_POLICY: PolicyDef = PolicyDefSchema.parse({
  id: 'xeckbot-agent',
  label: 'Agent',
  accentColor: '#0e7490',
  allow: { builtin: '*', mcp: '*' },
  deny: [TODO_ADD_TOOL, PLAN_READ_TOOL, PLAN_WRITE_TOOL],
  maxToolRounds: 100,
  choosable: ['user'],
  entryLine: 'Use your individual XeckBot identity and available tools to carry out the request.',
});

export const XECKBOT_ASK_POLICY: PolicyDef = PolicyDefSchema.parse({
  id: 'xeckbot-ask',
  label: 'Ask',
  accentColor: '#15803d',
  allow: { builtin: [ASK_QUESTION_TOOL], mcp: [] },
  maxToolRounds: 30,
  choosable: ['user'],
  entryLine: 'Answer from your XeckBot identity and the current conversation; use ask_question for clarification.',
});

export const POLICIES: PolicyDef[] = [...POLICY_ROWS.map((row) => PolicyDefSchema.parse(row)), XECKBOT_AGENT_POLICY, XECKBOT_ASK_POLICY];

export const POLICY_BY_ID: Record<string, PolicyDef> = Object.fromEntries(
  POLICIES.map((policy) => [policy.id, policy]),
);
