# ADR 0004 — A plan is one `.plan.md` file

- **Status:** Accepted; implemented in commit `38f0156`.
- **Recorded:** 2026-10-15.
- **Decision:** Store each plan at `sessions/<id>/plans/<slug>.plan.md`. Front matter (`name`, `revision`, and `todos`) is the single source of truth; there is no separate JSON file. Render the todo block between generated `<!-- todos:start -->` markers.
- **States:** `pending`, `in_progress`, `completed`, `blocked`, and `cancelled`. Tool-level rules allow one `in_progress` todo at a time, require evidence for completion and a reason for blocking, prohibit deleting completed todos, and limit a plan to 30 todos and a 120-character title.
- **Tools:** `plan_write`, `plan_read`, `todo_update`, and `todo_add`. There is no `plan_list` or `plan_export` tool in this design.
- **Difference from the earlier proposal:** The `plans/<id>.md` plus JSON pair and a post-plan `ask_question` approval step were not implemented. Plan/agent policy separation governs the workflow instead.
- **Historical source:** The earlier roadmap's plan and todo MCP proposal. The implemented session-local path supersedes its storage proposal.
