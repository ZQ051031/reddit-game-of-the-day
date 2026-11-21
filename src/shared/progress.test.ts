import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats } from './api.ts';
import type { DailyResult, InitResponse } from './api.ts';
import {
  applyCompletion,
  clampRunTime,
  clockDay,
  elapsedRun,
  isSubmitBody,
  liveStreak,
  mergeGuestSession,
  pauseRun,
  shouldSaveResult,
} from './progress.ts';
import { ensureCompletion } from './completion.ts';
import { isDayKey, msUntilNextDay } from './puzzle.ts';

function result(dayKey = '2026-12-03'): DailyResult {
  return {
    dayKey,
    number: 14,
    stages: [{ moves: 5, par: 5, stars: 3 }],
    totalMoves: 5,
    totalPar: 5,
    timeMs: 5000,
    submittedAt: 0,
  };
}

void test('completion days connect out of order, deduplicate, and retain best streak', () => {
  let stats = applyCompletion(emptyStats(), result('2026-12-01'));
  stats = applyCompletion(stats, result('2026-12-03'));
  assert.equal(stats.streak, 1);
  stats = applyCompletion(stats, result('2026-12-02'));
  assert.equal(stats.streak, 3);
  assert.equal(stats.maxStreak, 3);
  assert.equal(stats.lastDay, '2026-12-03');
  assert.equal(stats.played, 3);
  assert.equal(stats.totalStars, 9);
  assert.deepEqual(applyCompletion(stats, result()), stats);
  assert.equal(liveStreak(stats, '2026-12-05').streak, 0);
  assert.equal(liveStreak(stats, '2026-12-04').streak, 3);
  assert.deepEqual(liveStreak(emptyStats(), '2026-12-04'), emptyStats());
  stats = applyCompletion(
    liveStreak(stats, '2026-12-05'),
    result('2026-12-04')
  );
  assert.equal(stats.streak, 4);
  assert.equal(stats.perfectDays, 4);
});

void test('legacy stats retain their known streak and totals', () => {
  const stats = {
    ...emptyStats(),
    lastDay: '2026-12-03',
    streak: 2,
    maxStreak: 4,
    played: 8,
  };
  assert.equal(applyCompletion(stats, result('2026-12-04')).streak, 3);
  assert.equal(applyCompletion(stats, result('2026-12-04')).played, 9);
  assert.deepEqual(applyCompletion(stats, result('2026-12-02')), stats);
});

void test('online guest sessions merge local progress without replacing authenticated stats', () => {
  const session: InitResponse = {
    type: 'init',
    dayKey: '2026-12-03',
    serverNow: 0,
    username: null,
    stats: emptyStats(),
    today: null,
    board: { dayKey: '2026-12-03', players: 0, top: [], me: null, overPar: {} },
  };
  const local = result();
  const stats = applyCompletion(emptyStats(), local);
  const merged = mergeGuestSession(session, false, stats, local);
  assert.deepEqual(merged.stats, stats);
  assert.equal(merged.today, local);
  assert.deepEqual(
    mergeGuestSession(session, false, emptyStats(), null),
    session
  );
  assert.equal(mergeGuestSession(session, true, stats, local), session);
});

void test('server offset controls rollover and countdown despite skewed client clock', () => {
  const now = Date.parse('2026-12-03T10:00:00Z');
  const offset = Date.parse('2026-12-03T23:59:59Z') - now;
  assert.equal(clockDay(now, offset), '2026-12-03');
  assert.equal(msUntilNextDay(now + offset), 1000);
  assert.equal(clockDay(now + 2000, offset), '2026-12-04');
  assert.equal(clockDay(now, 0), '2026-12-03');
});

void test('submission shape rejects null, arrays, primitives, missing fields and invalid times', () => {
  for (const value of [
    null,
    [],
    1,
    'body',
    {},
    { dayKey: 'x', actions: [], timeMs: NaN },
    { dayKey: 'x', actions: [null], timeMs: 10 },
  ])
    assert.equal(isSubmitBody(value), false);
  assert.equal(
    isSubmitBody({
      dayKey: '2026-12-03',
      actions: ['UD', 'L', 'RR'],
      timeMs: 1000,
    }),
    true
  );
});

