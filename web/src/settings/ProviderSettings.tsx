import { useEffect, useRef, useState } from 'react';
import { isLocalProvider, MAX_CONTEXT_LENGTH, type CatalogEntry, type ListedModel, type ProviderKind, type ProviderPublic, type ProviderUpdate } from '../../../shared/types.ts';
import { Menu } from '../ui/Menu.tsx';
import { IconSearch, IconTrash, ProviderMark } from '../ui/icons.tsx';
import { useAppState } from '../state/AppState.tsx';
import { SettingCard, SettingRow, Switch } from '../ui/SettingRow.tsx';
import { EditableField } from '../ui/EditableField.tsx';
import { TextField } from '../ui/TextField.tsx';

const CATALOG_SEARCH_LIMIT = 8;

export function ProviderPage({ kind }: { kind: ProviderKind }) {
  const { providers, saveProvider } = useAppState();
  const provider = providers.find((item) => item.kind === kind);
  const [enabled, setEnabled] = useState(provider?.enabled ?? false);

  useEffect(() => {
    setEnabled(provider?.enabled ?? false);
  }, [provider?.enabled]);

  if (!provider) return null;

  return (
    <div className="stack">
      <header className="provider-header">
        <div>
          <h2 className="page-title">
            <ProviderMark kind={provider.slug} />
            {provider.label}
          </h2>
          <p className="lede">{isLocalProvider(provider.kind) ? 'On this computer' : 'Remote API'}</p>
        </div>
        <Switch
          checked={enabled}
          label={`${provider.label} enabled`}
          onChange={(next) => {
            setEnabled(next);
            void saveProvider(provider.kind, { enabled: next });
          }}
        />
      </header>
      <ProviderCard key={provider.kind} provider={provider} />
      {!isLocalProvider(provider.kind) && <CatalogEditor provider={provider} />}
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderPublic }) {
  const { saveProvider, refreshModels } = useAppState();
  const [host, setHost] = useState(provider.host);
  const [model, setModel] = useState(provider.model);
  const [models, setModels] = useState<ListedModel[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listedValue = models.some((item) => item.id === model) ? model : '';
  const local = isLocalProvider(provider.kind);
  const optionalKey = provider.kind === 'llamacpp';
  const showsApiKey = provider.requiresApiKey || optionalKey;
  const keySaved = Boolean(provider.last4);
  const canClearKey = (provider.requiresApiKey && provider.configured) || (optionalKey && keySaved);

  // Every field saves on its own (Enter or blur), so there is no form-wide Save button.
  const save = (patch: ProviderUpdate, after?: () => void) => {
    setBusy(true);
    setStatus(null);
    void saveProvider(provider.kind, patch)
      .then(() => {
        after?.();
        setStatus('Saved');
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'Save failed'))
      .finally(() => setBusy(false));
  };

  return (
    <SettingCard>
      {showsApiKey && (
        <SettingRow label="API key">
          <EditableField
            label="API key"
            type="password"
            value=""
            display={keySaved ? `•••• ${provider.last4}` : ''}
            placeholder={apiKeyPlaceholder(optionalKey, keySaved, provider.configured)}
            disabled={busy}
            onCommit={(next) => {
              if (next.trim()) save({ apiKey: next });
            }}
          />
        </SettingRow>
      )}
      {local && (
        <SettingRow label="Host">
          <EditableField label="Host" value={host} disabled={busy} onCommit={(next) => save({ host: next }, () => setHost(next))} />
        </SettingRow>
      )}
      {local && (
        <SettingRow label="Model">
          <EditableField label="Model" value={model} disabled={busy} onCommit={(next) => save({ model: next }, () => setModel(next))} />
        </SettingRow>
      )}
      {local && models.length > 0 && (
        <SettingRow label="Listed models">
          <Menu
            label="Listed models"
            placeholder="Listed models"
            value={listedValue}
            options={models.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(next) => save({ model: next }, () => setModel(next))}
          />
        </SettingRow>
      )}
      {(local || canClearKey || status) && (
        <SettingRow label="Actions" detail={status ?? undefined}>
          <span className="actions">
            {local && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStatus(null);
                  void refreshModels(provider.kind, { host })
                    .then(setModels)
                    .catch((error: unknown) => {
                      setStatus(error instanceof Error ? error.message : 'Could not list models');
                    });
                }}
              >
                Refresh models
              </button>
            )}
            {canClearKey && (
              <button type="button" className="danger" disabled={busy} onClick={() => save({ clearApiKey: true })}>
                Clear key
              </button>
            )}
          </span>
        </SettingRow>
      )}
    </SettingCard>
  );
}

