import { LANGUAGES, ACCENT_COLORS, DEFAULT_SETTINGS, TOOL_USAGE_VIEW_MODES, type AgentPublic, type CatalogEntry, type Project, type ProviderPublic, type SessionSummary, type Settings, type StoredSession } from '../../../shared/types.ts';
import { getSettings, listAgents, listCatalog, listProjects, listProviders, listSessions } from '../api/client.ts';

let bootPromise: Promise<{
  sessions: SessionSummary[];
  projects: Project[];
  settings: Settings;
  providers: ProviderPublic[];
  catalog: CatalogEntry[];
  agents: AgentPublic[];
  active: StoredSession | null;
}> | null = null;
export function displaySettings(settings: Settings): Settings {
  const accent = ACCENT_COLORS.includes(settings.accent) ? settings.accent : DEFAULT_SETTINGS.accent;
  return {
    ...settings,
    language: LANGUAGES.includes(settings.language) ? settings.language : DEFAULT_SETTINGS.language,
    systemInstructions: typeof settings.systemInstructions === 'string' ? settings.systemInstructions : '',
    xeckInstructionsEnabled: settings.xeckInstructionsEnabled !== false,
    accent,
    showUsage: typeof settings.showUsage === 'boolean' ? settings.showUsage : true,
    showTokenSpeed: typeof settings.showTokenSpeed === 'boolean' ? settings.showTokenSpeed : true,
    hideToolUsages: settings.hideToolUsages === true,
    toolUsageViewMode: TOOL_USAGE_VIEW_MODES.includes(settings.toolUsageViewMode)
      ? settings.toolUsageViewMode : DEFAULT_SETTINGS.toolUsageViewMode,
    debugMode: settings.debugMode === true,
  };
}

export function bootApp() {
  if (!bootPromise) {
    bootPromise = loadInitialState().catch((error: unknown) => {
      bootPromise = null;
      throw error;
    });
  }
  return bootPromise;
}

async function loadInitialState() {
  const [nextSessions, projects, settings, providers, catalog, agents, botAgents] = await Promise.all([
    listSessions(),
    listProjects(),
    getSettings(),
    listProviders(),
    listCatalog(),
    listAgents(),
    listAgents('bot'),
  ]);
  return {
    sessions: nextSessions,
    projects,
    settings: displaySettings(settings),
    providers,
    catalog,
    agents: [...agents, ...botAgents],
    active: null,
  };
}
