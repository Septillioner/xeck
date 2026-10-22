# ADR 0002 — Tailwind CSS v4 for the web interface

- **Status:** Accepted by Ege on 2026-10-15.
- **Recorded:** 2026-10-15.
- **Earlier decision, superseded:** The 2026-10-04 mobile implementation plan rejected Tailwind. At that time the migration was judged too costly given 391 `className` uses, 506 CSS rules, a registered `--accent` transition, 65 token variables, and the earlier design rules' Tailwind prohibition.
- **Selected approach:** `web/package.json` uses `tailwindcss` and `@tailwindcss/vite` at `^4.3.3`. Shared CSS lives in `web/src/styles/`, with tokens in the `@theme` block of `theme.css`. [Frontend rules](../rules/frontend.md) establish Tailwind v4 as the standard.
- **Consequence:** The earlier rejection is historical. The recorded remaining migration work was to move `responsive.css` behavior into utility variants.
- **Rationale:** Avoid growing separate CSS rule sets when shared utilities can express the same behavior.
