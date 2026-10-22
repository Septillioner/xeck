# Documentation inventory and classification report

> **Historical report, 2026-10-15.** This inventory predates the documentation moves and describes the former repository layout. A later check established that the host did contain `host/src/agent/tools/builtin/grep.ts`, did not contain `find_files`, and had a 1162-line `AppState.tsx`. See [Reorganization report](reorg-summary.md). This English public edition omits local-only note references; it does not rerun the original audit.

- **Date:** 2026-10-15, Europe/Istanbul.
- **Repository snapshot:** Former poyraz-web checkout, branch `main`, HEAD `66637a1`; the original audit began with a clean working tree.
- **Method:** Read-only document inventory, filesystem/search checks, and Git history. No moves, deletions, code execution, tests, commits, or pushes were performed during the inventory.
- **Dates:** Last-commit dates came from `git log -1 --date=short -- <file>`; filesystem dates sometimes differed by one or two days.
- **Evidence limits:** Statements marked verified reflect the original file/search checks, not current behavior. Unverified findings remain qualified below.

## 0. Summary

The original inventory counted 28 documents outside dependencies and build outputs. The public document categories were:

| Category | Count | Historical files |
|---|---|---|
| Architecture, deferred outline | 2 | `docs/arch-cwap.md`, `docs/backend/README.md` |
| Decisions | 1 | `docs/circuit-breaker-report.md` |
| Backlog sources, to extract and archive | 3 | `ROADMAP.md`, `IDEAS.md`, `docs/roadmap.md` |
| Rules | 3 | `design-rules.md`, `docs/srp.md`, `.clinerules/general.md` |
| Archive candidates | 2 | `implementation_plan.md`, `docs/architecture-report.md` |
| Reports | 1 | `docs/feedbacks/2026-10-09.md` |
| Editor configuration, retained in place | 2 | `.clinerules/design-rules.mdc`, `.cursor/rules/design-rules.mdc` |
| Submodule reference documentation | 13 | `poyraz/README.md` and twelve `poyraz/docs/*.md` files |

The original freshness distribution was five current, eight partly outdated, four outdated, and eleven uncertain documents. Those counts belong to the full historical source inventory.

The most consequential path mismatch followed commit `25d8340` on 2026-10-12, which moved agent, policy, and workspace catalogs from `host/src/agent/workspaces/` into `host/src/agent/catalog/`. The ownership document, CWAP outline, and cleanup roadmap still referenced the old layout.

## 1. Document inventory

Freshness means **current**, **partly outdated**, **outdated**, or **uncertain** relative to the 2026-10-15 audit.

### 1.1 Root documents

| File | Historical size/date | Contents and findings | Proposed destination |
|---|---|---|---|
| `ROADMAP.md` | 10,919 bytes; 2026-10-05 | Three phases: virtual terminal, search tools, and experts. The expert model was partly superseded by workspace/agent/policy configuration. Plan/todo functionality had shipped in `38f0156` with documented differences. The original claim that host grep was absent was later corrected. | Extract backlog items, then archive. |
| `IDEAS.md` | 153 bytes; 2026-10-03 | Self-improving agent toggle: report after tasks and improve rules. Still an idea. Rule-writing and memory facilities provided partial building blocks. | Extract the idea, then archive. |
| `implementation_plan.md` | 13,948 bytes; 2026-10-04 | Combined web hierarchy and mobile-layout plans. Both were largely implemented, with differences: no proposed `use-send.ts`; actual splitting used stream events, blocks, and session summaries. The Tailwind rejection was obsolete. | `docs/archive/implementation_plan-web-refactor-and-mobile.md`. |
| `design-rules.md` | 16,605 bytes; 2026-10-10 | Tailwind v4, token/color rules, cascade restrictions, shared controls, and settings hierarchy. A `styles.css` reference was stale, and `responsive.css` migration remained open. | Move into public rules after updating dependent pointers. The eventual canonical page is `docs/rules/frontend.md`. |

### 1.2 Editor configuration

| File | Historical size/date | Contents and findings | Proposal |
|---|---|---|---|
| `.clinerules/general.md` | 3,897 bytes; 2026-10-07 | Master rules covering clarification, direct communication, simple solutions, code quality, local documentation, and user-owned commits. Its blanket ban on tests conflicted with the repository's test suite and other plans. | Retain where the tool reads it; resolve the conflict rather than silently copying it into public rules. |
| `.clinerules/design-rules.mdc` | 233 bytes; 2026-10-07 | Pointer to the root design rules. | Retain in place and update the target if rules move. |
| `.cursor/rules/design-rules.mdc` | 233 bytes; 2026-09-30 | Identical pointer for another editor. | Intentional duplication; update both pointers together. |

