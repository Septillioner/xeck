import { z } from 'zod';
import type { BuiltinToolDef } from './types.ts';

export const LIST_MESSAGE_TARGETS_TOOL = 'list_message_targets';
export const SEND_CHAT_MESSAGE_TOOL = 'send_chat_message';

export const MESSAGING_TOOLS: BuiltinToolDef[] = [
  {
    name: LIST_MESSAGE_TARGETS_TOOL,
    description: 'List recent XeckBots as message targets, with IDs and the busy status of your separate bot-to-bot conversation. Only a XeckBot can use this tool. Listing does not read their transcripts.',
    inputSchema: {},
    hostMessage: 'Chat message targets are listed by the host.',
    execute: async (_args, context) => {
      try {
        const { listMessageTargets } = await import('../../runtime/sessions/messaging.ts');
        return { content: JSON.stringify({ targets: await listMessageTargets(context.sessionId ?? '') }) };
      } catch (error) { return failure(error); }
    },
  },
  {
    name: SEND_CHAT_MESSAGE_TOOL,
    description: 'Send a self-contained message to another XeckBot from list_message_targets. Messages are delivered directly without user confirmation. Delivery runs in a separate persistent conversation shared by the two XeckBots, never in either personal user/bot chat. The recipient uses its own identity and policy and only this pair conversation history. The result includes conversationId. This call waits for its response and returns its status/result/error. Busy pair conversations fail immediately; there is no queue. Do not send to yourself or another chat\'s child. Incoming agent-message turns cannot relay messages. At most four attempts per source turn.',
    inputSchema: {
      sessionId: z.string().min(1).describe('Target chat ID from list_message_targets'),
      content: z.string().trim().min(1).max(10_000).describe('Message to deliver; include context and the requested response'),
    },
    hostMessage: 'Chat messaging is managed by the host.',
    execute: async (args, context) => {
      try {
        if (typeof args.sessionId !== 'string' || typeof args.content !== 'string') throw new Error('A target sessionId and content are required.');
        const { sendChatMessage } = await import('../../runtime/sessions/messaging.ts');
        return { content: JSON.stringify(await sendChatMessage(context.sessionId ?? '', args.sessionId, args.content)) };
      } catch (error) { return failure(error); }
    },
  },
];

function failure(error: unknown) {
  return { content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), isError: true };
}
