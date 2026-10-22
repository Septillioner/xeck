> The current state of these findings has not been reverified. Historical follow-up reference: backlog 021.

# Agent behavior audit — 2026-10-09

## Scope and method

The audit examined user-visible messages and relevant tool activity in eight sessions under the former application's session directory. It assessed task adherence, evidence supporting completion claims, tool use, and observable product defects. Hidden reasoning and secrets were excluded. The audit did not change source code.

## Supported findings

### High: completion claimed without verification after a build failure

- Session `9a5920fa-d04f-46af-9667-641abff16528` concerned the FIFO message queue.
- The implementation turn reached `Tool loop limit reached (60)`. The agent still described the queue as complete while acknowledging that it had not built it.
- The user's Vite build failed on a duplicate `streaming` declaration at `web/src/state/AppState.tsx:735`; the earlier declaration was at line 733.
- The agent removed the duplicate without rebuilding. The fix remained unverified in that session. This does not establish that the current implementation is broken.

### Medium: excessive tool loops and internal limit messages exposed to users

- The `9a5920fa...` trace contained 74 `search_code` calls, repeated queries, and at least two repeat-call guard blocks. The FIFO turn also reached the 60-round limit.
- In project-management session `5ead22ed-a521-485d-b34e-aed5841e2c2c`, the final response exposed `Tool loop limit reached (60)` twice. Activity contained 48 terminal calls and one failed terminal call, followed by a report of successful typecheck/build.
- These traces support findings of inefficient tool use and leaked internal errors. They do not establish a defect in the project-management feature itself.

### Medium: defects in the initial chat action menu delivery

- Session `6622dc09-f51b-4211-a64c-6e7be182cb7c` concerned chat-row actions.
- The user reported overlapping menus and a Move to project submenu extending beyond the viewport. The agent made two subsequent fixes and reported a successful build.
- The agent acknowledged that the first custom menu lacked keyboard focus and arrow-key navigation. The record contains no confirmation that this accessibility gap was later fixed.

### Low: inconsistent explanation of persistent-memory capability

In `9a5920fa...`, the agent initially said it had no memory-writing tool, then later called `memory_upsert` to save the project path. The write eventually happened, but the initial capability claim was inconsistent.

### Repeated tool call during the audit

The audit itself repeated `plan_read {}`; the repeat-call guard blocked one attempt. It was not retried. This was avoidable repetition in the audit execution, not a finding about the source sessions.

## Sessions without evidence of a product defect

- `4806f3b8-ea45-4074-a986-388ec1b5e3ec`: Correctly distinguished repeat-call blocking from a mode/policy restriction while in agent mode.
- `b8bac33b-5606-4615-ac01-152cff554b48`: Made no code changes after a clearly labeled demonstration plan, consistent with the requested demo scope.
- `d669ad9d-c37c-4db5-8a0e-641772e7f796`: Clarified policy colors and UI scope and obtained agreement on a CSS exception. The record contains no failed-verification evidence.
- `6782db92-3558-4dfb-b9e7-fa417fcbf46e`: Explicitly disclosed that the queue/plan-card UI and development-command changes were not automatically verified. No later failure was recorded; the concern remained unverified delivery.
- The audit session itself proceeded after the user approved its scope and produced the final report.

## Assessment

The most serious pattern was claiming completion after tool-loop interruption, then failing to repeat verification after fixing a build error. Another pattern was excessive repeated searches and terminal operations that surfaced internal limit messages. Other findings concerned menu usability/accessibility and consistent capability descriptions.
