import type { MessageEdit } from '../../../shared/types.ts';
import type { BotGroup } from '../../../shared/bot-groups.ts';
import type {
  AgentPublic,
  BuiltinMcpStatus,
  CatalogEntry,
  ChangedFile,
  ContextParts,
  ContextTree,
  DialogResolution,
  FileChange,

  PlanSnapshot,
  PlanView,
  PlanStatus,
  TerminalResult,
  ListedModel,
  ProviderKind,
  ProviderPublic,
  McpServerRecord,
  McpServerStatus,
  McpServerWrite,
  ProviderUpdate,
  RuleRecord,
  ReasoningEffort,
  ServiceTier,
  Project,
  SessionSummary,
  Settings,
  MemoryRecord,
  MemoryWrite,
  SkillRecord,
  StoredSession,
  SubagentUpdate,
  TokenUsage,
  UserDialog,
} from '../../../shared/types.ts';
import type { MigrationResult, MigrationSnapshot } from '../../../shared/migrations.ts';

export const listMigrations = () => request<MigrationSnapshot>('/api/migrations');
export const executeMigration = (id: string) => request<MigrationResult>(`/api/migrations/${encodeURIComponent(id)}`, { method: 'POST', body: {} });
export const skipMigration = (id: string) => request<MigrationResult>(`/api/migrations/${encodeURIComponent(id)}/skip`, { method: 'POST', body: {} });

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API_BASE_URL = readApiBaseUrl();

export type StreamEvent =
  | { event: 'meta'; data: { id: string; title: string; session?: StoredSession } }
  | { event: 'text.delta'; data: { delta: string } }
  | { event: 'reasoning.delta'; data: { delta: string } }
  | { event: 'subagent.update'; data: SubagentUpdate }
  | { event: 'lifecycle'; data: { phase: string } }
  | { event: 'rate_limit.wait'; data: { attempt: number; delayMs: number; retryAt: number; source: string; reason?: string } }
  | { event: 'rate_limit.resumed'; data: { attempt: number } }
  | {
      event: 'context.usage';
      data: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        cachedTokens?: number;
        round: number;
        final: boolean;
        parts?: ContextParts;
      };
    }
  | { event: 'tool.call.start'; data: { toolCallId: string; toolName: string; args?: Record<string, unknown> } }
  | {
      event: 'tool.call.result';
      data: {
        toolCallId: string;
        ok: boolean;
        content?: string;
        change?: FileChange;
        terminal?: TerminalResult;
        plan?: PlanSnapshot;
      };
    }
  | { event: 'plan.updated'; data: { plan: PlanSnapshot } }
  | { event: 'dialog.request'; data: UserDialog }
  | { event: 'dialog.resolved'; data: { id: string; resolution?: DialogResolution } }
  | { event: 'done'; data: { aborted: boolean; usage?: TokenUsage; session: StoredSession } }
  | { event: 'error'; data: { message: string; session?: StoredSession } };

export async function listSessionDialogs(sessionId: string): Promise<UserDialog[]> {
  const result = await request<{ dialogs: UserDialog[] }>(`/api/sessions/${sessionId}/dialogs`);
  return result.dialogs;
}

export async function respondToDialog(
  sessionId: string,
  dialogId: string,
  response: { approved?: boolean; response?: string; selections?: string[]; other?: string },
): Promise<void> {
  await request(`/api/sessions/${sessionId}/dialogs/${dialogId}/respond`, {
    method: 'POST',
    body: response,
  });
}
export async function listProjects(): Promise<Project[]> {
  return request('/api/projects');
}

export async function createProject(name: string): Promise<Project> {
  return request('/api/projects', { method: 'POST', body: { name } });
}

export async function renameProject(id: string, name: string): Promise<Project> {
  return request(`/api/projects/${id}`, { method: 'PATCH', body: { name } });
}

