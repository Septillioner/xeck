import { useEffect, useState } from 'react';
import type { AgentPublic } from '../../../shared/types.ts';
import { listAgents } from '../api/client.ts';
import { Menu } from '../ui/Menu.tsx';
import { useAppState } from '../state/AppState.tsx';
import { SettingCard, SettingRow, Switch } from '../ui/SettingRow.tsx';
import { BUTTON } from '../ui/button-styles.ts';

export function GeneralSettings() {
  const { settings, saveSettings, configuredModels, providers, catalog, openMigration } = useAppState();
  const [notice, setNotice] = useState<string | null>(null);
  const [subagents, setSubagents] = useState<AgentPublic[]>([]);
  const [savingAgent, setSavingAgent] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listAgents('agent').then((agents) => {
      if (!cancelled) setSubagents(agents);
    }).catch((error: unknown) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : 'Could not load subagents');
    });
    return () => { cancelled = true; };
  }, []);
  const labels = new Map(providers.map((provider) => [provider.kind, provider.label]));
  const selected = settings.defaultProfile
    ? `${settings.defaultProfile.provider}:${settings.defaultProfile.model}`
    : '';
  const autocompleteSelected = settings.autocompleteProfile
    ? `${settings.autocompleteProfile.provider}:${settings.autocompleteProfile.model}`
    : '';
  const modelOptions = [
    { value: '', label: 'None' },
    ...configuredModels.map((profile) => {
      const name =
        catalog.find((entry) => entry.provider === profile.provider && entry.model === profile.model)?.name ??
        profile.model;
      return {
        value: `${profile.provider}:${profile.model}`,
        label: `${labels.get(profile.provider) ?? profile.provider} · ${name}`,
      };
    }),
  ];

  const saveAutocompleteProfile = async (next: string) => {
    const match = configuredModels.find((profile) => `${profile.provider}:${profile.model}` === next);
    setNotice(null);
    try {
      await saveSettings({ autocompleteProfile: match ?? null });
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : 'Could not save the autocomplete model');
    }
  };

  const saveAgentProfile = async (agentId: string, next: string) => {
    const profile = configuredModels.find((item) => `${item.provider}:${item.model}` === next);
    if (next && !profile) return;
    setSavingAgent(agentId);
    setNotice(null);
    try {
      await saveSettings({ agentProfiles: { ...settings.agentProfiles, [agentId]: profile ?? null } });
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : 'Could not save the subagent model');
    } finally {
      setSavingAgent(null);
    }
  };

  return (
    <div className="stack">
      <h2>General</h2>
      <SettingCard>
        <SettingRow label="Migration" detail="Move existing application data into Xeck.">
          <button type="button" className={BUTTON.secondary} onClick={openMigration}>Open migration</button>
        </SettingRow>
      </SettingCard>
      <SettingCard>
        <SettingRow label="Default model" detail="Used when you start a new chat.">
          <Menu
            label="Default model"
            value={selected}
            options={modelOptions}
            onChange={(next) => {
              if (!next) {
                void saveSettings({ defaultProfile: null });
                return;
              }
              const separator = next.indexOf(':');
              const provider = next.slice(0, separator);
              const model = next.slice(separator + 1);
              const match = configuredModels.find((item) => item.provider === provider && item.model === model);
              if (match) void saveSettings({ defaultProfile: match });
            }}
          />
        </SettingRow>
        <SettingRow
          label="Autocomplete model"
          detail="Names a new chat from its first message. None keeps the first message as the title."
        >
          <Menu
            label="Autocomplete model"
            value={autocompleteSelected}
            options={modelOptions}
            onChange={(next) => {
              void saveAutocompleteProfile(next);
            }}
          />
        </SettingRow>
        <SettingRow label="Enter to send" detail="Shift+Enter inserts a new line.">
          <Switch
            checked={settings.enterToSend}
            label="Enter to send"
            onChange={(enterToSend) => {
              void saveSettings({ enterToSend });
            }}
          />
        </SettingRow>
        <SettingRow label="Debug mode" detail="Shows skill and MCP details and this chat's context tree.">
          <Switch
            checked={settings.debugMode}
            label="Debug mode"
            onChange={(debugMode) => {
              void saveSettings({ debugMode });
            }}
          />
        </SettingRow>
        <SettingRow label="Show reasoning" detail="Collapsed by default inside each reply.">
          <Switch
            checked={settings.showReasoning}
            label="Show reasoning"
            onChange={(showReasoning) => {
              void saveSettings({ showReasoning });
            }}
          />
        </SettingRow>
        {notice && <p className="error-banner">{notice}</p>}
      </SettingCard>
      {subagents.length > 0 && (
        <SettingCard>
          <div className="form-pad">
            <p className="setting-label">Subagent models</p>
            <p className="lede">Inherit uses the master chat's current model. A selected model applies to new delegated tasks.</p>
          </div>
          {subagents.map((agent) => {
            const profile = settings.agentProfiles[agent.id];
            const value = profile ? `${profile.provider}:${profile.model}` : '';
            const options = [
              { value: '', label: 'Inherit', group: 'Parent model' },
              ...modelOptions.slice(1).map((option) => ({ ...option, group: 'Selected model' })),
            ];
            if (value && !options.some((option) => option.value === value)) {
              options.push({ value, label: `${profile!.provider} · ${profile!.model} (unavailable)`, group: 'Selected model' });
            }
            return (
              <SettingRow key={agent.id} label={agent.label} detail={agent.description}>
                <Menu
                  label={`${agent.label} model`}
                  value={value}
                  options={options}
                  disabled={savingAgent !== null}
                  searchable
                  onChange={(next) => { void saveAgentProfile(agent.id, next); }}
                />
              </SettingRow>
            );
          })}
        </SettingCard>
      )}
    </div>
  );
}
