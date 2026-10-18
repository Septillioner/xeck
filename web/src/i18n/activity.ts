import { t } from './core.ts';

/** Translate interface labels while preserving file paths and third-party tool names. */
export function translateActivityLabel(label: string): string {
  const failed = label.endsWith(' failed');
  const source = failed ? label.slice(0, -' failed'.length) : label;
  const parts = source.split(' · ');
  const result = parts.map((part, index) => index < 2 ? t(part) : part).join(' · ');
  return failed ? `${result} · ${t('Failed')}` : result;
}