export async function pinProject(id: string, pinned: boolean): Promise<Project> {
  return request(`/api/projects/${id}`, { method: 'PATCH', body: { pinned } });
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/api/projects/${id}`, { method: 'DELETE' });
}


export async function listSessions(): Promise<SessionSummary[]> {
  const sessions = await request<SessionSummary[]>('/api/sessions?includeBotConversations=true');
  return sessions.filter((session) => !session.parentId);
}

/** The new-chat picker catalog: user-startable agents, coder first. */
export async function listAgents(startableBy: 'user' | 'agent' | 'bot' = 'user'): Promise<AgentPublic[]> {
  return request(startableBy === 'user' ? '/api/agents' : `/api/agents?startableBy=${startableBy}`);
}

export async function createSession(input?: {
  bot?: import('../../../shared/types.ts').XeckBotCreateInput;
  provider?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  serviceTier?: ServiceTier;
  agentId?: string;
  policyId?: string;
  projectId?: string;
}): Promise<StoredSession> {
  const body: {
    bot?: import('../../../shared/types.ts').XeckBotCreateInput;
    profile?: { provider: string; model: string };
    reasoningEffort?: ReasoningEffort;
    serviceTier?: ServiceTier;
    agentId?: string;
    policyId?: string;
    projectId?: string;
  } = {};
  if (input) {
    if (input.provider && input.model) body.profile = { provider: input.provider, model: input.model };
    if (input.bot) body.bot = input.bot;
    if (input.reasoningEffort) body.reasoningEffort = input.reasoningEffort;
    if (input.serviceTier) body.serviceTier = input.serviceTier;
    if (input.agentId) body.agentId = input.agentId;
    if (input.policyId) body.policyId = input.policyId;
    if (input.projectId) body.projectId = input.projectId;
  }
  return request('/api/sessions', { method: 'POST', body });
}


export async function getSession(id: string): Promise<StoredSession> {
  return request(`/api/sessions/${id}`);
}

export async function getSessionContext(id: string): Promise<ContextTree> {
  return request(`/api/sessions/${id}/context`);
}


export async function patchSession(
  id: string,
  patch: {
    title?: string;
    profile?: { provider: string; model: string };
    reasoningEffort?: ReasoningEffort | null;
    serviceTier?: ServiceTier | null;
    projectId?: string | null;
    botSystemPrompt?: string;
    botBadges?: string[];
    botColor?: import('../../../shared/types.ts').BotColor;
    botPurpose?: string;
    pinned?: boolean;
    archived?: boolean;
  },
): Promise<StoredSession> {
  return request(`/api/sessions/${id}`, { method: 'PATCH', body: patch });
}
export async function deleteSession(id: string): Promise<void> {
  await request(`/api/sessions/${id}`, { method: 'DELETE' });
}

export async function cancelChat(id: string): Promise<void> {
  await request(`/api/sessions/${id}/cancel`, { method: 'POST' });
}

export async function getSettings(): Promise<Settings> {
  return request('/api/settings');
}

export async function putSettings(settings: Partial<Settings>): Promise<Settings> {
  return request('/api/settings', { method: 'PUT', body: settings });
}

export async function listRules(): Promise<RuleRecord[]> {
  const body = await request<{ rules: RuleRecord[] }>('/api/rules');
  return body.rules;
}

export async function putRules(rules: RuleRecord[]): Promise<RuleRecord[]> {
  const body = await request<{ rules: RuleRecord[] }>('/api/rules', { method: 'PUT', body: { rules } });
  return body.rules;
}

export async function listMemories(): Promise<MemoryRecord[]> {
  const body = await request<{ memories: MemoryRecord[] }>('/api/memories');
  return body.memories;
}

export async function putMemories(memories: MemoryWrite[]): Promise<MemoryRecord[]> {
  const body = await request<{ memories: MemoryRecord[] }>('/api/memories', { method: 'PUT', body: { memories } });
  return body.memories;
}

export async function listSkills(): Promise<SkillRecord[]> {
  const body = await request<{ skills: SkillRecord[] }>('/api/skills');
  return body.skills;
}

export async function putSkills(skills: SkillRecord[]): Promise<SkillRecord[]> {
  const body = await request<{ skills: SkillRecord[] }>('/api/skills', { method: 'PUT', body: { skills } });
  return body.skills;
}

export async function listMcp(): Promise<{ servers: McpServerRecord[]; states: McpServerStatus[]; builtin: BuiltinMcpStatus }> {
  return request('/api/mcp');
}

export async function putBuiltinMcp(enabled: boolean): Promise<BuiltinMcpStatus> {
  return request('/api/mcp/builtin', { method: 'PUT', body: { enabled } });
}

export async function putMcp(servers: McpServerWrite[]): Promise<{ servers: McpServerRecord[]; states: McpServerStatus[] }> {
  return request('/api/mcp', { method: 'PUT', body: { servers } });
}

export async function listCatalog(): Promise<CatalogEntry[]> {
  return request('/api/catalog');
}

export async function addCatalogEntry(
  provider: ProviderKind,
  model: string,
  name: string,
  contextLength?: number,
  supportsReasoningEffort?: boolean,
): Promise<CatalogEntry[]> {
  return request('/api/catalog', {
    method: 'POST',
    body: { provider, model, name, contextLength, supportsReasoningEffort },
  });
}

export async function updateCatalogContextLength(slug: string, contextLength: number | null): Promise<CatalogEntry[]> {
  return request('/api/catalog/context-length', {
    method: 'PATCH',
    body: { slug, contextLength },
  });
}

export async function updateCatalogMaxContext(slug: string, enabled: boolean): Promise<CatalogEntry[]> {
  return request('/api/catalog/max-context', {
    method: 'PATCH',
    body: { slug, enabled },
  });
}

export async function removeCatalogEntry(slug: string): Promise<CatalogEntry[]> {
  return request(`/api/catalog?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

export async function listProviders(): Promise<ProviderPublic[]> {
  return request('/api/providers');
}

export async function putProvider(kind: ProviderKind, patch: ProviderUpdate): Promise<ProviderPublic> {
  return request(`/api/providers/${kind}`, { method: 'PUT', body: patch });
}

export async function listProviderModels(
  kind: ProviderKind,
  draft?: { apiKey?: string; host?: string },
): Promise<ListedModel[]> {
  const body = await request<{ models: ListedModel[] }>(`/api/providers/${kind}/models`, {
    method: 'POST',
    body: draft ?? {},
  });
  return body.models;
}

/** Current plan document of the session. */
export async function getPlan(sessionId: string): Promise<PlanView | null> {
  const result = await request<{ plan: PlanView | null }>(`/api/sessions/${sessionId}/plan`);
  return result.plan;
}

/** The files this chat changed, one row per file with summed line counts. */
export async function getChangedFiles(sessionId: string): Promise<ChangedFile[]> {
  const result = await request<{ files: ChangedFile[] }>(`/api/sessions/${sessionId}/changes`);
  return result.files;
}
/** Ticking a step from the plan card. Same lock and revision rules as the model. */
export async function putPlanTodo(
  sessionId: string,
  todoId: string,
  input: { status: PlanStatus; revision?: number; note?: string },
): Promise<PlanSnapshot> {
  const result = await request<{ plan: PlanSnapshot }>(
    `/api/sessions/${sessionId}/plan/todos/${encodeURIComponent(todoId)}`,
    { method: 'PUT', body: input },
  );
  return result.plan;
}

export async function putSessionPolicy(sessionId: string, policyId: string): Promise<StoredSession> {
  const result = await request<{ policyId: string; session: StoredSession }>(`/api/sessions/${sessionId}/policy`, {
    method: 'PUT',
    body: { policyId },
  });
  return result.session;
}

export async function streamMessage(
  sessionId: string,
  content: string,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
  edit?: MessageEdit,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, ...(edit ? { edit } : {}) }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ApiError(await errorMessage(response), response.status);
  }

  await readEventStream(response.body, onEvent);
}

