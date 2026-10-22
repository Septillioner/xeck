# ADR 0001 — Same-error circuit breaker disabled

- **Status:** Accepted; the breaker remains disabled under this decision.
- **Date:** 2026-07-10, preserving the date recorded in the original report.
- **Decision:** The host disables the library's repeated-tool-error breaker through policy-level `errorBreaker: 'off'`.
- **Reason:** The hard breaker removed `tool_calls` but retained `function_call` entries in `providerMeta.openai.outputItems`. Replaying that history through the Responses API produced `400 No tool output found for function call`.
- **Mitigation:** Repair tool-call/result pairing per request with `sanitizeToolPairing()`, adding missing outputs and dropping orphan results.
- **Reconsideration:** See section 6.

The report below describes the implementation and verification at the time of the decision. Paths, line numbers, counts, and policy limits are historical references rather than claims about today's source.

## 1. Summary

The repeated-tool-error breaker in `decision-loop.ts` was disabled. Two related protections accompanied the change: do not preserve `providerMeta` for a round whose tool calls have been removed, and repair call/result pairing before every provider request.

Disabling the breaker addressed both the visible notice and the chain that caused the subsequent HTTP 400.

## 2. Symptom

A conversation first displayed:

```text
NOTICE: 'mcp_poyraz__get_file_info' returned the same error twice in a row.
Stop retrying that tool call. Explain what you need from the user or describe the blocker in plain text.
```

It was immediately followed by:

```text
400 No tool output found for function call call_u3Ba959PiIphnGBKpwNKOBdX
```

## 3. Root cause

The failure came from the Responses API. The recorded sequence was:

| Step | Behavior | Historical location |
|---|---|---|
| 1 | `policyForId()` enabled `hardBlockDeniedTools: true` for all three modes. | `host/src/agent/catalog/prompts/system-prompt.ts` |
| 2 | Two identical consecutive errors inserted a hard NOTICE as a user message and set `circuitBreakerNoticeSent = true`. | `poyraz/application/chat/decision-loop.ts:367-387` |
| 3 | The following round evaluated `toolCalls = isToolLoopBlocked() ? undefined : response.tool_calls`, removing the tool calls. | `decision-loop.ts:237` |
| 4 | `providerMeta` was still stored, including `function_call` output items. | Earlier `decision-loop.ts:239-246` |
| 5 | `buildChatResponseFromResponsesOutput()` stored output items independently of `tool_calls`. | `poyraz/infrastructure/llm/openai-responses.ts:224-241` |
| 6 | `toResponsesInput()` replayed assistant output items on the next request. | `openai-responses.ts:122-126` |
| 7 | No `function_call_output` had been produced, leaving an unanswered call and causing HTTP 400. | Provider request |

`completePendingToolResponses()` at `decision-loop.ts:109-138` could not repair this case because it only inspected `msg.tool_calls`, which was already undefined.

The breaker therefore left valid provider-level tool calls without matching results. Disabling it prevented the destructive history transformation.

## 4. Recorded changes

### 4.1 Disable the breaker

In `poyraz/application/chat/decision-loop.ts`:

| Historical line | Change |
|---|---|
| 39 | Set `export const ERROR_CIRCUIT_BREAKER_ENABLED: boolean = false;`, with a comment explaining the decision. |
| 354 | Guard the error counter with `ERROR_CIRCUIT_BREAKER_ENABLED &&`. |
| 367 | Guard the breaker trigger with the same flag. |
| 245 | Store `providerMeta: toolCalls ? response.providerMeta : undefined`. |

With the flag off, no NOTICE is generated, `circuitBreakerNoticeSent` stays false, `isToolLoopBlocked()` does not trigger, and tool calls are not stripped through this path.

### 4.2 Repair requests without deleting history

The new helper in `poyraz/infrastructure/llm/tool-pairing.ts` has this signature:

```ts
sanitizeToolPairing(messages: ChatMessage[]): ChatMessage[]
```

- Return a new array without mutating `messages`. Stored transcripts, `libraryMessages`, and UI history remain intact; only the outgoing provider payload is repaired.
- Add a synthetic `role: 'tool'` message containing `MISSING_TOOL_OUTPUT_NOTE` immediately after each unanswered function call. Preserve the call itself so the model can still see it.
- Skip orphan tool-result messages whose `tool_call_id` matches no call.
- Skip calls with an empty ID, which `extractToolCallsFromOutput` could produce.

The helper was connected at these provider boundaries:

| File | Historical line | Provider path |
|---|---|---|
| `infrastructure/llm/providers.ts` | 35 | Ollama |
| `infrastructure/llm/providers.ts` | 203 | OpenAI Responses API |
| `infrastructure/llm/providers.ts` | 327 | OpenAI Chat Completions fallback |
| `infrastructure/llm/gemini-messages.ts` | 146 | Gemini `buildGeminiRequest` |

### 4.3 Update existing assertions

Two assertions in `poyraz/tests/integration/decision-loop.test.ts` were adapted:

- The test that expected a NOTICE after two identical errors now expects no NOTICE while the breaker is off. It checks `ERROR_CIRCUIT_BREAKER_ENABLED === false` and `CONSECUTIVE_SAME_ERROR_LIMIT === 2`.
- The test that expected tool-call stripping now verifies that calls are never stripped through the disabled breaker path.

