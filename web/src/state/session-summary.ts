import { isLocalProvider, type CatalogEntry, type ProviderKind, type ProviderPublic, type SessionSummary, type StoredSession } from '../../../shared/types.ts';
import { listCatalog, listProviderModels } from '../api/client.ts';

export function catalogSupportsEffort(provider: ProviderKind, model: string, entries: CatalogEntry[]): boolean {
  return entries.some(
    (entry) => entry.provider === provider && entry.model === model && entry.supportsReasoningEffort === true,
  );
}

export async function refreshReasoningEffortFlags(providers: ProviderPublic[]): Promise<CatalogEntry[] | null> {
  const remote = providers.filter((provider) => !isLocalProvider(provider.kind) && provider.configured);
  if (remote.length === 0) return null;
  await Promise.all(remote.map((provider) => listProviderModels(provider.kind).catch(() => undefined)));
  return listCatalog();
}

export function toSummary(session: StoredSession): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    profile: session.profile,
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.bot ? { bot: { color: session.bot.color } } : {}),
    ...(session.origin?.by === 'agent' ? { parentId: session.origin.parent } : {}),
    ...(session.subagentStatus ? { subagentStatus: session.subagentStatus } : {}),
  };
}
