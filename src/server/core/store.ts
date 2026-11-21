import { redis } from '@devvit/web/server';
import { addDays } from '../../shared/puzzle';
import type {
  DailyResult,
  DayBoard,
  LeaderboardEntry,
  UserStats,
} from '../../shared/api';
import { emptyStats } from '../../shared/api';

const DAY_TTL_SECONDS = 60 * 60 * 24 * 120;
const MAX_OVER_PAR_BUCKET = 6;

const keys = {
  results: (day: string) => `upslide:results:${day}`,
  board: (day: string) => `upslide:board:${day}`,
  overPar: (day: string) => `upslide:overpar:${day}`,
  user: (userId: string) => `upslide:user:${userId}`,
  dailyPost: (day: string) => `upslide:post:${day}`,
};

// Leaderboard score: fewer moves first, then faster time (deciseconds, capped below 1e6).
const boardScore = (r: DailyResult) =>
  r.totalMoves * 1_000_000 + Math.min(999_999, Math.round(r.timeMs / 100));
const fromBoardScore = (score: number) => ({
  totalMoves: Math.floor(score / 1_000_000),
  timeMs: (score % 1_000_000) * 100,
});

export async function getResult(
  day: string,
  userId: string
): Promise<DailyResult | null> {
  const raw = await redis.hGet(keys.results(day), userId);
  if (!raw) return null;
  const parsed: DailyResult = JSON.parse(raw);
  return parsed;
}

/** Stores the result once per user per day. Returns false if a result already existed. */
export async function saveResult(
  day: string,
  userId: string,
  result: DailyResult
): Promise<boolean> {
  const created = await redis.hSetNX(
    keys.results(day),
    userId,
    JSON.stringify(result)
  );
  if (!created) return false;
  await redis.expire(keys.results(day), DAY_TTL_SECONDS);
  return true;
}

export async function addToBoard(
  day: string,
  username: string,
  result: DailyResult
): Promise<void> {
  await redis.zAdd(keys.board(day), {
    member: username,
    score: boardScore(result),
  });
  const bucket = Math.min(
    MAX_OVER_PAR_BUCKET,
    Math.max(0, result.totalMoves - result.totalPar)
  );
  await redis.hIncrBy(keys.overPar(day), String(bucket), 1);
  await redis.expire(keys.board(day), DAY_TTL_SECONDS);
  await redis.expire(keys.overPar(day), DAY_TTL_SECONDS);
}

export async function getBoard(
  day: string,
  username: string | null,
  limit = 10
): Promise<DayBoard> {
  const [players, top, overPar] = await Promise.all([
    redis.zCard(keys.board(day)),
    redis.zRange(keys.board(day), 0, limit - 1, { by: 'rank' }),
    redis.hGetAll(keys.overPar(day)),
  ]);
  const entries: LeaderboardEntry[] = top.map((m, i) => ({
    rank: i + 1,
    username: m.member,
    ...fromBoardScore(m.score),
  }));
  let me: LeaderboardEntry | null = null;
  if (username) {
    const [rank, score] = await Promise.all([
      redis.zRank(keys.board(day), username),
      redis.zScore(keys.board(day), username),
    ]);
    if (rank !== undefined && score !== undefined) {
      me = { rank: rank + 1, username, ...fromBoardScore(score) };
    }
  }
  const histogram: Record<string, number> = {};
  for (const [k, v] of Object.entries(overPar ?? {}))
    histogram[k] = Number(v) || 0;
  return { dayKey: day, players, top: entries, me, overPar: histogram };
}

export async function getStats(userId: string): Promise<UserStats> {
  const h = await redis.hGetAll(keys.user(userId));
  const stats = emptyStats();
  if (!h || Object.keys(h).length === 0) return stats;
  stats.played = Number(h.played) || 0;
  stats.streak = Number(h.streak) || 0;
  stats.maxStreak = Number(h.maxStreak) || 0;
  stats.lastDay = h.lastDay || null;
  stats.perfectDays = Number(h.perfectDays) || 0;
  stats.totalStars = Number(h.totalStars) || 0;
  return stats;
}

/** A streak is alive if the last completed day is today or yesterday. */
export function liveStreak(stats: UserStats, today: string): UserStats {
  if (!stats.lastDay) return stats;
  if (stats.lastDay === today || stats.lastDay === addDays(today, -1))
    return stats;
  return { ...stats, streak: 0 };
}

export async function recordCompletion(
  userId: string,
  result: DailyResult
): Promise<UserStats> {
  const prev = await getStats(userId);
  const stats = { ...prev };
  stats.played += 1;
  if (!prev.lastDay || result.dayKey > prev.lastDay) {
    stats.streak =
      prev.lastDay === addDays(result.dayKey, -1) ? prev.streak + 1 : 1;
    stats.lastDay = result.dayKey;
  }
  stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
  if (result.totalMoves <= result.totalPar) stats.perfectDays += 1;
  stats.totalStars += result.stages.reduce((a, s) => a + s.stars, 0);
  await redis.hSet(keys.user(userId), {
    played: String(stats.played),
    streak: String(stats.streak),
    maxStreak: String(stats.maxStreak),
    lastDay: stats.lastDay ?? '',
    perfectDays: String(stats.perfectDays),
    totalStars: String(stats.totalStars),
  });
  return stats;
}

export async function getDailyPostId(day: string): Promise<string | undefined> {
  return redis.get(keys.dailyPost(day));
}

export async function setDailyPostId(
  day: string,
  postId: string
): Promise<void> {
  await redis.set(keys.dailyPost(day), postId);
  await redis.expire(keys.dailyPost(day), DAY_TTL_SECONDS);
}