/**
 * Reattach to a chat turn that is already running on the host (for example
 * after a page refresh). Resolves to false when nothing is running, so the
 * caller can fall back to the persisted transcript.
 */
export async function attachToStream(
  sessionId: string,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
  onOpen?: () => void,
): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/stream`, { signal });
  if (response.status === 404) return false;
  if (!response.ok || !response.body) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  onOpen?.();
  await readEventStream(response.body, onEvent);
  return true;
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const event = parseSse(part);
      if (event) onEvent(event);
    }
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new ApiError(await errorMessage(response), response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function readApiBaseUrl(): string {
  const configured = new URLSearchParams(window.location.search).get('apiBase');
  return configured?.trim().replace(/\/+$/, '') ?? '';
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // response was not JSON
  }
  return response.statusText || 'Request failed';
}

function parseSse(chunk: string): StreamEvent | null {
  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
  }
  if (dataLines.length === 0) return null;
  const data = JSON.parse(dataLines.join('\n')) as StreamEvent['data'];
  return { event: eventName, data } as StreamEvent;
}

export const listBotGroups = () => request<BotGroup[]>('/api/bot-groups');
export const saveBotGroup = (id: string | null, name: string) => request<BotGroup[]>(id ? '/api/bot-groups/' + encodeURIComponent(id) : '/api/bot-groups', { method: id ? 'PATCH' : 'POST', body: { name } });
export const deleteBotGroup = (id: string) => request<BotGroup[]>('/api/bot-groups/' + encodeURIComponent(id), { method: 'DELETE' });
export const assignBotGroup = (botId: string, groupId: string | null) => request<BotGroup[]>('/api/bot-groups/membership/' + encodeURIComponent(botId), { method: 'PUT', body: { groupId } });
