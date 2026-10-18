import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale, t } from './core.ts';

export { getLocale, setLanguage, t } from './core.ts';
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return { locale, t };
}
