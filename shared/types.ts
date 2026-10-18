export const PROVIDER_KINDS = ['ollama', 'llamacpp', 'openai', 'groq', 'gemini', 'openrouter'] as const;
export const MAX_CONTEXT_LENGTH = 10_000_000;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const LOCAL_PROVIDER_KINDS = ['ollama', 'llamacpp'] as const;

export function isLocalProvider(kind: ProviderKind): boolean {
  return (LOCAL_PROVIDER_KINDS as readonly string[]).includes(kind);
}

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeSetting = (typeof THEMES)[number];

export const TEXT_SIZES = ['small', 'default', 'large'] as const;
export type TextSizeSetting = (typeof TEXT_SIZES)[number];

export const TOOL_USAGE_VIEW_MODES = ['compact', 'balanced', 'detailed'] as const;
export type ToolUsageViewMode = (typeof TOOL_USAGE_VIEW_MODES)[number];

export const ACCENT_COLORS = ['default', 'coral', 'amber', 'green', 'blue', 'violet'] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export type HexColor = `#${string}`;

export const CUSTOMIZE_TABS = ['skills', 'rules', 'memories', 'mcp'] as const;
export type CustomizeTab = (typeof CUSTOMIZE_TABS)[number];

export const SETTINGS_TABS = ['general', 'appearance', 'customize', ...CUSTOMIZE_TABS, ...PROVIDER_KINDS] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

export const SERVICE_TIERS = ['default', 'flex', 'fast', 'priority', 'ultrafast'] as const;
export type ServiceTier = (typeof SERVICE_TIERS)[number];

export function isServiceTier(value: string): value is ServiceTier {
  return (SERVICE_TIERS as readonly string[]).includes(value);
}

/** Opaque policy id selected for a session. The host catalog owns the meaning. */
export type SessionPolicyId = string;

export function isSessionPolicyId(value: unknown): value is SessionPolicyId {
  return typeof value === 'string' && value.length > 0;
}

/** One choosable policy, as the catalog projects it. The id is opaque. */
export interface PolicyChoice {
  id: string;
  label: string;
  accentColor: HexColor;
}

/** One row of the new-chat agent picker, served by `GET /api/agents`. */
export interface AgentPublic {
  id: string;
  label: string;
  description: string;
  /** Icon name in `web/src/ui/icons.tsx` — never an emoji. */
  icon: string;
  /** Workspace ref the agent derives, e.g. `coding@1`. */
  workspace: string;
  defaultPolicy: string;
  policies: PolicyChoice[];
  /** True when the workspace toolset includes the plan tools. */
  plan: boolean;
}

export interface ModelProfile {
  provider: ProviderKind;
  model: string;
  host: string;
}



export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const BOT_COLORS = ['blue', 'violet', 'pink', 'gray'] as const;
export type BotColor = (typeof BOT_COLORS)[number];
export const MAX_BOT_PURPOSE_CHARS = 4000;
export interface XeckBotCreateInput { name: string; color: BotColor; purpose: string }
export interface XeckBotProfile {
  color: BotColor;
  /** Optional on XeckBots created before custom identities were supported. */
  purpose?: string;
  systemPrompt?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  profile: ModelProfile;
  projectId?: string;
  bot?: XeckBotProfile;
  /** Present only for a session created by another agent. */
  parentId?: string;
  subagentStatus?: SubagentStatus;
}

export type SubagentStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface SubagentUpdate {
  sessionId: string;
  agentId: string;
  task: string;
  status: SubagentStatus;
  activity: string;
  error?: string;
}

export type SessionOrigin =
  | { by: 'user' }
  | {
      by: 'agent';
      parent: string;
      task: string;
      grant: { tools: string[] };
    };

export interface TranscriptTextBlock {
  kind: 'text';
  text: string;
}

export interface TranscriptReasoningBlock {
  kind: 'reasoning';
  text: string;
}

export interface TranscriptToolBlock {
  kind: 'tool';
  callId: string;
  label: string;
  pending: boolean;
  change?: FileChange & { toolCallId?: string };
  terminal?: TerminalResult;
  /** Plan snapshot returned by plan_write/todo_update/todo_add, when the call carried one. */
  plan?: PlanSnapshot;
}

export interface TranscriptDialogBlock {
  kind: 'dialog';
  dialogId: string;
  dialog: UserDialog;
  resolved: boolean;
  /** Human-readable answer line, set when the dialog resolved. */
  answer?: string;
}

export interface TranscriptSubagentBlock extends SubagentUpdate {
  kind: 'subagent';
}

export type TranscriptBlock = TranscriptTextBlock | TranscriptReasoningBlock | TranscriptToolBlock | TranscriptDialogBlock | TranscriptSubagentBlock;

