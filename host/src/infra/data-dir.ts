import os from 'node:os';
import path from 'node:path';

const DATA_DIR_NAME = 'xeck';

export function applicationDataDirectories() {
  const appData = process.env.APPDATA;
  const base = path.resolve(appData?.trim() || os.homedir());
  const current = path.join(base, DATA_DIR_NAME);
  const legacy = path.join(base, 'poyraz-web');
  return { base, current, legacy };
}

export function resolveDataDir(): string {
  return applicationDataDirectories().current;
}

export function settingsPath(): string {
  return path.join(resolveDataDir(), 'settings.json');
}

export function providersPath(): string {
  return path.join(resolveDataDir(), 'providers.json');
}

export function catalogPath(): string {
  return path.join(resolveDataDir(), 'catalog.json');
}

export function rulesDir(): string {
  return path.join(resolveDataDir(), 'rules');
}

export function skillsDir(): string {
  return path.join(resolveDataDir(), 'skills');
}

export function legacyRulesPath(): string {
  return path.join(resolveDataDir(), 'rules.json');
}

export function legacySkillsPath(): string {
  return path.join(resolveDataDir(), 'skills.json');
}

export function rulesPath(): string {
  return legacyRulesPath();
}

export function skillsPath(): string {
  return legacySkillsPath();
}

export function mcpPath(): string {
  return path.join(resolveDataDir(), 'mcp.json');
}

export function memoriesPath(): string {
  return path.join(resolveDataDir(), 'memories.json');
}

export function sessionIndexPath(): string {
  return path.join(resolveDataDir(), 'sessions', 'index.json');
}

export function sessionFilePath(id: string): string {
  return path.join(resolveDataDir(), 'sessions', `${id}.json`);
}

/** One session's plan files. Sits next to `<id>.json` as `<id>/plans/<slug>.plan.md`. */
export function sessionDir(id: string): string {
  return path.join(resolveDataDir(), 'sessions', id);
}

export function sessionPlansDir(id: string): string {
  return path.join(sessionDir(id), 'plans');
}

export function projectFilePath(): string {
  return path.join(resolveDataDir(), 'projects.json');
}
