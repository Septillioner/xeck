import type { MessageEdit } from '../../../shared/types.ts';
import type { BotGroup } from '../../../shared/bot-groups.ts';
import { createContext, useContext } from 'react';
import { ApiError } from '../api/client.ts';
import type {
  AgentPublic,
  CatalogEntry,
  ChangedFile,
  ModelProfile,
  PlanSnapshot,
  PlanStatus,
  PlanView,
  Project,
  ProviderKind,
  ProviderPublic,
  ProviderUpdate,
  ReasoningEffort,
  ServiceTier,
  SessionPolicyId,
  SessionSummary,
  Settings,
  SettingsTab,
  StoredSession,
} from '../../../shared/types.ts';
import type { BotMood } from './mood.ts';
import type { StreamingState } from './live-types.ts';

/** Which artifacts view the pane is showing. */
export type ArtifactTab = 'plans' | 'changes';

export interface QueuedMessage {
  id: string;
  content: string;
}

export interface AppStateValue {
  ready: boolean;
  loadError: string | null;
  sessions: SessionSummary[];
  projects: Project[];
  active: StoredSession | null;
  settings: Settings;
  providers: ProviderPublic[];
  settingsOpen: boolean;
  migrationOpen: boolean;
  openMigration: () => void;
  settingsTab: SettingsTab;
  /** Project whose chat list page fills the main pane. Null on chats, draft and settings. */
  botsOpen: boolean;
  workspace: 'chats' | 'bots';
  openChats: () => void;
  botProfileId: string | null;
  setBotProfileId: (id: string | null) => void;
  botCreateOpen: boolean;
  setBotCreateOpen: (open: boolean) => void;
  botGroups: BotGroup[];
  botGroupsError: string | null;
  botGroupsLoading: boolean;
  refreshBotGroups: () => Promise<void>;
  saveBotGroup: (id: string | null, name: string) => Promise<void>;
  deleteBotGroup: (id: string) => Promise<void>;
  assignBotGroup: (botId: string, groupId: string | null) => Promise<void>;
  openBots: () => void;
  createBot: (bot: import('../../../shared/types.ts').XeckBotCreateInput) => Promise<void>;
  projectPageId: string | null;
  openProjectPage: (id: string) => void;
  /** Mobile drawer only. The sidebar is always visible at 1024px and up. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Debug pane visibility. Lifted here so the mobile top bar can toggle it. */
  debugOpen: boolean;
  setDebugOpen: (open: boolean) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  draft: string;
  setDraft: (value: string) => void;
  /** Catalog behind the empty-state agent picker. */
  agents: AgentPublic[];
  /**
   * Agent picked on the empty state. Written by the picker, read once when the
   * first send creates the session — no session exists before that.
   */
  draftAgentId: string;

  setDraftAgentId: (id: string) => void;
  /** Initial policy for a session that has not been created yet. */
  draftPolicyId: string;
  setDraftPolicyId: (policyId: string) => void;
  error: string | null;
  catalog: CatalogEntry[];
  configuredModels: ModelProfile[];
  draftProfile: ModelProfile | null;
  draftEffort: ReasoningEffort | null;
  draftServiceTier: ServiceTier | null;
  /** Project the draft will be created in. Null for a plain new chat. */
  draftProjectId: string | null;
  streamingIds: string[];
  streaming: StreamingState | null;
  activeMood: BotMood;
  sessionMoods: Record<string, BotMood>;
  /** Plan of the open chat. Null while it has none. */
  plan: PlanSnapshot | null;
  /** Policy of the open chat. Falls back to the agent default while loading. */
  policyId: SessionPolicyId;
  /** Workspace toolset includes the plan tools. */
  planSurface: boolean;
  /** Plan surface is on and the selected policy is not the workspace default. */
  offerBuild: boolean;
  policyBusy: boolean;
  planPanelOpen: boolean;
  /** Full document of the active plan, or null when the chat has none. */
  planView: PlanView | null;
  /** The files this chat changed, one row per file. */
  changedFiles: ChangedFile[];
  /** Which artifacts tab the pane is showing. */
  artifactTab: ArtifactTab;
  setArtifactTab: (tab: ArtifactTab) => void;
  planPanelLoading: boolean;
  setPolicyId: (policyId: string) => Promise<void>;
  togglePlanTodo: (todoId: string, status: PlanStatus) => Promise<void>;
  openPlanPanel: () => Promise<void>;
  closePlanPanel: () => void;
  /** Build: move the chat to the agent policy and start implementing the plan. */
  buildPlan: () => Promise<void>;
  createChat: (projectId?: string) => void;
  createProject: (name: string) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<Project>;
  setProjectPinned: (id: string, pinned: boolean) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  assignChatToProject: (sessionId: string, projectId: string | null) => Promise<void>;
  openChat: (id: string) => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  updateBotProfile: (id: string, systemPrompt: string, badges: string[], details?: { title: string; botColor: import('../../../shared/types.ts').BotColor; botPurpose: string }) => Promise<void>;
  updateChatOrganization: (id: string, patch: { pinned?: boolean; archived?: boolean }) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  setSessionModel: (provider: ProviderKind, model: string) => Promise<void>;
  setSessionEffort: (effort: ReasoningEffort | null) => Promise<void>;
  setSessionServiceTier: (tier: ServiceTier | null) => Promise<void>;
  queuedMessages: QueuedMessage[];
  enqueueMessage: (content: string) => void;
  removeQueuedMessage: (id: string) => void;
  send: (content?: string, options?: { preserveDraft?: boolean; onAccepted?: () => void; onError?: (message: string) => void; edit?: MessageEdit }) => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
  respondDialog: (dialogId: string, response: { approved?: boolean; response?: string; selections?: string[]; other?: string }) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  saveProvider: (kind: ProviderKind, patch: ProviderUpdate) => Promise<void>;
  addCatalogModel: (
    provider: ProviderKind,
    model: string,
    name: string,
    contextLength?: number,
    supportsReasoningEffort?: boolean,
  ) => Promise<void>;
  removeCatalogModel: (slug: string) => Promise<void>;
  updateCatalogContextLength: (slug: string, contextLength: number | null) => Promise<void>;
  updateCatalogMaxContext: (slug: string, enabled: boolean) => Promise<void>;
  refreshModels: (kind: ProviderKind, draft?: { apiKey?: string; host?: string }) => Promise<{ id: string; name: string }[]>;
}
export const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('App state is missing');
  return value;
}

export function reportError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Request failed';
}

export type { BotMood, StreamingState };
