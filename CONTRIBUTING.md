# Contributing to Xeck

Thanks for considering a contribution. Xeck is licensed under the [Apache License 2.0](LICENSE). Unless explicitly stated otherwise, contributions submitted for inclusion in Xeck are provided under the same license. Third-party components retain their own licenses.

## Before you start

- Search existing issues and pull requests to avoid duplicate work.
- For a large change, open an issue first to discuss the approach.
- Keep changes focused and update relevant documentation.
- Do not modify the `poyraz/` submodule as part of Xeck work unless the change specifically concerns the submodule; Poyraz has its own repository and contribution process.

## Development setup

Follow the setup steps in [README.md](README.md), including initializing Git submodules. Use Node.js 20 or later.

## Pull requests

- Explain the problem and the behavior of the proposed change.
- Include steps to reproduce or verify user-visible changes.
- Run `npm test` for host changes and build the affected package when practical.
- Add or update tests for changed behavior.
- Keep credentials, personal data, generated output, and unrelated formatting changes out of the diff.
- Do not claim a check passed unless it was run.

## Code and documentation

Follow nearby conventions and the applicable guidance in `docs/rules/`. User-facing documentation should be concise and clear. Do not include real secrets in examples; use unmistakable placeholders.
