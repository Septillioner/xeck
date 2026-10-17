/**
 * The Escape contract between a popover menu and whatever contains it.
 *
 * `Menu` marks its root with `data-xeck-menu` plus `data-open`, and containers
 * such as `Dialog` check for that marker before handling Escape themselves. This
 * is deliberately a data attribute rather than a class name: class names are a
 * styling decision and change during the Tailwind migration, while this is a
 * behavior contract that must survive it.
 */
export const MENU_MARKER = 'data-xeck-menu';
export const OPEN_VALUE = 'true';

/** True when `scope` contains a menu that is currently open. */
export function hasOpenMenu(scope: HTMLElement | null): boolean {
  if (!scope) return false;
  return Boolean(scope.querySelector(`[${MENU_MARKER}][data-open='${OPEN_VALUE}']`));
}