# Host runtime

Every session starts through `sessions/turn.ts` → `startSessionTurn`.
HTTP and delegation adapt their inputs and observe the same lifecycle.
The library owns model, tool and continuation loops.

- `agents/`: `pool.ts` owns cached instances and exclusive active turns;
  `setup.ts` resolves workspace, agent, policy, model, instructions and grants;
  `execution.ts` calls the library chat, summary and context APIs.
- `sessions/`: `turn.ts` prepares input/history, records usage and transcript,
  publishes events, persists outcomes and releases resources. `commands.ts`,
  `title.ts`, `subagents.ts` and `messaging.ts` provide session features. Delegation creates
  child sessions and starts the same turn entry.
- `events/`: `live-chat.ts` buffers and publishes stream events;
  `dialogs.ts` registers and resolves input/approval requests;
  `timeline.ts` builds and persists transcript blocks;
  `tool-results.ts` extracts structured tool details with one JSON decode.
- `context/`: `tree.ts` builds the context view from library compilation.

Prompt content belongs to `agent/catalog/prompts/`; policy compilation belongs
to `agent/workspaces/library-policy.ts`. Neither is a second runtime.

Tests live beside the module they verify. Use concrete module imports; do not
add forwarding modules for previous paths or an alternative turn lifecycle.

Messaging waits for an approved idle recipient using this same lifecycle. The active turn carries the incoming message source so relaying is rejected on the host; transcript messages retain that source for display and replay. Messaging adds no queue or alternate execution loop.
