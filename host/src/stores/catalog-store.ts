import {
  catalogSlug,
  isProviderKind,
  type CatalogEntry,
  type CatalogOrigin,
  type ProviderKind,
  MAX_CONTEXT_LENGTH,
} from '../../../shared/types.ts';
import { DEFAULT_CATALOG_MODELS, REMOTE_PROVIDER_SLUGS, isRemoteProviderSlug } from '../domain/catalog-defaults.ts';
import { catalogPath, providersPath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { staticContextLength } from '../domain/model-context.ts';
import { maxContextThreshold } from '../../../shared/model-context.ts';

interface CatalogFile {
  seeded: boolean;
  entries: CatalogEntry[];
}

interface LegacyProvider {
  model?: string;
}

const exclusive = createMutex();

export async function listCatalog(): Promise<CatalogEntry[]> {
  return exclusive(async () => {
    const file = await ensureSeeded();
    return file.entries;
  });
}

export async function addCatalogEntry(
  provider: ProviderKind,
  model: string,
  name?: string,
  contextLength?: number,
  supportsReasoningEffort?: boolean,
): Promise<CatalogEntry[]> {
  return exclusive(async () => {
    if (!isRemoteProviderSlug(provider)) throw new CatalogError('Catalog is only for remote providers');
    const trimmed = model.trim();
    if (!trimmed) throw new CatalogError('Model id is missing');
    const file = await ensureSeeded();
    const slug = catalogSlug(provider, trimmed);
    const existing = file.entries.find((entry) => entry.slug === slug);
    let changed = false;
    const length = finiteLength(contextLength);
    if (existing) {
      if (length && !existing.contextLengthManual && existing.contextLength !== length) {
        existing.contextLength = length;
        changed = true;
      }
      if (supportsReasoningEffort === true && existing.supportsReasoningEffort !== true) {
        existing.supportsReasoningEffort = true;
        changed = true;
      } else if (supportsReasoningEffort === false && existing.supportsReasoningEffort) {
        delete existing.supportsReasoningEffort;
        changed = true;
      }
    } else {
      const resolvedLength = length ?? await staticContextLength(provider, trimmed);
      pushEntry(file.entries, provider, trimmed, name?.trim() || trimmed, 'user', resolvedLength, false, supportsReasoningEffort);
      changed = true;
    }
    if (changed) await writeJson(catalogPath(), file);
    return file.entries;
  });
}

export async function applyContextLengths(
  provider: ProviderKind,
  models: { id: string; contextLength?: number }[],
): Promise<void> {
  return exclusive(async () => {
    if (!isRemoteProviderSlug(provider)) return;
    const file = await ensureSeeded();
    const listed = new Map(models.map((model) => [model.id, finiteLength(model.contextLength)]));
    let changed = false;
    for (const entry of file.entries) {
      if (entry.provider !== provider || !listed.has(entry.model)) continue;
      if (entry.contextLengthManual) continue;
      const length = listed.get(entry.model);
      if (!length) continue;
      if (entry.contextLength === length) continue;
      entry.contextLength = length;
      changed = true;
    }
    if (changed) await writeJson(catalogPath(), file);
  });
}

export async function setCatalogContextLength(slug: string, value: unknown): Promise<CatalogEntry[]> {
  return exclusive(async () => {
    const file = await ensureSeeded();
    const entry = file.entries.find((item) => item.slug === slug);
    if (!entry) throw new CatalogError('Catalog model was not found');
    if (value == null || value === '') {
      delete entry.contextLengthManual;
      delete entry.contextLength;
      await fillStaticContextLengths(file.entries);
    } else {
      const length = finiteLength(value);
      if (!length) throw new CatalogError('Context length must be a positive integer');
      entry.contextLength = length;
      entry.contextLengthManual = true;
    }
    await writeJson(catalogPath(), file);
    return file.entries;
  });
}

export async function setCatalogMaxContext(slug: string, enabled: unknown): Promise<CatalogEntry[]> {
  return exclusive(async () => {
    const file = await ensureSeeded();
    const entry = file.entries.find((item) => item.slug === slug);
    if (!entry) throw new CatalogError('Catalog model was not found');
    if (typeof enabled !== 'boolean') throw new CatalogError('MAX must be enabled or disabled');
    const threshold = maxContextThreshold(entry.model);
    if (!threshold) throw new CatalogError('MAX is not available for this model');
    if (enabled && (!entry.contextLength || entry.contextLength <= threshold)) {
      throw new CatalogError('The model must have a context length above the MAX threshold');
    }
    if (enabled) entry.maxContextEnabled = true;
    else delete entry.maxContextEnabled;
    await writeJson(catalogPath(), file);
    return file.entries;
  });
}

export async function applyReasoningEffortFlags(
  provider: ProviderKind,
  models: { id: string; supportsReasoningEffort?: boolean }[],
): Promise<void> {
  return exclusive(async () => {
    if (!isRemoteProviderSlug(provider)) return;
    const file = await ensureSeeded();
    const listed = new Map(models.map((model) => [model.id, model.supportsReasoningEffort === true]));
    let changed = false;
    for (const entry of file.entries) {
      if (entry.provider !== provider || !listed.has(entry.model)) continue;
      const supported = listed.get(entry.model) === true;
      if (supported === (entry.supportsReasoningEffort === true)) continue;
      if (supported) entry.supportsReasoningEffort = true;
      else delete entry.supportsReasoningEffort;
      changed = true;
    }
    if (changed) await writeJson(catalogPath(), file);
  });
}

export async function catalogSupportsReasoningEffort(provider: ProviderKind, model: string): Promise<boolean> {
  const entries = await listCatalog();
  return entries.some(
    (entry) => entry.provider === provider && entry.model === model && entry.supportsReasoningEffort === true,
  );
}

export async function removeCatalogEntry(slug: string): Promise<CatalogEntry[]> {
  return exclusive(async () => {
    const file = await ensureSeeded();
    file.entries = file.entries.filter((entry) => entry.slug !== slug);
    await writeJson(catalogPath(), file);
    return file.entries;
  });
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

async function ensureSeeded(): Promise<CatalogFile> {
  const stored = await readJson<Partial<CatalogFile>>(catalogPath(), {});
  if (stored.seeded === true) {
    const entries = normalizeEntries(stored.entries);
    await fillStaticContextLengths(entries);
    return { seeded: true, entries };
  }
  const legacy = await readJson<Partial<Record<ProviderKind, LegacyProvider>>>(providersPath(), {});
  const entries: CatalogEntry[] = [];
  for (const provider of REMOTE_PROVIDER_SLUGS) {
    for (const model of DEFAULT_CATALOG_MODELS[provider]) {
      pushEntry(entries, provider, model, model, 'default');
    }
    const previous = legacy[provider]?.model;
    if (typeof previous === 'string' && previous.trim()) {
      pushEntry(entries, provider, previous.trim(), previous.trim(), 'user');
    }
  }
  const file = { seeded: true, entries };
  await fillStaticContextLengths(entries);
  await writeJson(catalogPath(), file);
  return file;
}

async function fillStaticContextLengths(entries: CatalogEntry[]): Promise<void> {
  await Promise.all(entries.map(async (entry) => {
    if (entry.contextLength || entry.contextLengthManual) return;
    const length = await staticContextLength(entry.provider, entry.model);
    if (length) entry.contextLength = length;
  }));
}

function pushEntry(
  entries: CatalogEntry[],
  provider: ProviderKind,
  model: string,
  name: string,
  origin: CatalogOrigin,
  contextLength?: number,
  contextLengthManual = false,
  supportsReasoningEffort?: boolean,
) {
  const slug = catalogSlug(provider, model);
  if (entries.some((entry) => entry.slug === slug)) return;
  const entry: CatalogEntry = { slug, provider, model, name, origin };
  const length = finiteLength(contextLength);
  if (length) entry.contextLength = length;
  if (contextLengthManual) entry.contextLengthManual = true;
  if (supportsReasoningEffort === true) entry.supportsReasoningEffort = true;
  entries.push(entry);
}

function finiteLength(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0 || value > MAX_CONTEXT_LENGTH) return undefined;
  return Math.round(value);
}

function normalizeEntries(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CatalogEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<CatalogEntry>;
    const provider = row.provider;
    if (!provider || !isProviderKind(provider) || !isRemoteProviderSlug(provider)) continue;
    if (typeof row.model !== 'string' || !row.model.trim()) continue;
    if (row.origin !== 'default' && row.origin !== 'user') continue;
    const model = row.model.trim();
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : model;
    pushEntry(
      entries,
      provider,
      model,
      name,
      row.origin,
      finiteLength(row.contextLength),
      row.contextLengthManual === true,
      row.supportsReasoningEffort === true,
    );
    const entry = entries.find((item) => item.slug === catalogSlug(provider, model));
    const threshold = maxContextThreshold(model);
    if (entry && row.maxContextEnabled === true && threshold && entry.contextLength && entry.contextLength > threshold) {
      entry.maxContextEnabled = true;
    }
  }
  return entries;
}
