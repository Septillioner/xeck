# Documentation reorganization report

- **Date:** 2026-10-15, Europe/Istanbul.
- **Author:** Grok Bot, with Ege's approval.
- **Scope:** Documentation only. Application code, the Poyraz submodule, root design rules, and editor configuration were not changed by the historical reorganization. Changes were staged for the user; no commit or push was made.
- **Starting point:** `main`, HEAD `66637a1`, with the new inventory report as the only working-tree change. The submodule gitlink was `169cc90`.
- **Source report:** [Documentation inventory](docs-inventory.md).

This is a historical record translated into English. Paths below describe the reorganization at that time; some archived or local files are absent from the current public checkout. Local-only note references have been removed from this public edition.

## 1. Moves recorded with `git mv`

| Source | Destination |
|---|---|
| `docs/arch-cwap.md` | `docs/architecture/cwap.md`, with a draft/deferred banner and corrected paths. |
| `docs/backend/README.md` | `docs/architecture/host-overview.md`, initially marked partly outdated. |
| `docs/circuit-breaker-report.md` | `docs/decisions/0001-error-circuit-breaker-off.md`, with a decision summary. |
| `docs/srp.md` | `docs/rules/file-ownership.md`, with path corrections. |
| `docs/feedbacks/2026-10-09.md` | `docs/reports/audits/2026-10-09-agent-behavior-audit.md`. |
| `docs/architecture-report.md` | `docs/archive/architecture-report-2026-06.md`. |
| `ROADMAP.md` | `docs/archive/roadmap-features-2026-10.md`. |
| `IDEAS.md` | `docs/archive/IDEAS-2026-10.md`. |
| `docs/roadmap.md` | `docs/archive/roadmap-codebase-cleanup-2026-10.md`, with corrected links and paths. |
| `implementation_plan.md` | `docs/archive/implementation_plan-web-refactor-and-mobile.md`. |
| Untracked `docs/docs-inventory.md` | `docs/reports/docs-inventory.md`. |

The empty `docs/backend/` and `docs/feedbacks/` directories were removed. `design-rules.md`, `.clinerules/*`, `.cursor/rules/*`, and `poyraz/**` were left in place.

Short moved-file pointers were initially retained at `docs/srp.md` and `docs/circuit-breaker-report.md` for older references. Consequently, Git could display those as modified files plus new destinations rather than renames.

## 2. New documents

The reorganization added documentation, architecture, rules, and decisions indexes; ADRs 0002, 0003, and 0004; a backlog index; and the backlog items below. ADRs 0002 and 0003 were initially proposed. Consult each current ADR for its later status.

## 3. Historical backlog snapshot

The source report described 32 backlog files under the then-used `docs/backlog/` directory. This table records that snapshot, not current task status.

