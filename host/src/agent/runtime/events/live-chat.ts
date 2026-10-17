/**
 * Live chat registry.
 *
 * While a chat turn is running the host keeps every SSE event it publishes in
 * memory. The POST /messages stream is only one subscriber: if the browser
 * refreshes, that connection dies but the turn keeps running and buffered
 * events let a fresh GET /stream replay the turn from where it was left off.
 */
export interface LiveEvent {
  /** Monotonic position of the event inside the turn. */
  id: number;
  event: string;
  data: unknown;
}

export interface LiveChat {
  readonly sessionId: string;
  readonly events: LiveEvent[];
  readonly listeners: Set<(event: LiveEvent) => void>;
  readonly closeWaiters: Set<() => void>;
  closed: boolean;
}

const liveChats = new Map<string, LiveChat>();

export function startLiveChat(sessionId: string): LiveChat {
  const chat: LiveChat = {
    sessionId,
    events: [],
    listeners: new Set(),
    closeWaiters: new Set(),
    closed: false,
  };
  liveChats.set(sessionId, chat);
  return chat;
}

export function getLiveChat(sessionId: string): LiveChat | null {
  const chat = liveChats.get(sessionId);
  if (!chat || chat.closed) return null;
  return chat;
}

export function publishLive(chat: LiveChat, event: string, data: unknown): LiveEvent {
  const item: LiveEvent = { id: chat.events.length, event, data };
  chat.events.push(item);
  for (const listener of [...chat.listeners]) {
    try {
      listener(item);
    } catch {
      // A broken subscriber must never interrupt the running turn.
    }
  }
  return item;
}

export function subscribeLive(chat: LiveChat, listener: (event: LiveEvent) => void): () => void {
  chat.listeners.add(listener);
  return () => {
    chat.listeners.delete(listener);
  };
}

export function onLiveClosed(chat: LiveChat, listener: () => void): () => void {
  if (chat.closed) {
    listener();
    return () => undefined;
  }
  chat.closeWaiters.add(listener);
  return () => {
    chat.closeWaiters.delete(listener);
  };
}

export function closeLiveChat(chat: LiveChat): void {
  if (chat.closed) return;
  chat.closed = true;
  if (liveChats.get(chat.sessionId) === chat) liveChats.delete(chat.sessionId);
  for (const waiter of [...chat.closeWaiters]) {
    try {
      waiter();
    } catch {
      // ignore a subscriber that fails while closing
    }
  }
  chat.closeWaiters.clear();
  chat.listeners.clear();
}