The initial change updated existing tests rather than adding new ones. The later policy-mode change in section 9 added three cases.

## 5. Remaining protections

The disabled layer was `CONSECUTIVE_SAME_ERROR_LIMIT = 2`: it combined a NOTICE with blocking after two equal `tool:code:message-hash` failures.

The following mechanisms still operated independently:

| Mechanism | Historical location | Behavior |
|---|---|---|
| `repeatCallLimit`, default 2 | `poyraz/application/chat/tool-execution.ts:110` | Return `POLICY_BLOCKED` for repeated tool-and-argument signatures. |
| `maxToolRounds` | `poyraz/application/agent/tool-resolver.ts:21-27` and host policy configuration | Bound total tool rounds. Recorded limits were agent 60, plan 40, library default 10. |
| Policy `deniedTools` | `poyraz/application/chat/tool-policy.ts:68-87` | Reject tools unavailable under the policy. |
| Response gates | `decision-loop.ts:249-276` | Reject and retry unsuitable text responses. |
| Tool errors | `tool-execution.ts` through `withRepair` | Return the failure as a tool message visible to the model. |

Repeated calls remained bounded by `repeatCallLimit` and `maxToolRounds`. The same-error breaker was an additional overlapping layer.

## 6. Conditions for reconsideration

Keep the breaker disabled unless a demonstrated case justifies it. The recorded reasons were:

1. The hard NOTICE terminated tool progress by stripping calls rather than reliably guiding the model. It directly caused the invalid replay.
2. Existing repetition and round limits already bounded execution. Argument-changing retries bypass the identical-call limit but still reach the round cap.
3. A transient MCP startup failure could terminate the turn unnecessarily, as happened with `mcp_poyraz__get_file_info`.

A persistent quota failure, forbidden path, or unusable argument combination might justify additional guidance if further attempts are pointless or costly.

Before enabling a breaker:

- Confirm `sanitizeToolPairing` remains connected across all four recorded provider paths. This was complete in the report.
- Confirm the `providerMeta` guard remains in place. This was complete in the report.
- Prefer `buildAgentSoftCircuitNotice` at the historical `decision-loop.ts:104-120`: append a `<system_reminder>` without changing `tool_calls`.
- Review why `policyForId()` selected `hardBlockDeniedTools: true` in every mode; this forced the hard path instead of the existing soft path.
- Consider raising `CONSECUTIVE_SAME_ERROR_LIMIT` from 2 to 3 to tolerate a transient MCP delay.
- Preserve the invariant that removing tool calls also removes the corresponding provider metadata.

Request pairing repair remains a defense in depth, not a reason to permit invalid history transformations elsewhere.

## 7. Historical verification

The original report recorded:

```text
poyraz/: node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json
poyraz/: node_modules\.bin\vitest.cmd run  -> 8 files, 86 tests passed
root: npm run build:lib                   -> ESM and declarations built
root: npm run typecheck --prefix host     -> clean
```

It also recorded a pre-existing qualification: `poyraz/evals/scenarios/helpers.ts` had five type errors involving `ok`, `error`, and `content` on `AgentStreamEvent`. Because `evals` was included by the library tsconfig, its typecheck reported those errors; the library build and host typecheck were unaffected.

Manual checks requested at that time:

1. Produce a repeated tool failure under plan or ask policy and confirm no breaker NOTICE appears.
2. Resume an older conversation that previously produced the missing-output 400. Confirm the next request succeeds and previous messages remain intact.
3. Inspect the debug request payload. Any unanswered function call should be followed by a synthetic tool message containing `MISSING_TOOL_OUTPUT_NOTE`.

These are historical results and requested checks, not verification rerun during this documentation translation.

## 8. Related historical files

| File | Responsibility |
|---|---|
| `poyraz/application/chat/decision-loop.ts` | Breaker and provider metadata guard. |
| `poyraz/infrastructure/llm/tool-pairing.ts` | Request pairing repair. |
| `poyraz/infrastructure/llm/providers.ts` | Responses, Chat Completions, and Ollama integration. |
| `poyraz/infrastructure/llm/gemini-messages.ts` | Gemini integration. |
| `poyraz/tests/integration/decision-loop.test.ts` | Existing assertion updates and later mode tests. |
| `host/src/agent/catalog/prompts/system-prompt.ts` | `policyForId()`, hard-block behavior, and disabled breaker configuration. |

## 9. Host-owned configuration update, 2026-07-10

The host became responsible for selecting the breaker mode:

- `poyraz/domain/agent-policy.ts` defines `errorBreaker?: 'off' | 'soft' | 'hard'` through `ErrorBreakerMode`, exported from the library entry point. The recorded default is off.
- `resolveErrorBreakerMode(agentPolicy)` uses an explicit policy value when supplied, otherwise falls back to `ERROR_CIRCUIT_BREAKER_ENABLED` for compatibility.
- The host's `policyForId()` returned `errorBreaker: 'off'` for all three modes. That was the single configuration point for changing behavior.
- `off` disables the counter, notice, and blocking. `soft` adds a reminder without altering calls. `hard` selects the earlier hard behavior when `hardBlockDeniedTools` is enabled, otherwise a soft notice. The metadata guard prevents the original HTTP 400 chain even when hard mode strips calls.
- Three integration-test cases cover mode resolution, soft behavior, and hard behavior.

Selecting soft or hard behavior should use host policy configuration rather than another library change.
