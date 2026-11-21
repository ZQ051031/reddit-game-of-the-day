import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import {
  addDays,
  dayKeyFromDate,
  getDailyChallenge,
  isDayKey,
  replayStage,
  starRating,
} from '../../shared/puzzle';
import type { StageScore } from '../../shared/puzzle';
import type {
  DailyResult,
  ErrorResponse,
  InitResponse,
  SubmitRequest,
  SubmitResponse,
} from '../../shared/api';
import { emptyStats } from '../../shared/api';
import {
  addToBoard,
  getBoard,
  getResult,
  getStats,
  liveStreak,
  recordCompletion,
  saveResult,
} from '../core/store';

export const api = new Hono();

const today = () => dayKeyFromDate(new Date());

api.get('/init', async (c) => {
  const day = today();
  const { userId } = context;
  try {
    const username = userId
      ? ((await reddit.getCurrentUsername()) ?? null)
      : null;
    const [stats, todayResult, board] = await Promise.all([
      userId ? getStats(userId) : Promise.resolve(emptyStats()),
      userId ? getResult(day, userId) : Promise.resolve(null),
      getBoard(day, username),
    ]);
    return c.json<InitResponse>({
      type: 'init',
      dayKey: day,
      serverNow: Date.now(),
      username,
      stats: liveStreak(stats, day),
      today: todayResult,
      board,
    });
  } catch (error) {
    console.error('init failed', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to load today’s puzzle' },
      500
    );
  }
});

api.get('/board', async (c) => {
  const day = c.req.query('day') ?? today();
  if (!isDayKey(day))
    return c.json<ErrorResponse>({ status: 'error', message: 'bad day' }, 400);
  const username = context.userId
    ? ((await reddit.getCurrentUsername()) ?? null)
    : null;
  return c.json(await getBoard(day, username, 25));
});

api.post('/submit', async (c) => {
  const { userId } = context;
  if (!userId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Log in to save your score' },
      401
    );
  }
  let body: SubmitRequest;
  try {
    body = await c.req.json<SubmitRequest>();
  } catch {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Invalid JSON' },
      400
    );
  }
  const day = today();
  // Accept yesterday too, so a run that started before midnight UTC still counts.
  if (
    !isDayKey(body.dayKey) ||
    (body.dayKey !== day && body.dayKey !== addDays(day, -1))
  ) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'That puzzle is no longer active' },
      400
    );
  }
  const challenge = getDailyChallenge(body.dayKey);
  if (
    !Array.isArray(body.actions) ||
    body.actions.length !== challenge.stages.length
  ) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Incomplete run' },
      400
    );
  }

  const stages: StageScore[] = [];
  for (const [i, puzzle] of challenge.stages.entries()) {
    const actions = body.actions[i];
    const replay =
      typeof actions === 'string' ? replayStage(puzzle, actions) : null;
    if (!replay || !replay.ok) {
      return c.json<ErrorResponse>(
        { status: 'error', message: `Stage ${i + 1} did not verify` },
        400
      );
    }
    stages.push({
      moves: replay.moves,
      par: puzzle.par,
      stars: starRating(replay.moves, puzzle.par),
    });
  }

  const username = (await reddit.getCurrentUsername()) ?? userId;
  const existing = await getResult(body.dayKey, userId);
  if (existing) {
    return c.json<SubmitResponse>({
      type: 'submit',
      result: existing,
      stats: liveStreak(await getStats(userId), day),
      board: await getBoard(body.dayKey, username),
      alreadySubmitted: true,
    });
  }

  const result: DailyResult = {
    dayKey: body.dayKey,
    number: challenge.number,
    stages,
    totalMoves: stages.reduce((a, s) => a + s.moves, 0),
    totalPar: stages.reduce((a, s) => a + s.par, 0),
    timeMs: Math.max(
      1000,
      Math.min(Number(body.timeMs) || 0, 24 * 3600 * 1000)
    ),
    submittedAt: Date.now(),
  };
  const created = await saveResult(body.dayKey, userId, result);
  if (created) await addToBoard(body.dayKey, username, result);
  const stats = created
    ? await recordCompletion(userId, result)
    : await getStats(userId);
  return c.json<SubmitResponse>({
    type: 'submit',
    result: created
      ? result
      : ((await getResult(body.dayKey, userId)) ?? result),
    stats: liveStreak(stats, day),
    board: await getBoard(body.dayKey, username),
    alreadySubmitted: !created,
  });
});
