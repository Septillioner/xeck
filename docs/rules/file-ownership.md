# File ownership

The library/host boundary is documented in [Poyraz library boundary](../architecture/poyraz-library-boundary.md). This page assigns responsibility to files. A new workspace, tool, or policy must not introduce another ID registry or duplicate catalog.

## Four catalogs

- Tool definitions live in `host/src/agent/tools/builtin`; each tool module owns its name constant.
- Agents belong in `host/src/agent/catalog/agents.ts`: identity, instructions, and presentation, without permissions or tool lists.
- Policies belong in `host/src/agent/catalog/policies.ts`: `allow`, `deny`, round limits, `entryLine`, `loop`, and `deniedReason`.
- Workspaces belong in `host/src/agent/catalog/workspaces.ts`: agent, policy, and tool selection.

Adding a domain should require at most an agent entry, a policy entry, and a workspace block. Do not scatter its ID through `chat.ts`, session storage, CSS, or React state.

## Resolution and identity

- `host/src/agent/workspaces/definitions.ts` validates definitions and supplies `selectedBuiltinNames`, `workspaceOffersPlan`, and `policyIdFor`. It does not register entries or re-export catalogs.
- `host/src/agent/workspaces/resolve.ts` resolves identity.
- `host/src/agent/core/chat.ts` defines the Chat schema only.
- The coding catalog entry supplies the default agent and workspace. Do not translate persisted IDs.

## Tool surface

- `host/src/agent/tools/builtin/identity.ts` owns MCP identity: server ID, prefix, `serverSideName`, and `isBuiltinHostTool`. Do not add a second tool-name list.
- Keep large implementations outside schema modules. File operations belong in `host/src/tools/file-access.ts`; terminal execution belongs in `host/src/tools/terminal-run.ts`.
- `host/src/agent/tools/builtin/bridge.ts` presents tools through MCP.
- `host/src/agent/tools/policy-context.ts` handles denial using the policy entry's `deniedReason`.
- `host/src/agent/tools/tool-labels.ts` owns labels, `requires`, and `availableWhen`, not permissions.

## Sessions and HTTP

- `policyId` is the canonical persisted session field. Do not add `mode`, `legacyMode`, or an alias map.
- A missing `policyId` resolves to the workspace's `defaultPolicy`.
- Policy updates use `PUT /api/sessions/:id/policy`, owned by `host/src/http/routes/sessions.ts`.
- Plan routes read plans and handle todos; they do not change policy.

## Repository boundaries

- Keep tests beside the module whose contract they verify.
- `poyraz/` is a separate Git repository. Make and commit library changes there; update the submodule pointer here. The host uses the library's public exports rather than reaching into its internals.

## Agent execution

- `agent/runtime/sessions/turn.ts` owns the single-turn lifecycle for every session. HTTP and delegation start and observe it; neither implements a separate agent loop.
- `agent/runtime/agents/pool.ts` owns cached agent instances and active turns. A session has one active turn, including preparation. Cancellation and release belong here.
- `agent/runtime/agents/setup.ts` builds the same AgentBuilder configuration from workspace, specialist agent, policy, instructions, model, and tool grants.
- `agent/runtime/agents/execution.ts` calls the library's chat, summary, and context APIs. Do not duplicate the model/tool/continuation loop in the host.
- `agent/runtime/events/live-chat.ts` owns event publication, buffering, and subscriptions, without owning an abort controller.
