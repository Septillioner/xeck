import { useEffect } from 'react';
import { isCustomizeTab, isProviderKind, type SettingsTab } from '../../../shared/types.ts';
import { t } from '../i18n/index.ts';
import { useAppState } from '../state/AppState.tsx';
import { cn } from '../lib/cn.ts';
import { AppearanceSettings } from './AppearanceSettings.tsx';
import { CustomizeSettings } from './CustomizeSettings.tsx';
import { GeneralSettings } from './GeneralSettings.tsx';
import { ModelsSettings } from './ModelsSettings.tsx';
import { ProviderPage } from './ProviderSettings.tsx';
import { BUTTON, ICON_BUTTON } from '../ui/button-styles.ts';
import { IconClose } from '../ui/icons.tsx';

export function SettingsPage() {
  const { settingsOpen, settingsTab, openSettings, closeSettings } = useAppState();
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[role="dialog"], [data-xeck-menu][data-open="true"]')) closeSettings(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [closeSettings]);
  if (!settingsOpen) return null;
  const providerActive = isProviderKind(settingsTab);
  const customizeActive = settingsTab === 'customize' || isCustomizeTab(settingsTab);
  const tabs: { id: SettingsTab; label: string; active: boolean }[] = [
    { id: 'general', label: 'General', active: settingsTab === 'general' },
    { id: 'appearance', label: 'Appearance', active: settingsTab === 'appearance' },
    { id: 'models', label: 'Models', active: providerActive || settingsTab === 'models' },
    { id: 'customize', label: 'Customize', active: customizeActive },
  ];
  return <section className="panel-shell flex min-w-0 flex-1 flex-col bg-main" aria-labelledby="settings-title">
    <header className="px-gutter pt-6 pb-4 max-sm:px-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between"><h1 id="settings-title" className="m-0 text-heading font-semibold">{t('Settings')}</h1><button type="button" className={ICON_BUTTON} aria-label={t('Close settings')} onClick={closeSettings}><IconClose /></button></div>
      <nav className="mx-auto mt-4 flex max-w-3xl flex-wrap gap-1" aria-label={t('Settings')}>
        {tabs.map((tab) => <button key={tab.id} type="button" className={cn(BUTTON.ghost, tab.active && 'bg-chat-active text-ink')} aria-current={tab.active ? 'page' : undefined} onClick={() => openSettings(tab.id)}>{t(tab.label)}</button>)}
      </nav>
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-gutter pt-2 pb-8 max-sm:px-4"><div className="mx-auto w-full max-w-3xl">
      {settingsTab === 'general' && <GeneralSettings />}
      {settingsTab === 'appearance' && <AppearanceSettings />}
      {settingsTab === 'models' && <ModelsSettings />}
      {customizeActive && <CustomizeSettings key={settingsTab} initialTab={isCustomizeTab(settingsTab) ? settingsTab : 'skills'} />}
      {providerActive && <><button type="button" className={cn(BUTTON.ghost, 'mb-4')} onClick={() => openSettings('models')}>{t('Back to models')}</button><ProviderPage key={settingsTab} kind={settingsTab} /></>}
    </div></div>
  </section>;
}