| ID | Topic | Recorded status | Priority |
|---|---|---|---|
| 001 | Self-improving agent toggle | idea | P1 |
| 002 | Persistent virtual terminal with six tools | idea | P1 |
| 003 | Host grep tool | done | P2 |
| 004 | `find_files` tool | removed; merged into 033 | — |
| 005 | Hard exclusions for search tools | removed; merged into 033 | — |
| 006 | Load project instructions from `AGENTS.md` | idea | P2 |
| 007 | Project-scoped memory | idea | P3 |
| 008 | `plan_list` and `plan_export` tools | idea | P3 |
| 009 | Destructive-command approval for terminal execution | idea | P2 |
| 010 | Expert system, `ExpertProfile`, settings tab, and selector | idea | P3 |
| 011 | Instructions routing general-agent work to coding | idea | P3 |
| 012 | Approval with `ask_question` after `plan_write` | idea | P3 |
| 013 | Remove the dead loop-hook path | ready | P2 |
| 014 | Replace `policyPermitsBuiltin` with `isToolAllowedInPolicy` in plan services | ready | P2 |
| 015 | Consolidate compilation into one function | idea | P3 |
| 016 | Supply actual runtime values to live explain context | idea | P3 |
| 017 | Remove small unused remnants | ready | P3 |
| 018 | Split large files by responsibility | idea | P3 |
| 019 | Move `responsive.css` behavior to utility variants | idea | P3 |
| 020 | Fix stale documentation paths | review | P1 |
| 021 | Follow up agent-behavior audit findings | idea | P1 |
| 022 | Deferred open architecture findings | idea | P3 |
| 023 | Persist and reorder the message queue | idea | P3 |
| 024 | Terminal stdin and interactive commands | idea | P3 |
| 025 | Production subagent support | idea | P3 |
| 026 | Deferred `git_diff`, LSP/semantic search, node-pty, and per-expert model ideas | idea | P3 |
| 027 | Resolve contradictory testing rules | idea | P1 |
| 028 | Resolve documentation-organization questions | idea | P2 |
| 029 | Reconcile stale architecture notes with implementation | ready | P1 |
| 030 | Plan/todo MCP: `plan_write`, `plan_read`, `todo_update`, `todo_add` | done | P2 |
| 031 | Web hierarchy: `ui/`, `lib/`, `styles/`, `settings/mcp/` | done | P2 |
| 032 | Responsive/mobile layout | done | P2 |

Items 002, 004, 010, 011, and 012 were explicitly awaiting decisions rather than approved implementation work. The self-improving agent remained an idea.

## 4. Reference corrections

- The CWAP draft changed `workspaces/{policies,agents,workspaces}.ts` to `catalog/*.ts`, nonexistent `core/policy-resolve.ts` to `core/definitions/`, and tool implementation paths from `builtin/` to `host/src/tools/`.
- File ownership received the same catalog corrections, an updated architecture link, and removal of the incorrect claim that `host/src/tools/` did not exist.
- The cleanup roadmap adjusted relative links for its deeper archive location. References to backend, ownership, and CWAP documents followed the moves. Agent and system-prompt paths were corrected to `catalog/`; file operations were corrected to `host/src/tools/file-access.ts`.
- ADR 0001 received an updated system-prompt path note; its historical line numbers were not reverified.
- The original link scan reported no broken relative links at the time. This does not guarantee the same paths exist in today's public checkout.

## 5. Recorded stale architecture details

Historical reconciliation work identified:

1. A pinned commit reference of `0ddf1a7...` versus the then-current submodule gitlink `169cc907c25e2f30c2a48e42dd27fd839d144e88`.
2. A description of stored session `mode` where `shared/types.ts` used `policyId`. New public documentation used the canonical field.
3. Mood-color references to `styles.css` after the rules moved to `web/src/styles/mood.css`.
4. References to the old ownership and circuit-breaker document locations, initially served by moved-file pointers.

## 6. Corrections to the inventory

A second check corrected two inventory claims: the host did have a grep tool at `host/src/agent/tools/builtin/grep.ts` from commit `fbd30bf`, while `find_files` was absent; `AppState.tsx` had 1162 lines at that check.

## 7. Items deliberately left unverified

- A stale `styles.css` reference near line 27 of the old root design rules.
- The host overview's earlier source tree and endpoint list, initially addressed only with a status banner.
- The CWAP draft's claim that only an adapter could import from `poyraz`, and its other implementation claims.
- Historical line numbers in ADR 0001 and the original migration commit/rationale behind ADR 0002.
- Detailed implementation status of backlog items 005, 007, 009, 011, 016, and 021.
- Thirteen submodule documentation files, workspace configuration paths, and the testing-rule contradiction in editor configuration.

## 8. Open questions at the time

The source report assigned the unresolved documentation questions to backlog 028 and the testing-rule conflict to backlog 027. These historical references are not instructions to stop current authorized work.

## 9. Verification

The original reorganization changed no source code and did not run `npm test`. The English translation and public-reference cleanup are separate documentation changes.
