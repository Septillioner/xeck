# Xeck

**Xeck is a local-first AI chat application for Windows, macOS, and Linux.** It combines a React interface, a local Node.js host, and an Electron desktop shell. Agent runtime functionality is provided by [Poyraz](https://github.com/Septillioner/poyraz), included as a Git submodule.

> **License status:** This repository does not currently include a license. Until a license is selected and added by the project owner, all rights are reserved by default; do not assume the code is open source or reusable.

## Features

- Local desktop application built with Electron
- React and Vite web interface
- Local host API bound to `127.0.0.1:8787`
- Provider, tool, project, memory, plan, rule, and skill support
- Application data stored in the operating system's user data directory

## Requirements

- Node.js 20 or later
- npm
- Git with submodule support

## Getting started

Clone the repository with its pinned Poyraz submodule:

```bash
git clone --recurse-submodules <repository-url>
cd <repository-directory>
npm install
npm install --prefix host
npm install --prefix web
npm install --prefix poyraz
```

If you already cloned without submodules, run:

```bash
git submodule update --init --recursive
```

Start the host and web development servers:

```bash
npm run dev
```

The Vite development server proxies API requests to the local host. Configure provider credentials inside the application; do not put real credentials in source files or commit them.

## Build and package

```bash
npm run build:desktop
npm run dist
```

Create a Windows installer with:

```bash
npm run build-release
```

Build outputs are written under `build/` and are not tracked by Git.

## Tests

```bash
npm test
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `web/` | React and Vite user interface |
| `host/` | Local API, agent orchestration, and application data |
| `electron/` | Electron main process and preload bridge |
| `shared/` | Types and utilities shared by host and web |
| `poyraz/` | Poyraz agent runtime Git submodule |
| `assets/branding/` | Application branding assets |
| `docs/` | Architecture, decisions, and engineering guidance |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Bug reports and feature requests can be filed through GitHub Issues once the repository is published.

## Security

Please see [SECURITY.md](SECURITY.md) for responsible vulnerability reporting. Never commit API keys, `.env` files, user data, logs, or build outputs.

## License

No license has been selected for Xeck yet. The Poyraz submodule has its own license; it does not grant rights to this repository.