export interface AgentMessageSource {
  messageId: string;
  sessionId: string;
  agentId: string;
  title: string;
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Trusted host metadata for a message sent by another chat. */
  source?: AgentMessageSource;
  reasoning?: string;
  activity?: string[];
  changes?: FileChange[];
  /** Chronological interleaving of reasoning, tool calls, and text. Present on new messages. */
  blocks?: TranscriptBlock[];
  createdAt: string;
}

export type FileChangeOperation = 'write' | 'replace' | 'move' | 'delete' | 'create-directory';

export interface FileChange {
  operation: FileChangeOperation;
  path: string;
  destination?: string;
  diff?: string;
  addedLines?: number;
  removedLines?: number;
  recursive?: boolean;
  created?: boolean;
  overwritten?: boolean;
  truncated?: boolean;
}

export interface TerminalResult {
  ok: boolean;
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

export const PLAN_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export function isPlanStatus(value: unknown): value is PlanStatus {
  return typeof value === 'string' && (PLAN_STATUSES as readonly string[]).includes(value);
}

/** One step of a plan. `id` is unique inside the plan and used by every todo update. */
export interface PlanTodo {
  id: string;
  content: string;
  status: PlanStatus;
  /** Evidence for completed steps and the reason for blocked ones. */
  note?: string;
}

/** What the model and the UI exchange about the active plan. */
export interface PlanSnapshot {
  name: string;
  revision: number;
  todos: PlanTodo[];
  /** Completed step count, ready for the progress label. */
  done: number;
  /** Total step count. */
  total: number;
}

/** Snapshot plus the file body, served for the plan side panel. */
export interface PlanView extends PlanSnapshot {
  body: string;
  markdown: string;
}

/** One row of the plan list: which file a plan is stored in and how far it got. */

/**
 * A file the agent changed in this chat, with the line counts summed over every
 * change to it, so the artifacts list shows one row per file rather than one per
 * edit. `lastOperation` and `diff` describe the most recent change.
 */
export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
  changes: number;
  lastOperation: FileChangeOperation;
  lastAt: number;
  diff?: string;
  truncated?: boolean;
}

/** Model replay record. providerMeta is opaque and must round-trip. */
export interface LibraryMessage {
  role: string;
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string;
  providerMeta?: unknown;
}

/**
 * Context categories, the same ten the poyraz library measures (`CONTEXT_CATEGORIES`).
 * The meter and the sidebar read these from the library's compiled request instead of
 * estimating them in the host. `toolCalls`, `toolResults` and `providerMeta` are the
 * categories the old host split folded into `conversation`.
 */
export const CONTEXT_PART_KEYS = [
  'system',
  'tools',
  'rules',
  'skills',
  'mcp',
  'summary',
  'conversation',
  'toolCalls',
  'toolResults',
  'providerMeta',
] as const;
export type ContextPartKey = (typeof CONTEXT_PART_KEYS)[number];

/** Tokens per category. Sessions stored before the ten-way split carry only the first seven keys. */
export interface ContextParts {
  system: number;
  tools: number;
  rules: number;
  skills: number;
  mcp: number;
  summary: number;
  conversation: number;
  toolCalls: number;
  toolResults: number;
  providerMeta: number;
}

export interface ContextSkillNode {
  name: string;
  description: string;
  content: string;
  loaded: boolean;
}

export interface ContextMcpNode {
  name: string;
  description: string;
  schema: string;
}

export interface ContextMessageNode {
  role: string;
  content: string;
}

export interface ContextTree {
  system: string;
  tools: string;
  rules: string[];
  skills: ContextSkillNode[];
  mcp: ContextMcpNode[];
  summary: string[];
  conversation: ContextMessageNode[];
}

export interface StoredSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  bot?: XeckBotProfile;
  /** Missing on older sessions means a user-created root session. */
  origin?: SessionOrigin;
  subagentStatus?: SubagentStatus;
  subagentError?: string;
  profile: ModelProfile;
  reasoningEffort?: ReasoningEffort;
  serviceTier?: ServiceTier;
  /** Opaque policy id, e.g. `coder-agent`. Missing means the workspace default. */
  policyId?: string;
  /** CWAP kimliği. Eksikse katalog varsayılanı. */
  workspace?: string;
  agentId?: string;
  /** Slug of the active plan file; missing means the session has no plan. */
  activePlan?: string;
  /** 'user' means the title came from a rename and no auto title may replace it. */
  titleSource?: 'auto' | 'user';
  messages: TranscriptMessage[];
  libraryMessages: LibraryMessage[];
  lastUsage?: TokenUsage;
  /** Usage of the last model request, excluding earlier tool rounds. */
  contextUsage?: TokenUsage;
  contextParts?: ContextParts;
  usage?: TokenUsage;
  lastDurationMs?: number;
}

