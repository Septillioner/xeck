# ADR 0003 — Additive, independently releasable phases

- **Status:** Proposed. Extracted from the principles in the earlier roadmap; continued applicability requires a maintainer decision.
- **Recorded:** 2026-10-15; the original roadmap principles date from 2026-10-05.
- **Proposed principles:**
  - Make additive progress: each phase adds behavior without removing existing tools.
  - Each phase is independently releasable. The application still starts normally, and the new feature is optional.
  - Add tools to the built-in `poyraz` MCP server while preserving the `mcp_poyraz__<tool>` bridge naming convention.
  - Keep privileged access off by default. Existing restrictions still apply while `fullFileAccess` is disabled.
  - Write tool descriptions in English.
