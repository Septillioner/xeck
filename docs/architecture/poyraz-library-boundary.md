# Poyraz library and Xeck boundary

This page defines responsibility across the two repositories. Read it before changing the integration. Library-specific documentation lives under `poyraz/docs/`; the 0.3-to-1.0 migration is described in `poyraz/docs/migration-1.0.md`.

## Principle

Xeck is an application built with the `poyraz` library. The library exposes agent construction and management, context management and measurement, toolsets, policies, summarization, continuation, MCP connections, provider/model selection, rules, and skills. Xeck consumes these interfaces and owns application-specific behavior. The library must not depend on Xeck; another application must be able to construct and manage agents through the same `AgentBuilder`.

## Library rules

- A fresh `AgentBuilder()` provides a plain text-completion context: no rules, skills, system instructions, tools, summarization, or MCP. Features are off unless explicitly enabled.
- Configure generic behavior through builder options such as `Summarization`, `Reasoning`, `Logging`, `Repair`, `SameToolBreaker`, `RateLimit`, `Mcp`, `Continuation`, and `Policy`.
- The library must not know about poyraz-cli, Xeck, or application-specific directory selection such as a host home-directory convention.
- Do not compensate for a missing generic library feature by reimplementing it in the host. If other Poyraz applications would need the same behavior, implement it in the library.

## Library capabilities recorded for 1.0.0 and b11eb99

- Opt-in `AgentBuilder` features. `getContextMeterReal()` and `getContextMeterEstimate()` expose ten categories: `system`, `tools`, `rules`, `skills`, `mcp`, `summary`, `conversation`, `toolCalls`, `toolResults`, and `providerMeta`. `compileRequest()` and `estimateContext()` are library APIs too.
- `ContinuationPolicy`, `Summarization({ prefix, onSummarized, ... })`, `Mcp({ toolPrefix })`, `createMcpClientManager`, and `agent.syncMcp(servers)`.
- Runtime setters `setReasoning`, `setServiceTier`, `setContextWindow`, and `setMaxToolRounds`, effective from the next turn. `resolveContextWindow` resolves catalog values, provider cache, and a static table in that order.
- Policies support wildcard `allowedTools`, `deniedTools`, and `maxToolRounds`.
- Optional `toolResultMaxChars` and `toolResultMaxBytes`, `ToolUseUnsupportedError` and `isToolUseUnsupportedError`, rate limiting, and logging.

## Host responsibilities

The following remain application-specific:

- HTTP, SSE, UI, data-directory selection, session persistence, history replay, turn orchestration, and the agent pool.
- File, terminal, grep, plan/todo, memory, rule, and skill CRUD tools, exposed as host tools or through MCP.
- Skill catalogs, `SKILL.md` parsing, slash-command selection, built-in instructions, agent/workspace catalogs, policy presentation, provider/model catalogs, MCP configuration, settings, and projects.
- Context-window inputs such as user overrides, provider cache, and the static OpenAI table, passed to the library's resolver.
- Filesystem access security and workspace boundaries.

The library supplies generic transport and configuration mechanisms: toolsets, MCP, rule/skill injection, and policy. Tool content and application catalogs belong in the host or its MCP servers.

## Where a new feature belongs

1. Generic policy, context, summary, continuation, MCP, or provider behavior belongs in the library as an opt-in builder feature.
2. Xeck-specific product behavior, content, and infrastructure belong in the host.
3. If the boundary is unclear, resolve it with the maintainer before implementation. Library changes require appropriate tests.

## Integration points

- `host/src/agent/runtime/agents/setup.ts` constructs agents and configures `Summarization` (host prefix, prompt, and `onSummarized`), `MaxToolRounds`, `Mcp({ toolPrefix })`, `Logging`, `ContextWindow`, `Reasoning`, `ServiceTier`, `Rules`, `AddSkills`, `Continuation`, and `Policy`. The recorded integration does not enable rate limiting.
- Reasoning, service tier, context window, and round limits are not part of the agent profile cache key. Cached agents receive them through runtime setters before the next turn, preserving history and provider caching.
- Context measurement comes from the library meters. `contextPartsOf` maps the ten categories, and `context/tree.ts` builds the debug tree from `compileRequest()`. The host must not add its own character-to-token approximation; the old `context-parts.ts` is gone.
- `resolveContextWindow` receives host catalog `contextLength` overrides, provider cache, and the static OpenAI table. Token-based summarization remains off when the context window is unknown.
- Continuation uses the library's `ContinuationPolicy` interface in `plans/open-steps-policy.ts`. The host supplies application data such as the plan and registers this policy only for `loop: continue-open-steps`.
- The host passes its summary prefix and prompt to `Summarization`. `onSummarized` appends the plan progress line, such as `Plan 2/5, next t3`, to the summary.
- `policyForId` translates allow rules, `mcp_<server>__*` patterns, denied tools, and round limits into the library policy. Tool selection and prefix also come from the host. An empty selection means no tools.
- The host's shared `createMcpClientManager({ toolPrefix })` synchronizes definitions through `sync(defs)` in `stores/mcp-store.ts`; `mergeExternalTools` adds them to agents. Per-agent `agent.syncMcp` would open separate connections for every session, so this integration does not use it.

The library's `toolResultMaxChars` and `toolResultMaxBytes` are not used here: the host uses a structure-aware `boundedJson` limit to keep results valid JSON. `isToolUseUnsupportedError` is used by `agents/execution.ts` to detect unsupported tool use for OpenRouter, OpenAI, Groq, llama.cpp, Ollama, and vLLM, then retry the turn once without tools.

## Development rules

- Include this boundary document when handing integration work to another developer or agent.
- A host task must not silently modify `poyraz/`. Record a missing library capability for separate library work.
- Preserve existing tests. Library changes must pass the relevant typecheck, build, and tests.
- HTTP and delegation use the same `sessions/turn.ts` lifecycle. `agents/pool.ts` owns cached instances and one active turn per session; `agents/setup.ts` resolves application configuration; `agents/execution.ts` calls library execution APIs. Model, tool, and continuation loops remain in the library.
