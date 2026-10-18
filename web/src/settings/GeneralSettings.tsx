import { t } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import type { AgentPublic, LanguageSetting } from '../../../shared/types.ts';
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
      if (!cancelled) setNotice(error instanceof Error ? error.message : t("Could not load subagents"));
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
    { value: '', label: t("None") },
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
      setNotice(error instanceof Error ? error.message : t("Could not save the autocomplete model"));
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
      setNotice(error instanceof Error ? error.message : t("Could not save the subagent model"));
    } finally {
      setSavingAgent(null);
    }
  };

  return (
    <div className="stack">
      <h2>{t("General")}</h2>
      <SettingCard>
        <SettingRow label={t("Language")} detail={t("Choose the language used throughout the application.")}>
          <Menu
            label={t("Language")}
            value={settings.language}
            options={[
              { value: 'system', label: t("System language") },
              { value: 'tr', label: t("Türkçe") },
              { value: 'en', label: t("English") },
            ]}
            onChange={(language) => { void saveSettings({ language: language as LanguageSetting }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("Could not save language"))); }}
          />
        </SettingRow>
      </SettingCard>
      <SettingCard>
        <SettingRow label={t("Migration")} detail={t("Move existing application data into Xeck.")}>
          <button type="button" className={BUTTON.secondary} onClick={openMigration}>{t("Open migration")}</button>
        </SettingRow>
      </SettingCard>
      <SettingCard>
        <SettingRow label={t("Default model")} detail={t("Used when you start a new chat.")}>
          <Menu
            label={t("Default model")}
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
          label={t("Autocomplete model")}
          detail={t("Names a new chat from its first message. None keeps the first message as the title.")}
        >
          <Menu
            label={t("Autocomplete model")}
            value={autocompleteSelected}
            options={modelOptions}
            onChange={(next) => {
              void saveAutocompleteProfile(next);
            }}
          />
        </SettingRow>
        <SettingRow label={t("Enter to send")} detail={t("Shift+Enter inserts a new line.")}>
          <Switch
            checked={settings.enterToSend}
            label={t("Enter to send")}
            onChange={(enterToSend) => {
              void saveSettings({ enterToSend });
            }}
          />
        </SettingRow>
        <SettingRow label={t("Debug mode")} detail={t("Shows skill and MCP details and this chat's context tree.")}>
          <Switch
            checked={settings.debugMode}
            label={t("Debug mode")}
            onChange={(debugMode) => {
              void saveSettings({ debugMode });
            }}
          />
        </SettingRow>
        <SettingRow label={t("Show reasoning")} detail={t("Collapsed by default inside each reply.")}>
          <Switch
            checked={settings.showReasoning}
            label={t("Show reasoning")}
            onChange={(showReasoning) => {
              void saveSettings({ showReasoning });
            }}
          />
        </SettingRow>
        {notice && <p className="error-banner">{t(notice)}</p>}
      </SettingCard>
      {subagents.length > 0 && (
        <SettingCard>
          <div className="form-pad">
            <p className="setting-label">{t("Subagent models")}</p>
            <p className="lede">{t("Inherit uses the master chat's current model. A selected model applies to new delegated tasks.")}</p>
          </div>
          {subagents.map((agent) => {
            const profile = settings.agentProfiles[agent.id];
            const value = profile ? `${profile.provider}:${profile.model}` : '';
            const options = [
              { value: '', label: t("Inherit"), group: t("Parent model") },
              ...modelOptions.slice(1).map((option) => ({ ...option, group: t("Selected model") })),
            ];
            if (value && !options.some((option) => option.value === value)) {
              options.push({ value, label: t("{model} (unavailable)", { model: `${profile!.provider} · ${profile!.model}` }), group: t("Selected model") });
            }
            return (
              <SettingRow key={agent.id} label={agent.label} detail={agent.description}>
                <Menu
                  label={t("{0} model", { "0": t(agent.label) })}
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