### 1.3 Main documentation

| File | Historical size/date | Contents and findings | Proposal |
|---|---|---|---|
| `docs/arch-cwap.md` | 4,768 bytes; 2026-10-12 | Chat → Workspace → Agent → Policy outline, explain ordering, caching, identity, and exclusions. Catalog and resolver paths were stale. | Move to architecture with a draft/deferred banner and corrected paths. |
| `docs/architecture-report.md` | 15,170 bytes; Git date 2026-10-12, internal date 2026-06-03 | Two `shared/` directories, large library barrel, large AppState, route/store coupling, Vitest references, and twelve refactoring proposals. Some observations were already stale or unverified. | Archive with its internal date; defer detailed architecture work pending a decision. |
| `docs/circuit-breaker-report.md` | 12,348 bytes; 2026-10-09 | Missing-tool-output HTTP 400 chain, disabled breaker, pairing repair, remaining protections, reconsideration checklist, and host-owned breaker modes. System-prompt path needed updating. | ADR 0001 with summary and full historical report. |
| `docs/roadmap.md` | 6,604 bytes; 2026-10-08 | Cleanup roadmap: dead loop hooks, permission helpers, leftovers, stale docs, and responsibility splits. Search found several named symbols still present; paths were partly outdated. | Extract backlog items, then archive. |
| `docs/srp.md` | 2,310 bytes; 2026-10-08 | File ownership and four catalogs. It referenced old catalog paths, incorrectly denied the existence of `host/src/tools/`, and conflicted with other documents over submodule changes. | Correct and move to `docs/rules/file-ownership.md`. |
| `docs/backend/README.md` | 16,094 bytes; 2026-10-05 | English host/API/SSE/storage/security overview. Runtime tree and `PUT .../mode` were stale; actual locations used `agent/runtime/` and policy updates. | Move to `docs/architecture/host-overview.md`, initially with a freshness warning. |
| `docs/feedbacks/2026-10-09.md` | 4,435 bytes; 2026-10-09 | Eight-session behavior audit. Current resolution of its findings was not established. | Move to reports/audits and extract follow-up work. |

### 1.4 Poyraz submodule

The historical submodule snapshot was `169cc90`, package version 0.3.0, in the separate `Septillioner/poyraz` repository. Do not move its documents into the parent repository. An optional public reference page could link to them.

| File | Historical bytes/date | Contents | Freshness assessment |
|---|---|---|---|
| `poyraz/README.md` | 1,797; 2026-10-05 | Introduction, `WithPresets` quick start, providers. | Partly outdated: provider list omitted llama.cpp; referenced poyraz-cli. |
| `poyraz/docs/agent-api.md` | 6,728; 2026-10-04 | Agent/AgentBuilder reference. | Uncertain; not compared with implementation. |
| `poyraz/docs/auth-and-providers.md` | 2,654; 2026-09-29 | Credentials and provider profiles. | Uncertain, likely current. |
| `poyraz/docs/custom-tools.md` | 2,029; 2026-10-04 | `defineTool` custom tools. | Uncertain, likely current. |
| `poyraz/docs/evals.md` | 1,525; 2026-09-29 | Evaluation harness outside the published package. | Uncertain; another report identified five helper type errors. |
| `poyraz/docs/getting-started.md` | 1,116; 2026-10-04 | Minimal agent example. | Uncertain, likely current. |
| `poyraz/docs/how-it-works.md` | 1,216; 2026-10-04 | Domain/application/infrastructure/tools/presentation layers. | Possibly partly outdated; placement of presentation in the core had been questioned. |
| `poyraz/docs/mcp.md` | 1,402; 2026-09-30 | MCP connection types. | Uncertain. Its filesystem date differed from Git, but the submodule was clean. |
| `poyraz/docs/modes.md` | 2,162; 2026-10-04 | `AgentPolicy`, rather than host modes. | Possibly incomplete breaker documentation; example tool names differed from the host. Unverified. |
| `poyraz/docs/streaming.md` | 3,254; 2026-10-03 | `ChatHandlers` and stream events. | Uncertain. |
| `poyraz/docs/templates.md` | 705; 2026-09-29 | `AgentTemplate` JSON. | Uncertain. |
| `poyraz/docs/tools.md` | 2,910; 2026-10-04 | Filesystem, shell, and search presets. | Uncertain; preset names may differ from host MCP tools. |
| `poyraz/docs/workspace.md` | 641; 2026-09-29 | Workspace trust/log-directory ownership. | Uncertain. |

