import type { SessionSummary } from '../../../shared/types.ts';

export const SESSION_GROUP_LABELS = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const;
export type SessionGroupLabel = (typeof SESSION_GROUP_LABELS)[number];

export const DAY_MS = 86_400_000;
export const PREVIOUS_WEEK_DAYS = 7;

export function groupSessions(sessions: SessionSummary[], now = new Date()): Map<SessionGroupLabel, SessionSummary[]> {
  const groups = new Map<SessionGroupLabel, SessionSummary[]>([
    ['Today', []],
    ['Yesterday', []],
    ['Previous 7 days', []],
    ['Older', []],
  ]);
  const today = startOfLocalDay(now);
  const yesterday = today - DAY_MS;
  const week = today - PREVIOUS_WEEK_DAYS * DAY_MS;

  for (const session of sessions) {
    const updated = new Date(session.updatedAt).getTime();
    if (updated >= today) groups.get('Today')?.push(session);
    else if (updated >= yesterday) groups.get('Yesterday')?.push(session);
    else if (updated >= week) groups.get('Previous 7 days')?.push(session);
    else groups.get('Older')?.push(session);
  }
  return groups;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
