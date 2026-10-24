import { PROVIDER_KINDS } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { t } from '../i18n/index.ts';
import { ProviderMark, IconChevron } from '../ui/icons.tsx';

export function ModelsSettings() {
  const { providers, configuredModels, openSettings } = useAppState();
  const connected = providers.filter((provider) => provider.enabled && provider.configured);
  const others = PROVIDER_KINDS.filter((kind) => !connected.some((provider) => provider.kind === kind));
  const row = (kind: typeof PROVIDER_KINDS[number]) => {
    const provider = providers.find((item) => item.kind === kind);
    const enabled = provider?.enabled && provider.configured;
    return <li key={kind}><button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-control bg-chip px-4 py-3 text-left hover:bg-hover" onClick={() => openSettings(kind)}>
      <ProviderMark kind={kind} /><span className="min-w-0 flex-1"><span className="block text-body font-medium">{provider?.label ?? kind}</span><span className="block text-small text-muted">{enabled ? t('{0} models available', { 0: configuredModels.filter((model) => model.provider === kind).length }) : t('Set up provider')}</span></span><IconChevron className="text-muted" />
    </button></li>;
  };
  return <div className="stack"><h2>{t('Models')}</h2><p className="lede">{t('Manage your connected providers and available models.')}</p>
    {connected.length > 0 && <section><h3 className="mb-3 text-ui font-medium text-muted">{t('Connected providers')}</h3><ul className="flex flex-col gap-2">{connected.map((provider) => row(provider.kind))}</ul></section>}
    {others.length > 0 && <section><h3 className="mb-3 text-ui font-medium text-muted">{t('Add a provider')}</h3><ul className="flex flex-col gap-2">{others.map(row)}</ul></section>}
  </div>;
}