## 2. Candidate follow-up work

The statuses below belong to the original audit. They mean **open**, **partial**, **done**, or **unverified**; they are not a current roadmap. Original checks used file existence, text searches outside dependencies/build output, and Git history.

The proposed task header was:

```text
status: idea | ready | in-progress | review | done
priority: P0..P3
area: host | web | poyraz-lib | docs | process
acceptance: <one verifiable sentence>
source: <historical document>
```

### 2.1 Feature-roadmap candidates

| Topic | Proposal | Historical assessment |
|---|---|---|
| Virtual terminal | `terminal_open/send/read/read_last/list/close`, ring buffer, process-tree cleanup, and xterm.js UI. Decide pipe versus PTY and default shell. | Open. Searches found no `terminal_*`, xterm, or node-pty; only output-oriented `run_command`. |
| Grep and file discovery | Hard exclusions for secrets and symlinks, bounded output, deterministic ordering. | The original absence claim for grep was corrected after reorganization. Host grep existed; `find_files` did not. |
| Expert/selectivity model | Tool allow list, `expertId`, debug view, Experts tab. | Partial/redefined through workspace, agent, and policy catalogs (`coding`, `general`, `poyraz-agent`). `ExpertProfile` was absent; UI details were unverified. |
| General-to-coding guidance | Route longer tasks from general to coding. | Unverified; instruction text was not read. |
| Project instructions | Load `AGENTS.md` at startup into instructions. | Open in that snapshot; no matches or root file were found. |
| Project-scoped memory | Add a `project` field and limit coding memory to the active project. | Unverified; projects existed, but their memory relationship was not established. |
| Destructive-command approval | Ask before dangerous terminal patterns. | Partial; deletion and enabling MCP required approval, command-pattern approval was not verified. |
| Plan approval | Ask with `ask_question` after `plan_write`; avoid plans for work under three steps. | Open as originally proposed; the implementation instead used plan/agent policy separation and a Build action. Could be resolved as a design decision. |
| Plan listing/export | `plan_list`, `plan_export`, and export to `PLAN.md`. | Open; searches found neither tool. |
| Deferred ideas | Subagents, custom experts, node-pty, git diff, LSP/semantic search, and per-expert model/effort. | Open in the snapshot. Submodule instructions existed for subagents, but host production support had not been established. |
| Plan/todo MCP | Four tools, a UI card, PlanPanel, and mood integration. | Done in `38f0156`. |

### 2.2 Self-improving agent

The idea was a toggle that produces a task-end report and improves rules. Building blocks included `add_rule`, memory, and feedback-classification instructions. Missing pieces were the toggle and task-end evaluation flow. The audit connected this idea to the user's interest in a sustainable improvement cycle.

### 2.3 Web implementation-plan follow-ups

| Topic | Historical assessment |
|---|---|
| Web hierarchy | Done, with `ui/`, `lib/`, `styles/`, and MCP settings separation; the implementation differed from the proposed file split. The layering rule was `shell/chat/settings → ui → state → api/lib → shared`. |
| Responsive/mobile layout | Done in `038d0f2`. |
| Tailwind rejection | Superseded in practice by Tailwind v4 and the later frontend rules; needed an explicit decision record. |
| Remove `responsive.css` in favor of utility variants | Open; the file still existed. Suggested web backlog work. |

### 2.4 Cleanup-roadmap candidates

| Topic | Original evidence and qualification |
|---|---|
| Remove dead loop-hook paths | `loop-hooks.ts`, `loop-hook.test.ts`, `ensureLoopHook`, `continuationViaHook`, `loopHookContextFor`, `choosablePolicies`, and `canBeStartedBy`. Recorded search counts: six `ensureLoopHook`, five `choosablePolicies`, and one `getLoopHook`. |
| Consolidate permission checks | Replace `policyPermitsBuiltin` with `isToolAllowedInPolicy` in the plan service. References at `resolve.ts:69` and `plan-service.ts:15,59`. |
| Consolidate compilation | Keep system-prompt assembly focused on instructions; update its path to `catalog/prompts/system-prompt.ts`. |
| Actual explain context | Supply real availability, toolset, and `fullFileAccess` values. The explain header was not inspected, so status remained unverified. |
| Remove small remnants | `failedLabel`, duplicate `TODOS_START/END`, and an unread mode type. Recorded references included `chat-turn.ts:172,177` and `plan-store.ts:25,401,410`. |
| Fix documentation | Update backend paths, use canonical `policyId`, and resolve the ownership document's submodule restriction. |
| Split large implementations | File-access path boundaries, diffs, directory traversal, `changedFiles`, chat turns, agent pool, plan store, sessions, and AppState. The original 1082-line AppState count was later corrected to 1162. Other split candidates were not fully verified. File access lived under `host/src/tools/`, not `builtin/`. |

