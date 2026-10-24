<div align="center">

<img src="assets/branding/xeck.png" alt="Xeck logo" width="112" height="112" />

# Xeck

### Your workspace for AI conversations and agents.

A local-first desktop app with personal XeckBots, connected tools, and your choice of model provider.

[![Beta release](https://img.shields.io/github/v/release/Septillioner/xeck?include_prereleases&style=flat-square&color=8b5cf6&label=release)](https://github.com/Septillioner/xeck/releases)
[![CI](https://github.com/Septillioner/xeck/actions/workflows/ci.yml/badge.svg)](https://github.com/Septillioner/xeck/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
![Platforms: Windows, macOS, Linux](https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-52525b?style=flat-square)

**[Download beta](https://github.com/Septillioner/xeck/releases/tag/v4.4.0-beta.2)** · **[Features](#features)** · **[Installation](#desktop-installation)** · **[Development](#development)** · **[Credits](#credits)**

</div>

---

## Features

- **Photos in chat:** attach PNG, JPEG, or WebP images using the photo button, clipboard paste, or drag and drop. Preview and remove photos before sending; sent photos stay in the local conversation history. Use a vision-capable model. Up to four photos per message, 5 MB each and 10 MB total.

- **Chat with your preferred models.** Configure model providers and organize conversations by project.
- **Create your own XeckBots.** Give each bot a name, color, and purpose, with its own generated instructions.
- **Let bots collaborate.** XeckBots exchange messages in dedicated bot conversations.
- **Connect your tools.** Extend agents through MCP servers, skills, rules, and project tools.
- **Keep your workspace local.** Conversations and settings are stored on your device. Model and MCP requests use the providers and services you configure.
- **Edit naturally.** Native desktop right-click menus support cut, copy, paste, undo, redo, select all, and copying link addresses.
- **Choose your language.** Turkish and English interfaces, with a system-language option.

Built with **React**, **Electron**, and a local **Node.js** host. Agent execution is powered by [Poyraz](https://github.com/Septillioner/poyraz).

> **Beta:** See the release notes before upgrading. Packages are available for Windows, macOS, and Linux.

## Explore

[Install](#desktop-installation) · [Tools](#tools) · [Local data](#application-data) · [Develop](#development) · [Package](#build-and-package) · [Contribute](#contributing-and-security)

---

## Desktop installation

Download an installer from [GitHub Releases](https://github.com/Septillioner/xeck/releases). The current beta includes:

- **Windows:** x64 installer (`.exe`)
- **macOS:** Apple Silicon and Intel disk images (`.dmg`)
- **Linux:** x64 and ARM64 AppImage / Debian packages

Choose the file matching your operating system and processor, then follow the steps below. You can also [build from source](#development).

### Windows

Download and run the Xeck `.exe` installer, then open Xeck from the Start menu.

### macOS

Choose `arm64` for Apple Silicon or `x64` for Intel. Open the `.dmg`, drag Xeck into Applications, then launch it.

These builds are unsigned and not notarized. macOS may require allowing the application in **System Settings → Privacy & Security → Open Anyway** after the first launch attempt.

### Linux

Choose `x64` for Intel/AMD or `arm64` for ARM64. For Debian/Ubuntu, install the downloaded package:

```bash
sudo apt install ./Xeck-<version>-linux-<arch>.deb
```

Alternatively, make the AppImage executable and launch it:

```bash
chmod +x Xeck-*.AppImage
./Xeck-<version>-linux-<arch>.AppImage
```

AppImage requires FUSE support. If FUSE is unavailable, use the Debian package or launch with `--appimage-extract-and-run`. A graphical desktop session is required.

### Tools

Content search requires **ripgrep** (`rg`) on PATH:

```bash
# macOS (Homebrew)
brew install ripgrep
# Debian/Ubuntu
sudo apt install ripgrep
# Windows (PowerShell)
winget install BurntSushi.ripgrep.MSVC
```

MCP servers may require additional runtimes such as Node.js/npm or Python. Install the runtimes required by your configured servers and make them available on PATH.

## Application data

Fresh installations store host data in:

- Windows: `%APPDATA%/xeck`
- macOS: `~/Library/Application Support/xeck`
- Linux: `$XDG_CONFIG_HOME/xeck`, defaulting to `~/.config/xeck`

Existing Unix installations in `~/xeck`, and legacy `~/poyraz-web` installations, retain their original parent directory so their data and migration choices remain available. An explicit `APPDATA` override takes precedence. Electron preferences use a separate `xeck-desktop` directory under the platform application data directory, with compatibility for previous installations.

## Development

### Requirements

- Node.js 22 LTS recommended (minimum 20), npm, and Git
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Linux Debian packaging: `ar` from `binutils`

### Run from source

Clone the repository with its pinned submodule, then install dependencies:

```bash
git clone --recurse-submodules https://github.com/Septillioner/xeck.git
cd xeck
npm ci
npm ci --prefix poyraz
npm run build:lib
npm ci --prefix host
npm ci --prefix web
```

For an existing clone missing submodules:

```bash
git submodule update --init --recursive
```

Start the host and web development servers:

```bash
npm run dev
```

Leave this running and open the Electron window in a second terminal:

```bash
npm run dev:electron
```

Vite proxies API requests to `127.0.0.1:8787`. Packaged applications start their own host on `127.0.0.1:18787`. Configure provider credentials in the application.

## Build and package

Build on the target operating system. macOS packaging requires macOS; use the CI matrix for builds on all three platforms.

```bash
npm run dist:win    # Windows NSIS installer
npm run dist:mac    # macOS DMG, Intel and Apple Silicon
npm run dist:linux  # Linux AppImage and deb, x64 and ARM64
```

Each command builds desktop components before packaging. `npm run dist` selects the current platform. Output is written to `build/release/`. The existing Windows `npm run build-release` command writes to `build/release-build/`.

Packages are unsigned unless signing credentials are configured separately. Build outputs are ignored by Git.

The [Desktop packages workflow](https://github.com/Septillioner/xeck/actions/workflows/desktop.yml) builds on Windows, macOS, and Linux. Manual runs upload workflow artifacts; version tags publish release packages after every platform build succeeds. Prerelease tags are marked as prereleases.

Windows and AppImage builds check GitHub Releases for updates and ask before downloading or restarting. You can also check in Settings → General → Application updates. See [desktop update and release instructions](docs/desktop-updates.md) for rollout steps and platform limits.

## Tests

```bash
npm test
npm run test:i18n
```

## Repository layout

- `web/`: React and Vite interface
- `host/`: Local API, agents, tools, and application data
- `electron/`: Desktop process and preload bridge
- `shared/`: Shared types and utilities
- `poyraz/`: Agent runtime submodule
- `assets/branding/`: Application icons
- `docs/`: Architecture and engineering guidance

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Never commit API keys, `.env` files, user data, logs, or build outputs.

## Credits

Model pricing and context-window metadata includes data from [LiteLLM](https://github.com/BerriAI/litellm) by [BerriAI](https://github.com/BerriAI) (@BerriAI), used under the MIT license. Thank you to its maintainers and contributors. See [third-party notices](THIRD_PARTY_NOTICES.md) for the source and license.

---

<div align="center">

**Xeck** · Licensed under [Apache 2.0](LICENSE)

Third-party components retain their own licenses.

</div>
