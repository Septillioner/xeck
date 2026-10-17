import { useState } from 'react';
import { REASONING_EFFORTS, SERVICE_TIERS, type ReasoningEffort, type ServiceTier } from '../../../shared/types.ts';
import { Switch } from '../ui/SettingRow.tsx';

export const SERVICE_TIER_AUTO_LABEL = 'Auto';
export const SERVICE_TIER_ROW_LABEL = 'Service tier';
export const EFFORT_DEFAULT_LABEL = 'Default';
export const EFFORT_ROW_LABEL = 'Effort';
export const MODEL_ROW_LABEL = 'Model';
export const MODEL_PILL_DETAIL_SEPARATOR = ' · ';

export type ModelConfigPick = 'effort' | 'tier';

export function ConfigPanel({
  effort,
  serviceTier,
  modelLabel,
  browsing,
  onToggleModel,
  onEffortChange,
  onServiceTierChange,
  maxContextEnabled,
  onMaxContextChange,
}: {
  effort: ReasoningEffort | null;
  serviceTier: ServiceTier | null;
  modelLabel: string;
  browsing: boolean;
  onToggleModel: () => void;
  onEffortChange?: (effort: ReasoningEffort | null) => void;
  onServiceTierChange?: (tier: ServiceTier | null) => void;
  maxContextEnabled?: boolean;
  onMaxContextChange?: (enabled: boolean) => void;
}) {
  const [picking, setPicking] = useState<ModelConfigPick | null>(null);
  const chooseEffort = (next: ReasoningEffort | null) => {
    onEffortChange?.(next);
    setPicking(null);
  };
  const chooseTier = (next: ServiceTier | null) => {
    onServiceTierChange?.(next);
    setPicking(null);
  };

  const openPick = (next: ModelConfigPick) => {
    setPicking((current) => (current === next ? null : next));
    if (browsing) onToggleModel();
  };

  return (
    <>
      <div className="menu-rail">
        {onMaxContextChange && (
          <div className="config-row">
            <span>MAX context</span>
            <Switch
              checked={maxContextEnabled === true}
              label={`Use MAX context tier for ${modelLabel}`}
              onChange={onMaxContextChange}
            />
          </div>
        )}
        {onMaxContextChange && <div className="config-separator" role="separator" />}
        {onServiceTierChange && (
          <button type="button" className="config-row" data-active={picking === 'tier' ? 'true' : 'false'} onClick={() => openPick('tier')}>
            <span>{SERVICE_TIER_ROW_LABEL}</span>
            <span className="config-value">{serviceTier ?? SERVICE_TIER_AUTO_LABEL}</span>
            <i className="chevron" />
          </button>
        )}
        {onEffortChange && (
          <button type="button" className="config-row" data-active={picking === 'effort' ? 'true' : 'false'} onClick={() => openPick('effort')}>
            <span>{EFFORT_ROW_LABEL}</span>
            <span className="config-value">{effort ?? EFFORT_DEFAULT_LABEL}</span>
            <i className="chevron" />
          </button>
        )}
        <button
          type="button"
          className="config-row"
          data-active={browsing ? 'true' : 'false'}
          onClick={() => {
            setPicking(null);
            onToggleModel();
          }}
        >
          <span>{MODEL_ROW_LABEL}</span>
          <span className="config-value">{modelLabel}</span>
          <i className="chevron" />
        </button>
      </div>
      {picking === 'tier' && (
        <div className="menu-rail">
          <button type="button" className="config-row" data-active={serviceTier === null ? 'true' : 'false'} onClick={() => chooseTier(null)}>
            {SERVICE_TIER_AUTO_LABEL}
          </button>
          {SERVICE_TIERS.map((item) => (
            <button key={item} type="button" className="config-row" data-active={serviceTier === item ? 'true' : 'false'} onClick={() => chooseTier(item)}>
              {item}
            </button>
          ))}
        </div>
      )}
      {picking === 'effort' && (
        <div className="menu-rail">
          <button type="button" className="config-row" data-active={effort === null ? 'true' : 'false'} onClick={() => chooseEffort(null)}>
            {EFFORT_DEFAULT_LABEL}
          </button>
          {REASONING_EFFORTS.map((item) => (
            <button key={item} type="button" className="config-row" data-active={effort === item ? 'true' : 'false'} onClick={() => chooseEffort(item)}>
              {item}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
