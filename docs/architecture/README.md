# Architecture outline

> **Status: deferred.** This outline records the architecture described on 2026-10-15. Items marked uncertain were unresolved at that time. Check the current implementation before relying on historical details.

## Documents

| Document | Scope |
|---|---|
| [Poyraz library boundary](poyraz-library-boundary.md) | Responsibilities shared between the library and Xeck. Read before changing either side of the integration. |
| [Host overview](host-overview.md) | Host service, HTTP API, SSE, persistence, and session runtime. Some sections describe an earlier implementation. |

## Repository layout

`poyraz/` is the agent-library Git submodule. `host/` is the local Node/Hono HTTP service. `web/` contains the Vite, React, and Tailwind v4 interface. `electron/` wraps the host and renderer as a desktop application. `shared/` contains contracts shared by host and web.

Library work belongs in its own repository; see the boundary document for the integration rules.

## Host

`host/src` groups responsibilities into `http/` (routes and SSE turns), `agent/` (core, runtime, catalogs, and tool presentation), `stores/` (persistence), `plans/` (plan services), and `tools/` (file and terminal implementations). The earlier outline left the split of large files such as `AppState.tsx` and `chat-turn.ts` unresolved.

## Agents and policies

Tool, agent, policy, and workspace catalogs compose the agent configuration. The canonical persisted session field is `policyId`. Policy entry text is appended to history through `entryLine` to preserve the reusable prompt prefix. The relationship to the earlier expert-system proposal was unresolved in this outline.

## Web

The frontend follows `shell|chat|settings → ui → state → api|lib → shared`. Shared styles live in `web/src/styles/`; the canonical design requirements are in [Frontend rules](../rules/frontend.md). The earlier outline recorded `responsive.css` as remaining migration work.

## Persistence, plans, and memory

Sessions and plans are stored in the application data directory. A plan is a single `.plan.md` file; see [ADR 0004](../decisions/0004-plan-single-file.md). The original outline did not settle project-scoped memory behavior. See the host overview and current data-directory implementation for exact storage paths.

## Tools and permissions

Built-in tools are exposed through an MCP server and filtered by policy allow/deny rules. The original outline described an output-only `run_command` terminal and left persistent terminal sessions unresolved.

## Error handling

The same-error circuit breaker was deliberately disabled; see [ADR 0001](../decisions/0001-error-circuit-breaker-off.md). Provider requests repair tool-call/result pairing before submission.
