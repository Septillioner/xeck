import {
  formatProviderLabel,
  listAggregatedChatModels,
  resolveApiKeyForProfile,
  type ProviderApiKeys,
} from 'poyraz';
import type { ListedModel, ModelProfile, ProviderKind, ProviderPublic, ProviderUpdate } from '../../../shared/types.ts';
import { PROVIDER_KINDS, isLocalProvider } from '../../../shared/types.ts';
import { listCatalog } from './catalog-store.ts';
import { KEYED_PROVIDERS } from '../infra/limits.ts';

/** API keys live in this file; keep it owner-only where the platform supports it. */
const PROVIDER_FILE_MODE = 0o600;
import { providersPath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { staticContextLength } from '../domain/model-context.ts';
import { defaultHost, toLibraryProfile, toSharedProfile } from '../domain/profiles.ts';

interface StoredProvider {
  enabled: boolean;
  apiKey: string;
  host: string;
  model: string;
  contextLengths?: Record<string, number>;
}

type ProviderFile = Record<ProviderKind, StoredProvider>;

const exclusive = createMutex();
const LAST4_LENGTH = 4;

export async function listProviders(): Promise<ProviderPublic[]> {
  return exclusive(async () => {
    const file = await readFile();
    return PROVIDER_KINDS.map((kind) => toPublic(kind, file[kind]));
  });
}

export async function updateProvider(kind: ProviderKind, patch: ProviderUpdate): Promise<ProviderPublic> {
  return exclusive(async () => {
    const file = await readFile();
    const current = file[kind];
    if (typeof patch.enabled === 'boolean') current.enabled = patch.enabled;
    if (isLocalProvider(kind) && typeof patch.model === 'string') current.model = patch.model.trim();
    if (isLocalProvider(kind) && typeof patch.host === 'string' && patch.host.trim()) {
      const host = patch.host.trim();
      if (host !== current.host) current.contextLengths = {};
      current.host = host;
    }
    if (patch.clearApiKey) current.apiKey = '';
    else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) current.apiKey = patch.apiKey.trim();
    file[kind] = current;
    await writeJson(providersPath(), file, PROVIDER_FILE_MODE);
    return toPublic(kind, current);
  });
}

export async function alignProfile(profile: ModelProfile): Promise<ModelProfile> {
  const file = await exclusive(readFile);
  return toSharedProfile(profile.provider, profile.model, file[profile.provider].host);
}

export async function apiKeyForProfile(profile: ModelProfile): Promise<string> {
  const file = await exclusive(readFile);
  const keys = apiKeysFrom(file);
  return resolveApiKeyForProfile(toLibraryProfile(profile), keys);
}

export async function providerIsEnabled(kind: ProviderKind): Promise<boolean> {
  const file = await exclusive(readFile);
  return file[kind].enabled;
}

export async function configuredModels(): Promise<ModelProfile[]> {
  const file = await exclusive(readFile);
  const catalog = await listCatalog();
  const models: ModelProfile[] = [];
  for (const kind of PROVIDER_KINDS) {
    const stored = file[kind];
    if (!stored.enabled) continue;
    if (isLocalProvider(kind)) {
      if (!stored.model.trim()) continue;
      models.push(toSharedProfile(kind, stored.model, stored.host));
      continue;
    }
    for (const entry of catalog) {
      if (entry.provider !== kind) continue;
      models.push(toSharedProfile(kind, entry.model, stored.host));
    }
  }
  return models;
}

