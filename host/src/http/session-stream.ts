import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { onLiveClosed, subscribeLive, type LiveChat, type LiveEvent } from '../agent/runtime/events/live-chat.ts';

/** POST and reconnect both replay the turn and observe its remaining events. */
export function streamSessionTurn(c: Context, liveChat: LiveChat) {
  return streamSSE(c, async (stream) => {
    let finished = false;
    let writeChain = Promise.resolve();
    let resolveFinished: () => void = () => undefined;
    const finishedPromise = new Promise<void>((resolve) => { resolveFinished = resolve; });
    const write = (event: LiveEvent) => {
      if (finished) return;
      writeChain = writeChain.then(() => stream.writeSSE({
        event: event.event, data: JSON.stringify(event.data), id: String(event.id),
      })).catch(() => undefined);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      resolveFinished();
    };
    const unsubscribeEvents = subscribeLive(liveChat, write);
    // Replay before registering the close waiter: already closed turns still flush.
    for (const event of [...liveChat.events]) write(event);
    const unsubscribeClosed = onLiveClosed(liveChat, finish);
    stream.onAbort(() => { unsubscribeEvents(); finish(); });
    await finishedPromise;
    await writeChain;
    unsubscribeEvents();
    unsubscribeClosed();
  });
}
