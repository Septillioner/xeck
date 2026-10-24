import { ChatAbortedError, isToolUseUnsupportedError, type Agent, type TokenUsage, type ContinuationOutcome, type CompiledRequest, type ContextEstimate } from 'poyraz';
import type { ContextParts, LibraryMessage, ModelProfile } from '../../../../../shared/types.ts';
import type { ImageAttachment } from '../../../../../shared/images.ts';
import { messagesFromAgent } from '../../../stores/sessions.ts';
import { withContextParts, type HostStreamEvent } from '../../../domain/stream-events.ts';
import { prepareSessionAgent, type AgentSetupInput, type SessionAgent } from './setup.ts';
import type { AgentTurn } from './pool.ts';

const modelsWithoutToolUse = new Set<string>();
/** Library execution result consumed by the session lifecycle. */
export interface ChatTurnResult {
  aborted: boolean;
  content: string;
  usage: TokenUsage;
  contextUsage?: TokenUsage;
  /** Context breakdown from the library meter: the provider's figures when a request completed, else the estimate. */
  contextParts: ContextParts;
  /** Set when a continuation policy ran: how often it continued and why it stopped. */
  continuation?: ContinuationOutcome;
  libraryMessages: LibraryMessage[];
}

interface AgentTurnInput extends AgentSetupInput {
  turn: AgentTurn;
  onEvent: (event: HostStreamEvent) => void;
}

export async function summarizeChat(input: AgentTurnInput): Promise<{ aborted: boolean; libraryMessages: LibraryMessage[]; contextParts: ContextParts }> {
  const { agent } = await input.turn.getAgent(input, !modelsWithoutToolUse.has(modelKey(input.profile)));
  let aborted = input.turn.signal.aborted;
  try {
    if (!aborted) await agent.summarize({ signal: input.turn.signal, onEvent: input.onEvent });
  } catch (error) {
    if (!input.turn.signal.aborted && !(error instanceof ChatAbortedError)) throw error;
    aborted = true;
  }
  return {
    aborted: aborted || input.turn.signal.aborted,
    libraryMessages: messagesFromAgent(agent.getHistory()),
    contextParts: contextPartsOf(agent),
  };
}

export async function runChat(input: AgentTurnInput & { content: string; images?: ImageAttachment[] }): Promise<ChatTurnResult> {
  const includeTools = !modelsWithoutToolUse.has(modelKey(input.profile));
  const entry = await input.turn.getAgent(input, includeTools);
  try {
    return await finishChat(entry, input);
  } catch (error) {
    if (!includeTools || !(error instanceof ChatTurnFailure) || !isToolUseUnsupportedError(error.cause)) throw error;
    modelsWithoutToolUse.add(modelKey(input.profile));
    // Changing tools mode already invalidates the pooled configuration.
    return finishChat(await input.turn.getAgent(input, false), input);
  }
}

async function finishChat(
  entry: SessionAgent,
  input: AgentTurnInput & { content: string; images?: ImageAttachment[] },
): Promise<ChatTurnResult> {
  const { agent, continuedReplies: replies } = entry;
  try {
    const result = await agent.chat(input.content, {
      images: input.images,
      signal: input.turn.signal,
      onEvent: (event) => {
        if (event.type !== 'context.usage') {
          input.onEvent(event);
          return;
        }
        // The library compiled this request and measured it, so the breakdown is
        // read from that same compilation instead of being re-derived here.
        input.onEvent(withContextParts(event, contextPartsOf(agent)));
      },
    });
    return {
      aborted: input.turn.signal.aborted,
      content: [...replies, result.content].filter((reply) => reply.trim()).join('\n\n'),
      usage: result.usage,
      contextUsage: result.contextUsage,
      contextParts: contextPartsOf(agent),
      ...(result.continuation ? { continuation: result.continuation } : {}),
      libraryMessages: messagesFromAgent(agent.getHistory()),
    };
  } catch (error) {
    const partial = snapshotChat(agent);
    if (input.turn.signal.aborted || error instanceof ChatAbortedError) return { ...partial, aborted: true };
    throw new ChatTurnFailure(error, partial);
  }
}

export class ChatTurnFailure extends Error {
  constructor(cause: unknown, readonly partial: ChatTurnResult) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'ChatTurnFailure';
  }
}

function snapshotChat(agent: Agent): ChatTurnResult {
  return {
    aborted: false,
    content: '',
    usage: agent.getStats().current,
    contextUsage: agent.getContextUsage(),
    contextParts: contextPartsOf(agent),
    libraryMessages: messagesFromAgent(agent.getHistory()),
  };
}

/**
 * Category breakdown of the agent's context. After a completed request it is the
 * provider-reported prompt split by category; before one (a fresh agent, or right
 * after a summary replaced the history) it is the local estimate of what the next
 * request would carry.
 */
function contextPartsOf(agent: Agent): ContextParts {
  const real = agent.getContextMeterReal();
  const meter = real.total > 0 ? real : agent.getContextMeterEstimate();
  return { ...meter.categories };
}

/**
 * Compiles the request an agent would send for `libraryMessages` without running a
 * turn. It uses a throwaway agent, never the pooled one, so reading the context
 * cannot disturb the history or the measurement of a turn that is in flight.
 */
export async function inspectContext(input: {
  sessionId: string;
  profile: ModelProfile;
  apiKey: string;
  libraryMessages: LibraryMessage[];
}): Promise<{ compiled: CompiledRequest; estimate: ContextEstimate }> {
  // A chat that has no model yet still has a context to show; the request is only
  // compiled, never sent, so a placeholder model name is enough for the library.
  const profile = input.profile.model.trim() ? input.profile : { ...input.profile, model: 'unselected' };
  const setup = await prepareSessionAgent(input.sessionId, {
    ...input, profile, apiKey: input.apiKey || 'inspect-only',
  }, !modelsWithoutToolUse.has(modelKey(profile)));
  const { agent } = await setup.create();
  return { compiled: agent.compileRequest(), estimate: agent.estimateContext() };
}

function modelKey(profile: ModelProfile): string {
  return `${profile.provider}\n${profile.host}\n${profile.model}`;
}
