import { t } from '../i18n/index.ts';
import type { AccentColor, TextSizeSetting, ThemeSetting, ToolUsageViewMode } from '../../../shared/types.ts';
import { ACCENT_COLORS, TEXT_SIZES, THEMES, TOOL_USAGE_VIEW_MODES } from '../../../shared/types.ts';
import { IconMonitor, IconMoon, IconSun } from '../ui/icons.tsx';
import { useAppState } from '../state/AppState.tsx';
import { SettingRow, Switch } from '../ui/SettingRow.tsx';

const THEME_LABELS: Record<ThemeSetting, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const TEXT_LABELS: Record<TextSizeSetting, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
};

const ACCENT_LABELS: Record<AccentColor, string> = {
  default: 'Olive',
  coral: 'Clay',
  amber: 'Ochre',
  green: 'Forest',
  blue: 'Azure',
  violet: 'Violet',
  rose: 'Rose',
  teal: 'Teal',
};

const TOOL_MODE_LABELS: Record<ToolUsageViewMode, string> = {
  compact: 'Compact', balanced: 'Balanced', detailed: 'Detailed',
};
const TOOL_MODE_DETAILS: Record<ToolUsageViewMode, string> = {
  compact: 'One live summary per reply, with tool counts, files read and lines changed. Expand to see each tool.',
  balanced: 'Tools flow through the reply. File changes and errors start expanded; routine output starts collapsed.',
  detailed: 'Every tool and its available details start expanded.',
};

export function AppearanceSettings() {
  const { settings, saveSettings } = useAppState();

  return (
    <div className="stack">
      <h2>{t("Appearance")}</h2>
      <section className="appearance-block">
        <h3 className="setting-label">{t("Theme")}</h3>
        <div className="theme-tiles">
          {THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              className="theme-tile"
              data-active={settings.theme === theme ? 'true' : 'false'}
              onClick={() => {
                void saveSettings({ theme });
              }}
            >
              <ThemeIcon theme={theme} />
              <span>{t(THEME_LABELS[theme])}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="appearance-block">
        <h3 className="setting-label">{t("Color")}</h3>
        <div className="accent-swatches" role="group" aria-label={t("Color")}>
          {ACCENT_COLORS.map((accent) => (
            <button
              key={accent}
              type="button"
              className="accent-option"
              data-active={settings.accent === accent ? 'true' : 'false'}
              aria-label={t(ACCENT_LABELS[accent])}
              aria-pressed={settings.accent === accent}
              title={t(ACCENT_LABELS[accent])}
              onClick={() => void saveSettings({ accent })}
            >
              <span className={`swatch swatch-${accent}`} aria-hidden="true" />
              <span>{t(ACCENT_LABELS[accent])}</span>
              {accent === 'default' && <span className="text-nano text-muted">{t("Default")}</span>}
            </button>
          ))}
        </div>
      </section>
      <section className="appearance-block">
        <h3 className="setting-label">{t("Text size")}</h3>
        <div className="segment" role="group" aria-label={t("Text size")}>
          {TEXT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              data-active={settings.textSize === size ? 'true' : 'false'}
              onClick={() => {
                void saveSettings({ textSize: size });
              }}
            >
              {t(TEXT_LABELS[size])}
            </button>
          ))}
        </div>
      </section>
      <section className="appearance-block">
        <h3 className="setting-label">{t("Metrics")}</h3>
        <div className="setting-card">
          <SettingRow label={t("Usage")} detail={t("Shows the last reply and the chat total under the composer.")}>
            <Switch
              checked={settings.showUsage}
              label={t("Usage")}
              onChange={(showUsage) => {
                void saveSettings({ showUsage });
              }}
            />
          </SettingRow>
          <SettingRow label={t("Token speed")} detail={t("Shows tokens per second for the last reply.")}>
            <Switch
              checked={settings.showTokenSpeed}
              label={t("Token speed")}
              onChange={(showTokenSpeed) => {
                void saveSettings({ showTokenSpeed });
              }}
            />
          </SettingRow>
        </div>
      </section>
      <section className="appearance-block">
        <h3 className="setting-label">{t("Tool usage")}</h3>
        <div className="setting-card">
          <SettingRow label={t("Hide tool usages")} detail={t("Hide tool activity in chats. Xeck’s live status, questions and plans stay visible.")}>
            <Switch checked={settings.hideToolUsages} label={t("Hide tool usages")} onChange={(hideToolUsages) => void saveSettings({ hideToolUsages })} />
          </SettingRow>
          <div className="tool-mode-setting" data-disabled={settings.hideToolUsages ? 'true' : undefined}>
            <strong id="tool-mode-label">{t("Tool usage view mode")}</strong>
            <div className="segment" role="group" aria-labelledby="tool-mode-label" aria-describedby="tool-mode-detail">
              {TOOL_USAGE_VIEW_MODES.map((mode) => (
                <button key={mode} type="button" disabled={settings.hideToolUsages}
                  aria-pressed={settings.toolUsageViewMode === mode}
                  data-active={settings.toolUsageViewMode === mode ? 'true' : 'false'}
                  onClick={() => void saveSettings({ toolUsageViewMode: mode })}>
                  {t(TOOL_MODE_LABELS[mode])}
                </button>
              ))}
            </div>
            <p id="tool-mode-detail">{t(TOOL_MODE_DETAILS[settings.toolUsageViewMode])}</p>
          </div>
        </div>
      </section>
      <section className="appearance-block">
        <h3 className="setting-label">{t("Preview")}</h3>
        <div className="setting-card appearance-preview" data-text-size={settings.textSize}>
          <p className="user-bubble">{t("Hello")}</p>
          <p className="preview-reply">{t("This is how replies look.")}</p>
        </div>
      </section>
    </div>
  );
}

function ThemeIcon({ theme }: { theme: ThemeSetting }) {
  if (theme === 'light') return <IconSun />;
  if (theme === 'dark') return <IconMoon />;
  return <IconMonitor />;
}