function CatalogEditor({ provider }: { provider: ProviderPublic }) {
  const { catalog, removeCatalogModel } = useAppState();
  const [searchOpen, setSearchOpen] = useState(false);
  const owned = catalog.filter((entry) => entry.provider === provider.slug);

  return (
    <section className="catalog">
      <div className="catalog-header">
        <h2>Models</h2>
        <button
          type="button"
          className="text-button"
          disabled={!provider.configured}
          onClick={() => setSearchOpen(true)}
        >
          Add model
        </button>
      </div>
      <SettingCard>
        {owned.length === 0 ? (
          <p className="catalog-empty">{provider.configured ? 'No models yet' : 'Save an API key to add models'}</p>
        ) : (
          owned.map((entry) => (
            <CatalogRow key={entry.slug} entry={entry} onRemove={() => void removeCatalogModel(entry.slug)} />
          ))
        )}
      </SettingCard>
      {searchOpen && <CatalogSearchModal provider={provider} owned={owned} onClose={() => setSearchOpen(false)} />}
    </section>
  );
}

function CatalogSearchModal({
  provider,
  owned,
  onClose,
}: {
  provider: ProviderPublic;
  owned: CatalogEntry[];
  onClose: () => void;
}) {
  const { addCatalogModel, refreshModels } = useAppState();
  const [query, setQuery] = useState('');
  const [listed, setListed] = useState<ListedModel[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const needle = query.trim().toLowerCase();
  const hits = (listed ?? [])
    .filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle))
    .filter((item) => !owned.some((entry) => entry.model === item.id))
    .slice(0, CATALOG_SEARCH_LIMIT);

  useEffect(() => {
    inputRef.current?.focus();
    void refreshModels(provider.kind)
      .then(setListed)
      .catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : 'Could not list models');
      });
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [provider.kind, refreshModels]);

  return (
    <div className="search-layer">
      <div className="search-panel" ref={panelRef}>
        <div className="search-field">
          <IconSearch />
          <TextField bare
            ref={inputRef}
            value={query}
            placeholder="Search models"
            aria-label="Search models"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="search-hits">
          {notice ? (
            <p className="search-empty">{notice}</p>
          ) : !listed ? (
            <p className="search-empty">Loading</p>
          ) : hits.length === 0 ? (
            <p className="search-empty">No models</p>
          ) : (
            hits.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setNotice(null);
                  void addCatalogModel(provider.slug, item.id, item.name, item.contextLength, item.supportsReasoningEffort)
                    .then(() => setQuery(''))
                    .catch((error: unknown) => {
                      setNotice(error instanceof Error ? error.message : 'Could not add model');
                    });
                }}
              >
                {item.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function apiKeyPlaceholder(optionalKey: boolean, keySaved: boolean, configured: boolean): string {
  if (optionalKey) return keySaved ? 'Leave blank to keep' : 'Optional';
  if (configured) return 'Leave blank to keep';
  return 'Paste key';
}

function CatalogRow({ entry, onRemove }: { entry: CatalogEntry; onRemove: () => void }) {
  const { updateCatalogContextLength } = useAppState();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveContextLength = (next: string) => {
    const trimmed = next.trim();
    const parsed = trimmed ? Number(trimmed) : null;
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_CONTEXT_LENGTH)) {
      setStatus(`Enter a whole number from 1 to ${MAX_CONTEXT_LENGTH.toLocaleString()}.`);
      return;
    }
    if (parsed === entry.contextLength && (!entry.contextLengthManual || parsed !== null)) return;
    setBusy(true);
    setStatus(null);
    void updateCatalogContextLength(entry.slug, parsed)
      .then(() => setStatus('Saved'))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'Could not save context limit'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="catalog-row">
      <span>{entry.name}</span>
      <span className="catalog-context">
        <EditableField
          label={`Context limit for ${entry.name}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CONTEXT_LENGTH}
          step={1}
          value={entry.contextLength?.toString() ?? ''}
          display={entry.contextLength ? `${entry.contextLength.toLocaleString()} ctx` : ''}
          placeholder="Context"
          disabled={busy}
          onCommit={saveContextLength}
        />
        {entry.contextLengthManual && <small>Manual</small>}
        {status && <small>{status}</small>}
      </span>
      <button type="button" aria-label={`Remove ${entry.name}`} onClick={onRemove}>
        <IconTrash />
      </button>
    </div>
  );
}
