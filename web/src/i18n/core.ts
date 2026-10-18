import en from './en.json';
import tr from './tr.json';
import type { LanguageSetting } from '../../../shared/types.ts';

export type Locale = 'en' | 'tr';
type Parameters = Record<string, string | number>;
const dictionaries: Record<Locale, Record<string, string>> = { en, tr };
// Notices can outlive a language switch; recognize our own previously translated labels.
const originalKeys = new Map<string, string>();
for (const dictionary of Object.values(dictionaries)) {
  for (const [key, value] of Object.entries(dictionary)) originalKeys.set(value, key);
}
const STORAGE_KEY = 'xeck.language';
const listeners = new Set<() => void>();

export function resolveLocale(language: LanguageSetting, browserLanguage = typeof window === 'undefined' ? 'en' : navigator.language): Locale {
  return language === 'system' ? (browserLanguage.toLowerCase().startsWith('tr') ? 'tr' : 'en') : language;
}

function initialLanguage(): LanguageSetting {
  if (typeof window === 'undefined') return 'system';
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'tr' || value === 'en') return value;
  } catch { /* Storage may be unavailable; the server preference still applies after boot. */ }
  return 'system';
}

let preference = initialLanguage();
let locale = resolveLocale(preference);

export function getLocale(): Locale { return locale; }
export function getLanguage(): LanguageSetting { return preference; }
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setLanguage(language: LanguageSetting): void {
  preference = language;
  const next = resolveLocale(language);
  try { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, language); } catch { /* Server settings are the durable source. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (next === locale) return;
  locale = next;
  for (const listener of listeners) listener();
}

export function translate(language: Locale, key: string, parameters: Parameters = {}): string {
  const source = Object.hasOwn(dictionaries.en, key) ? key : originalKeys.get(key) ?? key;
  const text = Object.hasOwn(dictionaries[language], source) ? dictionaries[language][source] : source;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => !Object.hasOwn(parameters, name) || parameters[name] === undefined ? match : String(parameters[name]));
}

export function t(key: string, parameters?: Parameters): string { return translate(locale, key, parameters); }

if (typeof document !== 'undefined') document.documentElement.lang = locale;
if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => { if (preference === 'system') setLanguage('system'); });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) setLanguage(event.newValue === 'tr' || event.newValue === 'en' ? event.newValue : 'system');
  });
}