void test('calendar keys reject normalized nonexistent dates and accept leap days', () => {
  for (const value of [
    '2026-02-31',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '',
    null,
  ])
    assert.equal(isDayKey(value), false);
  assert.equal(isDayKey('2028-02-29'), true);
  assert.equal(isDayKey('2026-12-03'), true);
});

void test('server timing clamps to minimum, server elapsed, and daily cap', () => {
  assert.equal(clampRunTime(0, 1000, 1000), 1000);
  assert.equal(clampRunTime(-5, 1000, 5000), 1000);
  assert.equal(clampRunTime(10000, 1000, 5000), 4000);
  assert.equal(clampRunTime(2000, 1000, 5000), 2000);
  assert.equal(clampRunTime(100000000, 0, 100000000), 86400000);
});

void test('practice cannot replace an existing daily result', () => {
  assert.equal(shouldSaveResult(false, result()), false);
  assert.equal(shouldSaveResult(false, null), true);
  assert.equal(shouldSaveResult(false, { ...result(), ranked: false }), true);
  assert.equal(shouldSaveResult(false, { ...result(), ranked: true }), false);
  assert.equal(shouldSaveResult(true, result()), true);
});

void test('pausing and periodic snapshots retain elapsed time without counting time away', () => {
  const run: { baseMs: number; since: number | null } = { baseMs: 0, since: 0 };
  assert.equal(elapsedRun(run, 500), 500);
  const persisted = { elapsedMs: elapsedRun(run, 1200) };
  assert.equal(persisted.elapsedMs, 1200);
  pauseRun(run, 1500);
  assert.equal(elapsedRun(run, 9000), 1500);
  pauseRun(run, 10000);
  assert.equal(run.baseMs, 1500);
  run.since = 10000;
  assert.equal(elapsedRun(run, 11000), 2500);
});

void test('submission retries repair failures after result, leaderboard, or stats without double counting', async () => {
  for (const failAt of ['result', 'board', 'stats', null]) {
    let saved: DailyResult | null = null;
    let failed = false;
    const board = new Map<string, DailyResult>();
    const completed = new Map<string, DailyResult>();
    const fail = (at: string) => {
      if (at === failAt && !failed) {
        failed = true;
        throw new Error(at);
      }
    };
    const store = {
      saveResult: async (_day: string, _user: string, r: DailyResult) => {
        const created = saved === null;
        saved ??= r;
        fail('result');
        return created;
      },
      getResult: async () => saved,
      addToBoard: async (_day: string, user: string, r: DailyResult) => {
        board.set(user, r);
        fail('board');
      },
      recordCompletion: async (_user: string, r: DailyResult) => {
        if (!completed.has(r.dayKey)) completed.set(r.dayKey, r);
        fail('stats');
        return [...completed.values()].reduce(applyCompletion, emptyStats());
      },
    };
    if (failAt)
      await assert.rejects(
        ensureCompletion(store, 'id', 'name', result()),
        new RegExp(failAt)
      );
    const first = await ensureCompletion(store, 'id', 'name', result());
    const retry = await ensureCompletion(store, 'id', 'name', {
      ...result(),
      timeMs: 1000,
    });
    assert.equal(first.alreadySubmitted, failAt !== null);
    assert.equal(retry.alreadySubmitted, true);
    assert.equal(retry.result.timeMs, 5000);
    assert.equal(retry.stats.played, 1);
    assert.equal(retry.stats.totalStars, 3);
    assert.equal(board.size, 1);
  }
});

void test('missing saved results fail rather than fabricating a successful submission', async () => {
  await assert.rejects(
    ensureCompletion(
      {
        saveResult: async () => false,
        getResult: async () => null,
        addToBoard: async () => undefined,
        recordCompletion: async () => emptyStats(),
      },
      'id',
      'name',
      result()
    ),
    /Saved result missing/
  );
});
