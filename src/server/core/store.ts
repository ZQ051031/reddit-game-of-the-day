import { redis } from '@devvit/web/server';
import { applyCompletion, clampRunTime } from '../../shared/progress';
export { liveStreak } from '../../shared/progress';
import type {
  DailyResult,
  DayBoard,
  LeaderboardEntry,
  UserStats,
} from '../../shared/api';
import { emptyStats } from '../../shared/api';
import { getDailyChallenge } from '../../shared/puzzle';

const DAY_TTL_SECONDS = 60 * 60 * 24 * 120;
const MAX_OVER_PAR_BUCKET = 6;

const keys = {
  results: (day: string) => `upslide:results:${day}`,
  board: (day: string) => `upslide:board:${day}`,
  user: (userId: string) => `upslide:user:${userId}`,
  completions: (userId: string) => `upslide:completions:${userId}`,
  started: (day: string) => `upslide:started:${day}`,
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
  await redis.expire(keys.results(day), DAY_TTL_SECONDS);
  return Boolean(created);
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
  await redis.expire(keys.board(day), DAY_TTL_SECONDS);
}

export async function getBoard(
  day: string,
  username: string | null,
  limit = 10
): Promise<DayBoard> {
  const [players, top, overPar] = await Promise.all([
    redis.zCard(keys.board(day)),
    redis.zRange(keys.board(day), 0, limit - 1, { by: 'rank' }),
    redis.zRange(keys.board(day), 0, -1, { by: 'rank' }),
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
  const par = getDailyChallenge(day).stages.reduce((sum, p) => sum + p.par, 0);
  for (const entry of overPar) {
    const bucket = String(
      Math.min(
        MAX_OVER_PAR_BUCKET,
        Math.max(0, fromBoardScore(entry.score).totalMoves - par)
      )
    );
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  return { dayKey: day, players, top: entries, me, overPar: histogram };
}

export async function getStats(userId: string): Promise<UserStats> {
  const h = await redis.hGetAll(keys.user(userId));
  const stats = emptyStats();
  stats.played = Number(h.played) || 0;
  stats.streak = Number(h.streak) || 0;
  stats.maxStreak = Number(h.maxStreak) || 0;
  stats.lastDay = h.lastDay || null;
  stats.perfectDays = Number(h.perfectDays) || 0;
  stats.totalStars = Number(h.totalStars) || 0;
  const completions = await redis.hGetAll(keys.completions(userId));
  return Object.values(completions).reduce((current, raw) => {
    const result: DailyResult = JSON.parse(raw);
    return applyCompletion(current, result);
  }, stats);
}

export async function recordCompletion(
  userId: string,
  result: DailyResult
): Promise<UserStats> {
  await redis.hSetNX(
    keys.completions(userId),
    result.dayKey,
    JSON.stringify(result)
  );
  return getStats(userId);
}

export async function startDay(day: string, userId: string): Promise<number> {
  await redis.hSetNX(keys.started(day), userId, String(Date.now()));
  await redis.expire(keys.started(day), DAY_TTL_SECONDS);
  return Number(await redis.hGet(keys.started(day), userId));
}

export async function verifiedTime(
  day: string,
  userId: string,
  claimed: number
): Promise<number> {
  const startedAt = await startDay(day, userId);
  // Wall time only bounds the claim; pauses, automated play, and client-reported active time remain unverified.
  return clampRunTime(claimed, startedAt, Date.now());
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
