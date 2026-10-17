import type { ModelProfile, Settings } from '../../../shared/types.ts';
import { ACCENT_COLORS, DEFAULT_SETTINGS, isProviderKind, TEXT_SIZES, THEMES, TOOL_USAGE_VIEW_MODES } from '../../../shared/types.ts';
import { settingsPath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { dataLock as exclusive } from '../infra/data-lock.ts';
import { canonicalizeProfile } from '../domain/profiles.ts';
import { AGENT_BY_ID } from '../agent/catalog/agents.ts';

export async function readSettings(): Promise<Settings> {
  return exclusive(async () => {
    const stored = await readJson<Partial<Settings>>(settingsPath(), {});
    return normalizeSettings(stored);
  });
}

export async function writeSettings(patch: unknown): Promise<Settings> {
  return exclusive(async () => {
    const current = normalizeSettings(await readJson<Partial<Settings>>(settingsPath(), {}));
    const updates = asRecord(patch) ?? {};
    if ('agentProfiles' in updates) normalizeAgentProfiles(updates.agentProfiles, true);
    const next = normalizeSettings({ ...current, ...updates });
    await writeJson(settingsPath(), next);
    return next;
  });
}

function normalizeSettings(value: Partial<Settings> & { poyrazInstructionsEnabled?: boolean }): Settings {
  value = { ...value, xeckInstructionsEnabled: value.xeckInstructionsEnabled ?? value.poyrazInstructionsEnabled };
  const theme = THEMES.includes(value.theme as Settings['theme'])
    ? (value.theme as Settings['theme'])
    : DEFAULT_SETTINGS.theme;
  const textSize = TEXT_SIZES.includes(value.textSize as Settings['textSize'])
    ? (value.textSize as Settings['textSize'])
    : DEFAULT_SETTINGS.textSize;
  const accent = ACCENT_COLORS.includes(value.accent as Settings['accent'])
    ? (value.accent as Settings['accent'])
    : DEFAULT_SETTINGS.accent;

  return {
    defaultProfile: normalizeOptionalProfile(value.defaultProfile),
    agentProfiles: normalizeAgentProfiles(value.agentProfiles),
    autocompleteProfile: normalizeOptionalProfile(value.autocompleteProfile),
    systemInstructions: typeof value.systemInstructions === 'string' ? value.systemInstructions : DEFAULT_SETTINGS.systemInstructions,
    xeckInstructionsEnabled:
      typeof value.xeckInstructionsEnabled === 'boolean'
        ? value.xeckInstructionsEnabled
        : DEFAULT_SETTINGS.xeckInstructionsEnabled,
    workspaceRoot: typeof value.workspaceRoot === 'string' ? value.workspaceRoot.trim() : DEFAULT_SETTINGS.workspaceRoot,
    fullFileAccess: value.fullFileAccess === true,
    enterToSend: typeof value.enterToSend === 'boolean' ? value.enterToSend : DEFAULT_SETTINGS.enterToSend,
    showReasoning:
      typeof value.showReasoning === 'boolean' ? value.showReasoning : DEFAULT_SETTINGS.showReasoning,
    theme,
    textSize,
    accent,
    showUsage: typeof value.showUsage === 'boolean' ? value.showUsage : DEFAULT_SETTINGS.showUsage,
    showTokenSpeed:
      typeof value.showTokenSpeed === 'boolean' ? value.showTokenSpeed : DEFAULT_SETTINGS.showTokenSpeed,
    hideToolUsages: value.hideToolUsages === true,
    toolUsageViewMode: TOOL_USAGE_VIEW_MODES.includes(value.toolUsageViewMode as Settings['toolUsageViewMode'])
      ? value.toolUsageViewMode as Settings['toolUsageViewMode']
      : DEFAULT_SETTINGS.toolUsageViewMode,
    debugMode: value.debugMode === true,
  };
}

function normalizeOptionalProfile(value: Settings['defaultProfile'] | undefined): ModelProfile | null {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.provider !== 'string' || !isProviderKind(value.provider)) return null;
  if (typeof value.model !== 'string' || !value.model.trim()) return null;
  return canonicalizeProfile({
    provider: value.provider,
    model: value.model.trim(),
    host: typeof value.host === 'string' ? value.host : '',
  });
}

function normalizeAgentProfiles(value: unknown, strict = false): Settings['agentProfiles'] {
  if (value === undefined) return {};
  const entries = asRecord(value);
  if (!entries) {
    if (strict) throw new Error('Agent model selections must be an object.');
    return {};
  }
  const profiles: Settings['agentProfiles'] = {};
  for (const [agentId, selected] of Object.entries(entries)) {
    if (!AGENT_BY_ID[agentId]?.startableBy.includes('agent')) {
      if (strict) throw new Error(`Agent '${agentId}' is not a subagent.`);
      continue;
    }
    if (selected === null) {
      profiles[agentId] = null;
      continue;
    }
    const profile = normalizeOptionalProfile(selected as ModelProfile);
    if (!profile) {
      if (strict) throw new Error(`Invalid model selection for '${agentId}'.`);
      continue;
    }
    profiles[agentId] = profile;
  }
  return profiles;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
