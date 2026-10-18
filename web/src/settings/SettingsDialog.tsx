import { t } from '../i18n/index.ts';
import { useEffect } from 'react';
import { LOCAL_PROVIDER_KINDS, PROVIDER_KINDS, isCustomizeTab, isLocalProvider, isProviderKind, type ProviderKind } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { cn } from '../lib/cn.ts';
import { AppearanceSettings } from './AppearanceSettings.tsx';
import { CustomizeSettings } from './CustomizeSettings.tsx';
import { GeneralSettings } from './GeneralSettings.tsx';
import { ProviderPage } from './ProviderSettings.tsx';
import { ICON_BUTTON } from '../ui/button-styles.ts';
import { IconClose, IconPalette, IconSliders, IconWand, ProviderMark } from '../ui/icons.tsx';

const LOCAL_KINDS: readonly ProviderKind[] = LOCAL_PROVIDER_KINDS;

/** Settings nav row. Mirrors the sidebar NAV_ROW: 32px, 14px, icon 18px, active pill. */
const SETTINGS_NAV_ROW =
  'flex h-8 w-full items-center gap-2.5 rounded-control px-2 text-left text-body text-ink hover:bg-hover [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:flex-none max-md:h-10 max-md:w-auto max-md:flex-none max-md:rounded-full max-md:bg-field max-md:px-3.5 max-md:hover:bg-chat-active';

/** Selected nav row: a soft accent tint. */
const NAV_ROW_ACTIVE = 'bg-chat-active font-medium hover:bg-chat-active max-md:bg-chat-active';

/** Icon slot of a nav row: neutral, no tint. Provider rows keep their brand-colour mark (ui/provider-icons.tsx). */
const NAV_CHIP = 'flex h-6 w-6 flex-none items-center justify-center text-muted';

export function SettingsPage() {
  const { settingsOpen, settingsTab, openSettings, closeSettings, providers } = useAppState();

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, closeSettings]);

  if (!settingsOpen) return null;

  const remote = PROVIDER_KINDS.filter((kind) => !isLocalProvider(kind));
  const customizeActive = settingsTab === 'customize' || isCustomizeTab(settingsTab);

  return (
    <section className="settings panel-shell flex min-w-0 flex-1 bg-main max-md:flex-col" aria-labelledby="settings-title">
      <nav className="settings-nav">
        <h2 id="settings-title">{t("Settings")}</h2>
        <button type="button" className={cn(ICON_BUTTON, 'md:hidden')} aria-label={t("Close settings")} onClick={closeSettings}>
          <IconClose />
        </button>
        <button
          type="button"
          className={cn(SETTINGS_NAV_ROW, settingsTab === 'general' && NAV_ROW_ACTIVE)}
          data-active={settingsTab === 'general' ? 'true' : 'false'}
          onClick={() => openSettings('general')}
        >
          <span className={NAV_CHIP}>
            <IconSliders />
          </span>
          {t("General")}</button>
        <button
          type="button"
          className={cn(SETTINGS_NAV_ROW, settingsTab === 'appearance' && NAV_ROW_ACTIVE)}
          data-active={settingsTab === 'appearance' ? 'true' : 'false'}
          onClick={() => openSettings('appearance')}
        >
          <span className={NAV_CHIP}>
            <IconPalette />
          </span>
          {t("Appearance")}</button>
        <button
          type="button"
          className={cn(SETTINGS_NAV_ROW, customizeActive && NAV_ROW_ACTIVE)}
          data-active={customizeActive ? 'true' : 'false'}
          onClick={() => openSettings('customize')}
        >
          <span className={NAV_CHIP}>
            <IconWand />
          </span>
          {t("Customize")}</button>
        <p className="nav-heading">{t("Model Providers")}</p>
        <p className="nav-subhead">{t("Local")}</p>
        {LOCAL_KINDS.map((kind) => (
          <ProviderLink key={kind} kind={kind} label={providerLabel(kind, providers)} active={settingsTab === kind} />
        ))}
        <p className="nav-subhead">{t("Remote")}</p>
        {remote.map((kind) => (
          <ProviderLink key={kind} kind={kind} label={providerLabel(kind, providers)} active={settingsTab === kind} />
        ))}
      </nav>
      <div className="settings-body">
        <div className="column">
          {settingsTab === 'general' && <GeneralSettings />}
          {settingsTab === 'appearance' && <AppearanceSettings />}
          {customizeActive && (
            <CustomizeSettings key={isCustomizeTab(settingsTab) ? settingsTab : 'customize'} initialTab={isCustomizeTab(settingsTab) ? settingsTab : 'skills'} />
          )}
          {isProviderKind(settingsTab) && <ProviderPage key={settingsTab} kind={settingsTab} />}
        </div>
      </div>
    </section>
  );
}

function ProviderLink({ kind, label, active }: { kind: ProviderKind; label: string; active: boolean }) {
  const { openSettings } = useAppState();
  return (
    <button
      type="button"
      className={cn(SETTINGS_NAV_ROW, active && NAV_ROW_ACTIVE)}
      data-active={active ? 'true' : 'false'}
      onClick={() => openSettings(kind)}
    >
      <span className={NAV_CHIP}>
        <ProviderMark kind={kind} />
      </span>
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
    </button>
  );
}

function providerLabel(kind: ProviderKind, providers: { kind: ProviderKind; label: string }[]) {
  return providers.find((provider) => provider.kind === kind)?.label ?? kind;
}
