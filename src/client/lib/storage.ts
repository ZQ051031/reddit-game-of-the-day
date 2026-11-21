import type { DailyResult, UserStats } from '../../shared/api';
import { emptyStats } from '../../shared/api';
import { addDays } from '../../shared/puzzle';

const PREFIX = 'upslide:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed: T = JSON.parse(raw);
    return parsed;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, sandboxed iframes); the game still works without it.
  }
}

export type SavedRun = { actions: string[]; stage: number; elapsedMs: number };

export type LocalResult = DailyResult & {
  actions: string[];
  submitted: boolean;
};

export const storage = {
  getRun: (dayKey: string) => read<SavedRun | null>(`run:${dayKey}`, null),
  setRun: (dayKey: string, run: SavedRun) => write(`run:${dayKey}`, run),
  clearRun: (dayKey: string) => {
    try {
      localStorage.removeItem(`${PREFIX}run:${dayKey}`);
    } catch {
      // ignore
    }
  },
  getResult: (dayKey: string) =>
    read<LocalResult | null>(`result:${dayKey}`, null),
  setResult: (r: LocalResult) => write(`result:${r.dayKey}`, r),
  getStats: () => read<UserStats>('stats', emptyStats()),
  setStats: (s: UserStats) => write('stats', s),
  getMuted: () => read<boolean>('muted', false),
  setMuted: (m: boolean) => write('muted', m),
  getSeenHelp: () => read<boolean>('seenHelp', false),
  setSeenHelp: () => write('seenHelp', true),
};

/** Mirrors the server streak rules for offline / logged-out play. */
export function applyLocalCompletion(
  stats: UserStats,
  r: DailyResult
): UserStats {
  const next = { ...stats, played: stats.played + 1 };
  if (!stats.lastDay || r.dayKey > stats.lastDay) {
    next.streak =
      stats.lastDay === addDays(r.dayKey, -1) ? stats.streak + 1 : 1;
    next.lastDay = r.dayKey;
  }
  next.maxStreak = Math.max(next.maxStreak, next.streak);
  if (r.totalMoves <= r.totalPar) next.perfectDays += 1;
  next.totalStars += r.stages.reduce((a, s) => a + s.stars, 0);
  return next;
}

export function liveLocalStreak(stats: UserStats, today: string): UserStats {
  if (
    !stats.lastDay ||
    stats.lastDay === today ||
    stats.lastDay === addDays(today, -1)
  )
    return stats;
  return { ...stats, streak: 0 };
}
