import { getLocale } from '../i18n/core.ts';
/**
 * Session timestamps as the lists write them: a clock for today, the day for
 * anything older. `now` is injectable so the two functions stay pure and can be
 * checked without mocking the clock.
 */

function formats() {
  const locale = getLocale();
  return {
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
    year: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/** Row label: today's chats read as a time, older ones as a day. */
export function formatChatTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return isSameLocalDay(date, now) ? formats().time.format(date) : formats().date.format(date);
}

/** Header label: the day, with the year only when it is not the current one. */
export function formatChatDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() === now.getFullYear() ? formats().date.format(date) : formats().year.format(date);
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
