import { z } from 'zod';
import { isPlanStatus, type PlanStatus, type PlanTodo } from '../../../../../shared/types.ts';
import { PlanRejected } from '../../../plans/plan-store.ts';
import type { TodoUpdate } from '../../../plans/plan-service.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const PLAN_WRITE_TOOL = 'plan_write';
export const PLAN_READ_TOOL = 'plan_read';
export const TODO_UPDATE_TOOL = 'todo_update';
export const TODO_ADD_TOOL = 'todo_add';
export const PLAN_TOOL_NAMES = [PLAN_WRITE_TOOL, PLAN_READ_TOOL, TODO_UPDATE_TOOL, TODO_ADD_TOOL] as const;

/**
 * Plan tools are host tools: they know which session asked and return a plan
 * snapshot the chat can draw. The in-memory server only declares them; every
 * write and read happens through the bridge so the session id travels along.
 */
export const PLAN_TOOLS: BuiltinToolDef[] = [
  {
    name: PLAN_WRITE_TOOL,
    description:
      'Create the plan for this chat, or replace it. Name, body, and the full todo list are required; send the revision from the last plan_read or plan_write so a newer plan is never overwritten. Mark a step completed only with a short note as evidence, keep one step in progress at a time, and keep completed steps in the list. When todo_update is not allowed, every step is saved as pending, whatever status you send.',

    inputSchema: {
      name: z.string().describe('Short plan title'),
      body: z.string().describe('Plan markdown without the todo list; the host renders the todos'),
      todos: z
        .array(
          z.object({
            id: z.string().describe('Unique step id such as t1'),
            content: z.string().describe('Step text, under 120 characters'),
            status: z
              .enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled'])
              .describe('Step status'),
            note: z.string().optional().describe('Evidence for completed, reason for blocked'),
          }),
        )
        .describe('Every step of the plan, in order'),
      revision: z.number().int().optional().describe('Revision returned by the last plan_read or plan_write'),
    },
    hostMessage: 'The plan is stored by the host.',
    execute: (args, context) => executePlanWrite(args, context),
  },
  {
    name: PLAN_READ_TOOL,
    description:
      'Read the current plan markdown and the status of every step. The tail line and the snapshot from todo_update already tell you which step is next; only call this when that information is missing from context.',
    inputSchema: {},
    hostMessage: 'The plan is read by the host.',
    execute: (args, context) => executePlanRead(args, context),
  },
  {
    name: TODO_UPDATE_TOOL,
    description:
      'Update the status of existing steps in one call. Send the whole batch so finishing a step and starting the next one costs one round. Completed needs a short note as evidence, blocked needs a note with the reason, and only one step may be in progress. The result includes the full snapshot so you do not need plan_read after this.',
    inputSchema: {
      updates: z
        .array(
          z.object({
            id: z.string().describe('Step id such as t2'),
            status: z
              .enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled'])
              .describe('New status'),
            note: z.string().optional().describe('Evidence for completed, reason for blocked'),
          }),
        )
        .min(1)
        .describe('Updates applied in order'),
      revision: z.number().int().optional().describe('Revision returned by the last plan_read or plan_write'),
    },
    hostMessage: 'Todo updates are stored by the host.',
    execute: (args, context) => executeTodoUpdate(args, context),
  },

  {
    name: TODO_ADD_TOOL,
    description:
      'Add one pending step to the plan instead of drifting away from it. Use it when the work turns out to need another step.',
    inputSchema: {
      content: z.string().describe('Step text, under 120 characters'),
      afterId: z.string().optional().describe('Insert after this step; append when omitted'),
      revision: z.number().int().optional().describe('Revision returned by the last plan_read or plan_write'),
    },
    hostMessage: 'Todos are stored by the host.',
    execute: (args, context) => executeTodoAdd(args, context),
  },
];


/** Static import would cycle: plan-service reads these tool names while this module is still loading. */
function planService() {
  return import('../../../plans/plan-service.ts');
}

function sessionError(context: ToolCallContext): ToolResult | null {
  if (context.sessionId) return null;
  return { content: JSON.stringify({ error: 'No active session for this plan tool.' }), isError: true };
}

async function executePlanRead(_args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  const missing = sessionError(context);
  if (missing) return missing;
  const { planRead } = await planService();
  return { content: JSON.stringify(await planRead(context.sessionId!)), isError: false };
}

async function executePlanWrite(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  const missing = sessionError(context);
  if (missing) return missing;
  try {
    const { planWrite } = await planService();
    const plan = await planWrite(context.sessionId!, {
      name: text(args.name),
      body: text(args.body),
      todos: planTodoArgs(args.todos),
      revision: revisionArg(args.revision),
    });
    return { content: JSON.stringify({ plan }), isError: false };

  } catch (error) {
    return planRejection(error);
  }
}

async function executeTodoUpdate(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  const missing = sessionError(context);
  if (missing) return missing;
  try {
    const { todoUpdate } = await planService();
    const plan = await todoUpdate(context.sessionId!, todoUpdateArgs(args.updates), revisionArg(args.revision));
    return { content: JSON.stringify({ plan }), isError: false };
  } catch (error) {
    return planRejection(error);
  }
}

async function executeTodoAdd(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  const missing = sessionError(context);
  if (missing) return missing;
  try {
    const { todoAdd } = await planService();
    const plan = await todoAdd(context.sessionId!, {
      content: text(args.content),
      afterId: optionalText(args.afterId),
      revision: revisionArg(args.revision),
    });
    return { content: JSON.stringify({ plan }), isError: false };
  } catch (error) {
    return planRejection(error);
  }
}

function planRejection(error: unknown): ToolResult {
  if (error instanceof PlanRejected) {
    return { content: JSON.stringify({ error: error.message }), isError: true };
  }
  throw error;
}


function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | undefined {
  const result = text(value).trim();
  return result || undefined;
}

function revisionArg(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function planTodoArgs(value: unknown): PlanTodo[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const todo = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    return {
      id: text(todo.id),
      content: text(todo.content),
      status: isPlanStatus(todo.status) ? todo.status : 'pending',
      note: optionalText(todo.note),
    };
  });
}

function todoUpdateArgs(value: unknown): TodoUpdate[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const update = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    return {
      id: text(update.id),
      status: isPlanStatus(update.status) ? update.status : ('pending' as PlanStatus),
      note: optionalText(update.note),
    };
  });
}
