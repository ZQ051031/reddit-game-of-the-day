import type { DailyResult, UserStats } from '../../shared/api';
import { emptyStats } from '../../shared/api';
export {
  applyCompletion as applyLocalCompletion,
  liveStreak as liveLocalStreak,
} from '../../shared/progress';

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
  ranked?: boolean;
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
