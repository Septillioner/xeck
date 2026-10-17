import type { TokenUsage } from 'poyraz';
import type { AgentMessageSource } from '../../../../../shared/types.ts';
import { prepareSessionAgent, type AgentSetupInput, type SessionAgent } from './setup.ts';
import { assertStorageAvailable } from '../../../infra/storage-maintenance.ts';

const agents = new Map<string, SessionAgent>();
const running = new Map<string, AgentTurn>();

export class ChatInFlightError extends Error {
  constructor() {
    super('Chat already running');
    this.name = 'ChatInFlightError';
  }
}

/** A session owns one turn until release, including asynchronous preparation. */
export interface AgentTurn {
  readonly sessionId: string;
  readonly signal: AbortSignal;
  readonly messageSource?: AgentMessageSource;
  abort(): void;
  getAgent(input: AgentSetupInput, includeTools: boolean): Promise<SessionAgent>;
  release(discardAgent?: boolean): void;
}

export function acquireAgentTurn(sessionId: string, parentSignal?: AbortSignal, messageSource?: AgentMessageSource): AgentTurn {
  assertStorageAvailable();
  if (running.has(sessionId)) throw new ChatInFlightError();
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  if (parentSignal?.aborted) abort();
  const checkActive = () => {
    if (running.get(sessionId) !== turn) throw new Error('Agent turn was released');
    controller.signal.throwIfAborted();
  };
  const turn: AgentTurn = {
    sessionId,
    signal: controller.signal,
    messageSource,
    abort,
    async getAgent(input, includeTools) {
      checkActive();
      const setup = await prepareSessionAgent(sessionId, input, includeTools);
      checkActive();
      let entry = agents.get(sessionId);
      if (!entry || entry.configurationKey !== setup.configurationKey) {
        entry = await setup.create();
        // Cancellation/deletion during init must not resurrect a pooled instance.
        checkActive();
        agents.set(sessionId, entry);
      } else setup.update(entry);
      return entry;
    },
    release(discard = false) {
      if (running.get(sessionId) !== turn) return;
      parentSignal?.removeEventListener('abort', abort);
      if (discard) agents.delete(sessionId);
      running.delete(sessionId);
    },
  };
  running.set(sessionId, turn);
  return turn;
}

export function getActiveTurn(sessionId: string): AgentTurn | undefined {
  return running.get(sessionId);
}

export function hasActiveAgentTurns(): boolean {
  return running.size > 0;
}

export function abortChat(sessionId: string): boolean {
  const turn = running.get(sessionId);
  if (!turn) return false;
  turn.abort();
  return true;
}

export function dropAgent(sessionId: string): void {
  abortChat(sessionId);
  agents.delete(sessionId);
}

/** Count child-provider usage in the master turn as well as the child's own session. */
export function recordSubagentUsage(parentId: string, usage: TokenUsage): void {
  agents.get(parentId)?.agent.recordExternalUsage(usage);
}
