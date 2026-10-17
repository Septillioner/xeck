/**
 * Session timestamps as the lists write them: a clock for today, the day for
 * anything older. `now` is injectable so the two functions stay pure and can be
 * checked without mocking the clock.
 */

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const DATE_WITH_YEAR = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Row label: today's chats read as a time, older ones as a day. */
export function formatChatTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return isSameLocalDay(date, now) ? TIME.format(date) : DATE.format(date);
}

/** Header label: the day, with the year only when it is not the current one. */
export function formatChatDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() === now.getFullYear() ? DATE.format(date) : DATE_WITH_YEAR.format(date);
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