Other recorded capability gaps were a nonpersistent/nonreorderable message queue and output-only terminal cards without stdin. The disabled breaker was an intentional decision, not an automatic implementation task.

### 2.5 Behavior-audit follow-ups

| Finding | Severity | Historical follow-up assessment |
|---|---|---|
| Completion claimed after a tool-loop limit, and no rebuild after fixing a build error | High | Unverified. Instruction changes in `58dd2fa`, `fbd30bf`, and `66637a1` had not been behaviorally measured. |
| Internal `Tool loop limit reached (60)` exposed to users | Medium | Possibly open. The text remained at historical `decision-loop.ts:424`; whether it still reached users was not verified. |
| Excessive repeated calls: 74 searches and 48 terminal operations | Medium | Unverified. The audited search tool name did not match the main host tool list. |
| Chat action-menu keyboard support | Medium | Partial. Shared `Menu` supported arrow keys at historical lines 110 and 114; the custom chat-row menu was not checked. |
| Inconsistent memory-capability explanation | Low | Unverified behavioral finding. |
| Duplicate `streaming` declaration | High | Likely fixed by later commits, but no build was run during this audit. |

### 2.6 Architecture and breaker reports

The architecture report's twelve proposals included a large barrel export, shared-directory naming, `file:../poyraz`, broken Vitest references, and route/service separation. The proposal was one deferred summary backlog item until the architecture direction was decided.

Breaker reconsideration required a soft path, intact pairing repair, and review of the repeated-error threshold. Because disabling it was intentional, it belonged in a decision record rather than an assumed backlog commitment.

## 3. Duplication and contradictions

| Topic | Historical conflict | Proposed treatment |
|---|---|---|
| Duplicate editor pointers | Identical 233-byte rule pointers for two tools. | Retain intentionally and update together. |
| Catalog and file-ownership paths | Old `workspaces/*.ts` and nonexistent resolver references; an incorrect claim that `host/src/tools/` did not exist. | Follow source paths and fix documents during the move. |
| Whether the submodule was read-only | Ownership/CWAP documents prohibited changes; the cleanup roadmap allowed them. | Resolve the boundary explicitly; do not infer permission from a stale document. |
| `mode` versus `policyId` | Backend documentation described a mode endpoint, while code and ownership used policy. | Document canonical `policyId` and the policy route. |
| Multiple architecture summaries | Different dates, levels of detail, and layouts. | Prefer current source; keep outlines and historical reports clearly labeled. |
| Tailwind | Earlier rejection versus active v4 usage. | Mark the earlier decision superseded. |
| Testing policy | Blanket no-tests rules versus existing tests, a test gate, and roadmap test requirements. | Resolve explicitly rather than copy contradictory rules. |
| Two roadmaps | Feature and cleanup scopes shared an ambiguous name. | Extract separate backlog items and archive with distinct names. |
| Plan design versus implementation | JSON pair and list/export tools versus one `.plan.md` file and four tools. | Record actual behavior and archive the original proposal as historical. |
| Documentation language | Mixed Turkish and English. | The original audit asked for a policy. The current repository policy is English documentation; localized product text remains supported. |
| Architecture-report date | Internal 2026-06-03 versus Git date 2026-10-12. | Preserve and explain the uncertainty rather than silently invent a date. |
| Provider list | Library README omitted a provider supported by the host. | Handle as separate submodule documentation work. |

## 4. Proposed organization at the time

This was a proposal awaiting approval. The subsequent reorganization is documented separately.

```text
docs/
  architecture/   # Deferred, concise outlines
  decisions/      # Short architecture decision records
  backlog/        # One item per file, with status/priority/area/acceptance
  rules/          # Development rules
  archive/        # Historical sources
  reports/        # Audits and analysis
  reference/      # Optional links to submodule documentation
```

### 4.1 Proposed moves

