import { t } from '../i18n/index.ts';
import { useState } from 'react';
import { isProviderKind, type CatalogEntry, type ProviderKind, type ReasoningEffort, type ServiceTier } from '../../../shared/types.ts';
import { IconSettings, ProviderMark } from '../ui/icons.tsx';
import { Menu } from '../ui/Menu.tsx';
import { ConfigPanel, EFFORT_DEFAULT_LABEL, MODEL_PILL_DETAIL_SEPARATOR } from './ConfigPanel.tsx';

export { EFFORT_DEFAULT_LABEL, MODEL_PILL_DETAIL_SEPARATOR };

export function modelOptions(
  configured: { provider: ProviderKind; model: string; host: string }[],
  providers: { kind: ProviderKind; label: string }[],
  catalog: CatalogEntry[],
  current?: { provider: ProviderKind; model: string },
) {
  const labels = new Map(providers.map((provider) => [provider.kind, provider.label]));
  const title = (provider: ProviderKind, model: string) =>
    catalog.find((entry) => entry.provider === provider && entry.model === model)?.name ?? model;
  const row = (provider: ProviderKind, model: string) => {
    const name = title(provider, model);
    return {
      provider,
      model,
      label: name,
      subtitle: name === model ? undefined : model,
      group: labels.get(provider) ?? provider,
    };
  };
  const options = configured.map((profile) => row(profile.provider, profile.model));
  if (current?.model && !options.some((option) => option.provider === current.provider && option.model === current.model)) {
    options.unshift(row(current.provider, current.model));
  }
  return options;
}

function modelPillDetail(
  showEffort: boolean,
  effort: ReasoningEffort | null | undefined,
  serviceTier: ServiceTier | null | undefined,
  maxContextEnabled: boolean,
): string | undefined {
  const parts: string[] = [];
  if (showEffort) parts.push(t(effort ?? EFFORT_DEFAULT_LABEL));
  if (serviceTier) parts.push(t(serviceTier));
  if (maxContextEnabled) parts.push('MAX');
  if (parts.length === 0) return undefined;
  return parts.join(MODEL_PILL_DETAIL_SEPARATOR);
}

export function ModelMenu({
  provider,
  model,
  options,
  disabled,
  effort,
  serviceTier,
  onEffortChange,
  onServiceTierChange,
  maxContextEnabled,
  onMaxContextChange,
  onChange,
  onAddModel,
}: {
  provider: ProviderKind;
  model: string;
  options: { provider: ProviderKind; model: string; label: string; subtitle?: string; group: string }[];
  disabled: boolean;
  effort?: ReasoningEffort | null;
  serviceTier?: ServiceTier | null;
  onEffortChange?: (effort: ReasoningEffort | null) => void;
  onServiceTierChange?: (tier: ServiceTier | null) => void;
  maxContextEnabled?: boolean;
  onMaxContextChange?: (enabled: boolean) => void;
  onChange: (provider: ProviderKind, model: string) => void;
  onAddModel: () => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const value = model ? `${provider}:${model}` : '';
  const hasConfig = Boolean(onEffortChange || onServiceTierChange || onMaxContextChange);
  return (
    <Menu
      variant="model"
      label={t("Model")}
      placeholder={t("Select model")}
      value={value}
      disabled={disabled}
      searchable
      searchPlaceholder={t("Search models")}
      emptyLabel={t("Add a model in Settings")}
      onEmpty={onAddModel}
      showList={!hasConfig || browsing}
      onOpenChange={(next) => {
        if (!next) setBrowsing(false);
      }}
      footerAction={{
        label: t("Manage models in Settings"),
        icon: <IconSettings />,
        onClick: onAddModel,
      }}
      detail={modelPillDetail(Boolean(onEffortChange), effort, onServiceTierChange ? serviceTier : undefined, maxContextEnabled === true)}
      rail={
        hasConfig ? (
          <ConfigPanel
            effort={effort ?? null}
            serviceTier={serviceTier ?? null}
            modelLabel={model || 'Select model'}
            browsing={browsing}
            onToggleModel={() => setBrowsing((current) => !current)}
            onEffortChange={onEffortChange}
            onServiceTierChange={onServiceTierChange}
            maxContextEnabled={maxContextEnabled}
            onMaxContextChange={onMaxContextChange}
          />
        ) : undefined
      }
      options={options.map((option) => ({
        value: `${option.provider}:${option.model}`,
        label: option.label,
        subtitle: option.subtitle,
        group: option.group,
        icon: <ProviderMark kind={option.provider} />,
      }))}
      onChange={(next) => {
        const separator = next.indexOf(':');
        if (separator <= 0) return;
        const nextProvider = next.slice(0, separator);
        const nextModel = next.slice(separator + 1);
        if (!isProviderKind(nextProvider) || !nextModel) return;
        onChange(nextProvider, nextModel);
      }}
    />
  );
}
