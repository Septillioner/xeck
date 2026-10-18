import { isCustomizeTab, isProviderKind, type SettingsTab } from '../../../shared/types.ts';

const SETTINGS_PAGES = ['general', 'appearance'] as const;

export type AppLocation =
  | { kind: 'draft' }
  | { kind: 'bots' }
  | { kind: 'migration' }
  | { kind: 'chat'; id: string }
  | { kind: 'settings'; tab: SettingsTab }
  | { kind: 'project'; id: string };

export function readLocation(): AppLocation {
  const parts = routePath().split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'xeckbot' && parts.length === 1) return { kind: 'bots' };
  if (parts.length === 0) return { kind: 'draft' };
  if (parts[0] === 'migration' && parts.length === 1) return { kind: 'migration' };
  if (parts[0] === 'c' && parts[1]) return { kind: 'chat', id: parts[1] };
  if (parts[0] === 'p' && parts[1]) return { kind: 'project', id: parts[1] };
  if (parts[0] === 'settings' && parts[1]) {
    const page = parts[1] === 'agent' ? 'customize' : parts[1];
    if (isSettingsPage(page)) return { kind: 'settings', tab: page };
  }
  return { kind: 'draft' };
}

export function pathFor(location: AppLocation): string {
  if (location.kind === 'bots') return '/xeckbot';
  if (location.kind === 'draft') return '/';
  if (location.kind === 'migration') return '/migration';
  if (location.kind === 'chat') return `/c/${encodeURIComponent(location.id)}`;
  if (location.kind === 'project') return `/p/${encodeURIComponent(location.id)}`;
  return `/settings/${encodeURIComponent(location.tab)}`;
}

export function routePath(): string {
  if (window.location.protocol !== 'file:') return window.location.pathname;
  const hash = window.location.hash.slice(1);
  if (!hash) return '/';
  return hash.startsWith('/') ? hash : `/${hash}`;
}

export function writeLocation(location: AppLocation, mode: 'push' | 'replace') {
  const path = pathFor(location);
  if (routePath() === path) return;
  const update = mode === 'push' ? history.pushState : history.replaceState;
  const next = window.location.protocol === 'file:'
    ? `${window.location.pathname}${window.location.search}#${path}`
    : path;
  update.call(history, null, '', next);
}

function isSettingsPage(value: string): value is SettingsTab {
  return (SETTINGS_PAGES as readonly string[]).includes(value) || isCustomizeTab(value) || isProviderKind(value);
}