| Source or new record | Destination/action |
|---|---|
| `docs/arch-cwap.md` | `docs/architecture/cwap.md`; add a draft banner and optionally fix catalog paths. |
| `docs/backend/README.md` | `docs/architecture/host-overview.md`; mark partly outdated, then decide whether to shorten. |
| `docs/circuit-breaker-report.md` | ADR 0001 with a short decision summary and the full report. |
| Tailwind decision | ADR 0002 documenting that the earlier rejection was superseded. |
| Additive-phase principles | ADR 0003; confirm continued applicability. |
| Single-file plan model | Optional ADR 0004. |
| `ROADMAP.md` | Extract backlog items, then `docs/archive/roadmap-features-2026-10.md`. |
| `IDEAS.md` | Extract the idea, then `docs/archive/IDEAS-2026-10.md`. |
| `docs/roadmap.md` | Extract tasks and architecture debt, then `docs/archive/roadmap-codebase-cleanup-2026-10.md`. |
| `implementation_plan.md` | `docs/archive/implementation_plan-web-refactor-and-mobile.md`. |
| `docs/architecture-report.md` | `docs/archive/architecture-report-2026-06.md`, with one summary follow-up. |
| `design-rules.md` | Optionally move under rules; update editor pointers and dependent references together. |
| `docs/srp.md` | Correct and move to `docs/rules/file-ownership.md`. |
| `.clinerules/general.md` and editor pointers | Retain in place; update moved targets. |
| `docs/feedbacks/2026-10-09.md` | `docs/reports/audits/2026-10-09-agent-behavior-audit.md`. |
| Thirteen Poyraz documents | Keep in the submodule; optional reference page only. |

### 4.2 Initial proposed backlog set

| Slug | Suggested priority | Area | Proposed state |
|---|---|---|---|
| `self-improving-agent` | P1 | host/poyraz-lib | idea |
| `virtual-terminal` | P1 | host/web | idea; pipe/PTY decision pending |
| `grep-find-files-tools` | P2 | host | idea; corrected grep status required |
| `agents-md-loading` | P2 | host | idea |
| `memory-project-scope` | P3 | host | idea; verify |
| `plan-list-export-tools` | P3 | host | idea |
| `command-destructive-approval` | P2 | host | idea; verify |
| `cleanup-dead-loop-hook` | P2 | host | ready |
| `cleanup-policy-permits-builtin` | P2 | host | ready |
| `consolidate-compile-fn` | P3 | host | idea |
| `explain-context-real-values` | P3 | host | idea |
| `cleanup-small-residues` | P3 | host | ready |
| `split-large-files` | P3 | host/web | idea; split into subtasks as needed |
| `remove-responsive-css-to-utilities` | P3 | web | idea |
| `docs-fix-stale-references` | P1 | docs | ready |
| `agent-behavior-audit-followups` | P1 | process/host | idea; verify |
| `architecture-open-findings` | P3 | process | idea; deferred |
| `message-queue-persist-reorder` | P3 | web | idea |

The final task count depended on approval and whether large-file work was split.

## 5. Questions raised by the historical audit

These are recorded questions, not new approval requests or current task instructions.

1. What is the permitted boundary for changes in the separately developed Poyraz submodule?
2. Should deferred architecture documents remain annotated drafts, become concise outlines, or be archived?
3. Should root design rules move, and which editor/configuration references must follow them?
4. Was the switch to Tailwind v4 intentional, superseding the earlier rejection?
5. Did workspace/agent/policy configuration replace the expert-system proposal, or should its UI features remain backlog ideas?
6. Which testing policy supersedes the contradictory old rules?
7. Are virtual-terminal and search-tool ideas still goals, and has pipe versus PTY been decided?
8. What language should documentation and backlog items use? This is now resolved by the English documentation policy.
9. Which date belongs to the architecture report, and are its twelve proposals still relevant?
10. Were the 2026-10-09 behavior findings addressed, and should the sessions be audited again?
11. Are P0-P3 priorities, the proposed areas, and one-file-per-task organization appropriate?
12. Should audits move from feedbacks to reports/audits rather than archive or backlog?
13. Should stale architectural facts such as the submodule commit, session field, and mood stylesheet be reconciled?
14. Should workspace-configuration path problems be inspected separately from Markdown work?

## 6. Additional observations from the snapshot

- There was no root README at that time; the audit proposed a documentation index. A root README exists in the current repository.
- Build and release output directories were outside the inventory scope.
- `scripts/setup-tunnel.ps1` was undocumented and outside the task.
- The snapshot had `main`, `master`, and `test` branches. The parent and submodule used separate remotes; these were historical configuration observations.
- The historical process expected the user to make commits manually. This report records that process without creating a new instruction for future work.
