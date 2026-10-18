import { t } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { useAppState } from '../state/AppState.tsx';
import { SettingCard, SettingRow, Switch } from '../ui/SettingRow.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { TextField } from '../ui/TextField.tsx';

export function AgentSettings() {
  const { settings, saveSettings } = useAppState();
  const [systemInstructions, setSystemInstructions] = useState(settings.systemInstructions);
  const [workspaceRoot, setWorkspaceRoot] = useState(settings.workspaceRoot);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSystemInstructions(settings.systemInstructions);
    setWorkspaceRoot(settings.workspaceRoot);
  }, [settings.systemInstructions, settings.workspaceRoot]);

  const saveInstructions = async () => {
    if (systemInstructions === settings.systemInstructions) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveSettings({ systemInstructions });
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : t("Could not save agent instructions"));
    } finally {
      setSaving(false);
    }
  };

  const saveWorkspaceRoot = async () => {
    if (workspaceRoot === settings.workspaceRoot) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveSettings({ workspaceRoot });
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : t("Could not save workspace root"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <h2>{t("Agent")}</h2>
      <SettingCard>
        <div className="form-pad">
          <div>
            <p className="setting-label">{t("System Instructions")}</p>
            <p className="lede">{t("Applied to every chat agent.")}</p>
          </div>
          <Textarea
            value={systemInstructions}
            aria-label={t("System Instructions")}
            disabled={saving}
            onChange={(event) => setSystemInstructions(event.target.value)}
            onBlur={() => void saveInstructions()}
            placeholder={t("Add instructions for how Xeck should work.")}
          />
          {saving && <p className="status-line"><span className="shimmer-text">{t("Saving")}</span></p>}
          {notice && <p className="error-banner">{t(notice)}</p>}
        </div>
        <SettingRow
          label={t("Xeck Built-in instructions")}
          detail={t("Explains the purpose and safe use of Xeck's built-in MCP tools and the current environment.")}
        >
          <Switch
            checked={settings.xeckInstructionsEnabled}
            label={t("Xeck Built-in instructions")}
            onChange={(xeckInstructionsEnabled) => {
              void saveSettings({ xeckInstructionsEnabled }).catch((error: unknown) => {
                setNotice(error instanceof Error ? error.message : t("Could not save agent instructions"));
              });
            }}
          />
        </SettingRow>
        <SettingRow
          label={t("Workspace root")}
          detail={t("Relative file tool paths resolve here. Leave blank to use the host working directory.")}
        >
          <TextField
            width="wide"
            value={workspaceRoot}
            disabled={saving}
            aria-label={t("Workspace root")}
            onChange={(event) => setWorkspaceRoot(event.target.value)}
            onBlur={() => void saveWorkspaceRoot()}
            placeholder={t("Host working directory")}
          />
        </SettingRow>
        <SettingRow
          label={t("Full file access")}
          detail={t("Allow built-in file tools to read and write paths outside the workspace root.")}
        >
          <Switch
            checked={settings.fullFileAccess}
            disabled={saving}
            label={t("Full file access")}
            onChange={(fullFileAccess) => {
              void saveSettings({ fullFileAccess }).catch((error: unknown) => {
                setNotice(error instanceof Error ? error.message : t("Could not save file access setting"));
              });
            }}
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
}
