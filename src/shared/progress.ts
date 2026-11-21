import type { DailyResult, InitResponse, UserStats } from './api.ts';
import { addDays, dayKeyFromDate } from './puzzle.ts';

export function completionDays(stats: UserStats): string[] {
  if (stats.completedDays) return stats.completedDays;
  if (!stats.lastDay) return [];
  return Array.from({ length: Math.max(1, stats.streak) }, (_, i) =>
    addDays(stats.lastDay!, -i)
  );
}

export function applyCompletion(stats: UserStats, r: DailyResult): UserStats {
  const days = new Set(completionDays(stats));
  if (days.has(r.dayKey)) return stats;
  days.add(r.dayKey);
  const sorted = [...days].sort();
  let streak = 0;
  let maxStreak = stats.maxStreak;
  let previous: string | null = null;
  for (const day of sorted) {
    streak = previous === addDays(day, -1) ? streak + 1 : 1;
    maxStreak = Math.max(maxStreak, streak);
    previous = day;
  }
  return {
    played: stats.played + 1,
    streak,
    maxStreak,
    lastDay: sorted[sorted.length - 1]!,
    perfectDays: stats.perfectDays + Number(r.totalMoves <= r.totalPar),
    totalStars: stats.totalStars + r.stages.reduce((n, s) => n + s.stars, 0),
    completedDays: sorted,
  };
}

export function liveStreak(stats: UserStats, today: string): UserStats {
  if (
    !stats.lastDay ||
    stats.lastDay === today ||
    stats.lastDay === addDays(today, -1)
  )
    return stats;
  return { ...stats, streak: 0 };
}

export function mergeGuestSession(
  session: InitResponse,
  loggedIn: boolean,
  stats: UserStats,
  result: DailyResult | null
): InitResponse {
  return loggedIn
    ? session
    : {
        ...session,
        stats: liveStreak(stats, session.dayKey),
        today: session.today ?? result,
      };
}

export function clockDay(now: number, offsetMs: number): string {
  return dayKeyFromDate(new Date(now + offsetMs));
}

export function isSubmitBody(value: unknown): value is {
  dayKey: string;
  actions: string[];
  timeMs: number;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'dayKey' in value &&
    typeof value.dayKey === 'string' &&
    'actions' in value &&
    Array.isArray(value.actions) &&
    value.actions.every((a: unknown) => typeof a === 'string') &&
    'timeMs' in value &&
    typeof value.timeMs === 'number' &&
    Number.isFinite(value.timeMs)
  );
}

export function clampRunTime(
  claimed: number,
  startedAt: number,
  now: number
): number {
  const elapsed = Math.max(1000, now - startedAt);
  return Math.max(1000, Math.min(claimed, elapsed, 86_400_000));
}

export type RunClock = { baseMs: number; since: number | null };

export function elapsedRun(r: RunClock, now: number): number {
  return r.baseMs + (r.since === null ? 0 : Math.max(0, now - r.since));
}

export function pauseRun(r: RunClock, now: number): void {
  r.baseMs = elapsedRun(r, now);
  r.since = null;
}

export function shouldSaveResult(
  ranked: boolean,
  existing: (DailyResult & { ranked?: boolean }) | null
): boolean {
  return ranked || !existing || existing.ranked === false;
}