export interface Settings {
  defaultProfile: ModelProfile | null;
  /** Per-subagent model selection. Null or missing inherits the parent profile. */
  agentProfiles: Record<string, ModelProfile | null>;
  /** Model that names a new chat from its first message; null disables the call. */
  autocompleteProfile: ModelProfile | null;
  systemInstructions: string;
  xeckInstructionsEnabled: boolean;
  workspaceRoot: string;
  fullFileAccess: boolean;
  enterToSend: boolean;
  showReasoning: boolean;
  theme: ThemeSetting;
  textSize: TextSizeSetting;
  accent: AccentColor;
  showUsage: boolean;
  showTokenSpeed: boolean;
  hideToolUsages: boolean;
  toolUsageViewMode: ToolUsageViewMode;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultProfile: null,
  agentProfiles: {},
  autocompleteProfile: null,
  systemInstructions: '',
  xeckInstructionsEnabled: true,
  workspaceRoot: '',
  fullFileAccess: false,
  enterToSend: true,
  showReasoning: false,
  theme: 'dark',
  textSize: 'default',
  accent: 'default',
  showUsage: true,
  showTokenSpeed: true,
  hideToolUsages: false,
  toolUsageViewMode: 'balanced',
  debugMode: false,
};

export interface SkillRecord {
  name: string;
  description: string;
  content: string;
}

export const RULE_SOURCES = ['user', 'xeck'] as const;
export type RuleSource = (typeof RULE_SOURCES)[number];

export interface RuleRecord {
  text: string;
  source: RuleSource;
}

export const MEMORY_TYPES = ['memory', 'rule', 'decision', 'context'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export function isMemoryType(value: string): value is MemoryType {
  return (MEMORY_TYPES as readonly string[]).includes(value);
}

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  type: MemoryType;
  tags: string[];
  source: RuleSource;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryWrite {
  id?: string;
  title: string;
  content: string;
  type?: MemoryType;
  tags?: string[];
  source?: RuleSource;
}

export const MCP_TRANSPORTS = ['stdio', 'http'] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

export interface McpEnvPublic {
  name: string;
  last4: string | null;
}

export interface McpHeaderPublic {
  name: string;
  last4: string | null;
}

export interface McpServerRecord {
  id: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  enabled: boolean;
  enabledTools: string[] | null;
  ignoreCertificate: boolean;
  tokenConfigured: boolean;
  tokenLast4: string | null;
  headers: McpHeaderPublic[];
  env: McpEnvPublic[];
}

export interface McpEnvWrite {
  name: string;
  value?: string;
  clear?: boolean;
}

export interface McpHeaderWrite {
  name: string;
  value?: string;
  clear?: boolean;
}

export interface McpServerWrite {
  id: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  enabled: boolean;
  enabledTools?: string[] | null;
  ignoreCertificate?: boolean;
  token?: string;
  clearToken?: boolean;
  headers?: McpHeaderWrite[];
  env?: McpEnvWrite[];
  replacesId?: string;
}

export interface McpToolStatus {
  name: string;
  description: string;
  enabled?: boolean;
  group?: string;
}

export interface McpServerStatus {
  id: string;
  status: 'connected' | 'error' | 'disabled';
  toolCount: number;
  tools: McpToolStatus[];
  error?: string;
}

export interface BuiltinMcpStatus {
  enabled: boolean;
  status: 'connected' | 'disabled';
  toolCount: number;
  tools: McpToolStatus[];
}

export interface ProviderPublic {
  kind: ProviderKind;
  slug: ProviderKind;
  label: string;
  enabled: boolean;
  configured: boolean;
  last4: string | null;
  host: string;
  model: string;
  contextLengths?: Record<string, number>;
  requiresApiKey: boolean;
}

export const CATALOG_ORIGINS = ['default', 'user'] as const;
export type CatalogOrigin = (typeof CATALOG_ORIGINS)[number];

export interface CatalogEntry {
  slug: string;
  provider: ProviderKind;
  model: string;
  name: string;
  origin: CatalogOrigin;
  contextLength?: number;
  contextLengthManual?: boolean;
  maxContextEnabled?: boolean;
  supportsReasoningEffort?: boolean;
}

export function catalogSlug(provider: ProviderKind, model: string): string {
  return `${provider}/${model}`;
}

export interface ProviderUpdate {
  enabled?: boolean;
  apiKey?: string;
  clearApiKey?: boolean;
  host?: string;
  model?: string;
}

export interface ListedModel {
  id: string;
  name: string;
  contextLength?: number;
  supportsReasoningEffort?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

export function isProviderKind(value: string): value is ProviderKind {
  return (PROVIDER_KINDS as readonly string[]).includes(value);
}

export function isCustomizeTab(value: string): value is CustomizeTab {
  return (CUSTOMIZE_TABS as readonly string[]).includes(value);
}

export type DialogType = 'approval' | 'yes_no' | 'multiple_select' | 'text' | 'question';

export interface DialogResolution {
  approved?: boolean;
  response?: string;
  selections?: string[];
  other?: string;
}

export interface UserDialog {
  id: string;
  sessionId: string;
  type: DialogType;
  title: string;
  prompt: string;
  details?: Record<string, unknown>;
  createdAt: number;
}
