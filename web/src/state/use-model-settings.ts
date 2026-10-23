import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type {
  CatalogEntry,
  ModelProfile,
  ProviderKind,
  ProviderPublic,
  ProviderUpdate,
} from '../../../shared/types.ts';
import { isLocalProvider } from '../../../shared/types.ts';
import {
  addCatalogEntry,
  listCatalog,
  listProviders,
  listProviderModels,
  putProvider,
  removeCatalogEntry,
  updateCatalogContextLength,
  updateCatalogMaxContext,
} from '../api/client.ts';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useModelSettings({
  providers,
  setProviders,
  catalog,
  setCatalog,
}: {
  providers: ProviderPublic[];
  setProviders: StateSetter<ProviderPublic[]>;
  catalog: CatalogEntry[];
  setCatalog: StateSetter<CatalogEntry[]>;
}) {
  const saveProvider = useCallback(async (kind: ProviderKind, patch: ProviderUpdate) => {
    const updated = await putProvider(kind, patch);
    setProviders((current) => current.map((item) => (item.kind === kind ? updated : item)));
  }, [setProviders]);

  const addCatalogModel = useCallback(async (
    provider: ProviderKind,
    model: string,
    name: string,
    contextLength?: number,
    supportsReasoningEffort?: boolean,
  ) => {
    setCatalog(await addCatalogEntry(provider, model, name, contextLength, supportsReasoningEffort));
  }, [setCatalog]);

  const removeCatalogModel = useCallback(async (slug: string) => {
    setCatalog(await removeCatalogEntry(slug));
  }, [setCatalog]);

  const updateCatalogContextLimit = useCallback(async (slug: string, contextLength: number | null) => {
    setCatalog(await updateCatalogContextLength(slug, contextLength));
  }, [setCatalog]);

  const updateCatalogMaxContextMode = useCallback(async (slug: string, enabled: boolean) => {
    setCatalog(await updateCatalogMaxContext(slug, enabled));
  }, [setCatalog]);

  const refreshModels = useCallback(async (kind: ProviderKind, draftKeys?: { apiKey?: string; host?: string }) => {
    const models = await listProviderModels(kind, draftKeys);
    if (kind === 'ollama') {
      setProviders(await listProviders());
    }
    setCatalog(await listCatalog());
    return models;
  }, [setCatalog, setProviders]);

  const configuredModels = useMemo(() => {
    const rows: ModelProfile[] = [];
    for (const provider of providers) {
      if (!provider.enabled) continue;
      if (isLocalProvider(provider.kind)) {
        if (!provider.model.trim()) continue;
        rows.push({ provider: provider.kind, model: provider.model, host: provider.host });
        continue;
      }
      for (const entry of catalog) {
        if (entry.provider !== provider.kind) continue;
        rows.push({ provider: entry.provider, model: entry.model, host: provider.host });
      }
    }
    return rows;
  }, [providers, catalog]);

  return {
    addCatalogModel,
    configuredModels,
    refreshModels,
    removeCatalogModel,
    saveProvider,
    updateCatalogContextLimit,
    updateCatalogMaxContextMode,
  };
}
