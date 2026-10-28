import { z } from 'zod';
import { BOT_COLORS, MAX_BOT_NAME_CHARS, MAX_BOT_PURPOSE_CHARS } from '../../../../../shared/types.ts';
import type { BuiltinToolDef } from './types.ts';

export const CREATE_XECKBOT_TOOL = 'create_xeckbot';
const input = z.object({
  name: z.string().trim().min(1).max(MAX_BOT_NAME_CHARS),
  purpose: z.string().trim().min(1).max(MAX_BOT_PURPOSE_CHARS),
  color: z.enum(BOT_COLORS).default('blue'),
});

export const BOT_TOOLS: BuiltinToolDef[] = [{
  name: CREATE_XECKBOT_TOOL,
  description: 'Create a persistent named XeckBot agent with its own task and generated instructions, visible in the user’s bot list. Use this to fulfill requests to build a team or create a developer, manager or specialist. Available from an active personal Xeck or XeckBot chat in Agent mode. Requested roles suffice; stack, salary and work location are not required. This is not a temporary subagent. Returns its sessionId. Uses the configured default model to generate the identity; does not copy your private history or start a conversation.',
  inputSchema: input.shape,
  hostMessage: 'XeckBot creation is managed by the host.',
  execute: async (args, context) => {
    try {
      const draft = input.parse(args);
      const { createXeckBot } = await import('../../runtime/agents/create-xeckbot.ts');
      return { content: JSON.stringify(await createXeckBot(context.sessionId ?? '', draft, context.abortSignal)) };
    } catch (error) {
      return { content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), isError: true };
    }
  },
}];
