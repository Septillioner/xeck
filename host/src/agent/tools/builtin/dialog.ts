import { z } from 'zod';
import { requestUserInput } from '../../runtime/events/dialogs.ts';
import type { BuiltinToolDef, ToolCallContext, ToolResult } from './types.ts';

export const ASK_QUESTION_TOOL = 'ask_question';

export const DIALOG_TOOLS: BuiltinToolDef[] = [
  {
    name: ASK_QUESTION_TOOL,
    description:
      'Ask the user a question and wait for a typed answer in the UI. Use yes_no for confirmation, multiple_select for several choices, or text for free-form input.',
    inputSchema: {
      question: z.string().describe('The question to ask the user'),
      type: z.enum(['yes_no', 'multiple_select', 'text']).optional().describe('Answer type; defaults to text'),
      options: z.array(z.string()).min(1).optional().describe('Choices for multiple_select'),
      allowOther: z.boolean().optional().describe('Allow an Other free-text answer for multiple_select'),
    },
    hostMessage: 'The question is answered in the chat.',
    execute: executeAskQuestion,
  },
];

async function executeAskQuestion(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolResult> {
  const question = typeof args?.question === 'string' ? args.question.trim() : '';
  if (!question) {
    return { content: JSON.stringify({ error: 'Question is required.' }), isError: true };
  }
  if (!context?.sessionId) {
    return { content: JSON.stringify({ error: 'No active session to ask the question.' }), isError: true };
  }
  const type = args?.type === 'yes_no' || args?.type === 'multiple_select' || args?.type === 'text'
    ? args.type
    : 'text';
  const options = Array.isArray(args?.options)
    ? args.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0).map((option) => option.trim())
    : undefined;
  if (type === 'multiple_select' && (!options || options.length === 0)) {
    return { content: JSON.stringify({ error: 'multiple_select requires at least one option.' }), isError: true };
  }
  const response = await requestUserInput({
    sessionId: context.sessionId,
    signal: context.abortSignal,
    title: 'Question from Xeck',
    prompt: question,
    type,
    options,
    allowOther: args?.allowOther === true,
  });
  if (response === null) {
    return { content: JSON.stringify({ error: 'User dismissed the question without an answer.' }), isError: true };
  }
  return { content: JSON.stringify({ question, type, answer: response }), isError: false };
}