export async function listModelsForProvider(
  kind: ProviderKind,
  override?: { apiKey?: string; host?: string },
): Promise<ListedModel[]> {
  const file = await exclusive(readFile);
  const stored = file[kind];
  const apiKey = override?.apiKey?.trim() || stored.apiKey;
  const localHost = isLocalProvider(kind) ? override?.host?.trim() || stored.host : stored.host;
  const rows = await listAggregatedChatModels({
    includeOllama: kind === 'ollama',
    ollamaHost: kind === 'ollama' ? localHost : undefined,
    llamaCppHost: kind === 'llamacpp' ? localHost : undefined,
    llamaCppApiKey: kind === 'llamacpp' ? apiKey : undefined,
    openAiApiKey: kind === 'openai' ? apiKey : undefined,
    groqApiKey: kind === 'groq' ? apiKey : undefined,
    geminiApiKey: kind === 'gemini' ? apiKey : undefined,
    openRouterApiKey: kind === 'openrouter' ? apiKey : undefined,
  });
  const listed = await Promise.all(rows
    .filter((row) => row.provider === kind)
    .map(async (row) => {
      const listed: ListedModel = { id: row.id, name: row.name || row.id };
      const contextLength = finiteLength(row.contextLength) ?? await staticContextLength(kind, row.id);
      if (contextLength) listed.contextLength = contextLength;
      if (row.supportsReasoningEffort) listed.supportsReasoningEffort = true;
      return listed;
    }));
  if (kind === 'ollama' && localHost === stored.host && rows.some((row) => row.provider === kind)) {
    const lengths = { ...(stored.contextLengths ?? {}) };
    for (const row of rows) {
      if (row.provider !== kind) continue;
      const length = finiteLength(row.contextLength);
      if (length) lengths[row.id] = length;
    }
    for (const model of listed) {
      const length = lengths[model.id];
      if (length) model.contextLength = length;
    }
    await exclusive(async () => {
      const file = await readFile();
      if (file.ollama.host === localHost) {
        file.ollama.contextLengths = lengths;
        await writeJson(providersPath(), file, PROVIDER_FILE_MODE);
      }
    });
  }
  return listed;
}

async function readFile(): Promise<ProviderFile> {
  const stored = await readJson<Partial<ProviderFile>>(providersPath(), {});
  const file = emptyFile();
  for (const kind of PROVIDER_KINDS) {
    file[kind] = normalizeStored(kind, stored[kind]);
  }
  return file;
}

function emptyFile(): ProviderFile {
  return {
    ollama: emptyStored('ollama'),
    llamacpp: emptyStored('llamacpp'),
    openai: emptyStored('openai'),
    groq: emptyStored('groq'),
    gemini: emptyStored('gemini'),
    openrouter: emptyStored('openrouter'),
  };
}

function emptyStored(kind: ProviderKind): StoredProvider {
  return {
    enabled: false,
    apiKey: '',
    host: defaultHost(kind),
    model: '',
    ...(kind === 'ollama' ? { contextLengths: {} } : {}),
  };
}

function normalizeStored(kind: ProviderKind, value: StoredProvider | undefined): StoredProvider {
  const base = emptyStored(kind);
  if (!value) return base;
  const model = typeof value.model === 'string' ? value.model : '';
  return {
    enabled: Boolean(value.enabled),
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    host: isLocalProvider(kind) && typeof value.host === 'string' && value.host.trim() ? value.host.trim() : base.host,
    model,
    ...(kind === 'ollama' ? { contextLengths: normalizeContextLengths(value.contextLengths) } : {}),
  };
}

function normalizeContextLengths(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const lengths: Record<string, number> = {};
  for (const [model, candidate] of Object.entries(value)) {
    const length = finiteLength(candidate);
    if (model && length) lengths[model] = length;
  }
  return lengths;
}

function finiteLength(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

function toPublic(kind: ProviderKind, stored: StoredProvider): ProviderPublic {
  const key = stored.apiKey.trim();
  return {
    kind,
    slug: kind,
    label: formatProviderLabel(kind),
    enabled: stored.enabled,
    configured: isLocalProvider(kind) ? true : key.length > 0,
    last4: key.length >= LAST4_LENGTH ? key.slice(-LAST4_LENGTH) : null,
    host: stored.host,
    model: stored.model,
    ...(kind === 'ollama' ? { contextLengths: stored.contextLengths ?? {} } : {}),
    requiresApiKey: KEYED_PROVIDERS.includes(kind),
  };
}

function apiKeysFrom(file: ProviderFile): ProviderApiKeys {
  return {
    openai: file.openai.apiKey,
    groq: file.groq.apiKey,
    gemini: file.gemini.apiKey,
    openrouter: file.openrouter.apiKey,
    llamacpp: file.llamacpp.apiKey,
  };
}
