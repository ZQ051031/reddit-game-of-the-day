import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES,
  addDays,
  applyAction,
  dayNumber,
  getDailyChallenge,
  generateStage,
  dayKeyFromDate,
  initialState,
  replayStage,
  solve,
  starRating,
} from './puzzle.ts';
import type { Puzzle } from './puzzle.ts';

void test('daily challenge is deterministic per day and differs across days', () => {
  const a = getDailyChallenge('2026-12-01');
  const b = getDailyChallenge('2026-12-01');
  const c = getDailyChallenge('2026-12-02');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.stages, c.stages);
  assert.equal(a.number + 1, c.number);
});

void test('every stage over a year of days is solvable at its par', () => {
  let day = '2026-11-20';
  for (let i = 0; i < 365; i++) {
    const ch = getDailyChallenge(day);
    ch.stages.forEach((p, idx) => {
      assert.equal(p.stars.length, STAGES[idx]!.stars);
      assert.ok(!p.stars.includes(p.start));
      const sol = solve(p);
      assert.ok(sol, `${day} stage ${idx} unsolvable`);
      assert.equal(sol.length, p.par);
      const r = replayStage(p, p.solution.join(''));
      assert.deepEqual(r, { ok: true, moves: p.par });
    });
    day = addDays(day, 1);
  }
});

void test('replay counts undone moves and rejects invalid logs', () => {
  const p = getDailyChallenge('2026-12-05').stages[0]!;
  const sol = p.solution.join('');
  let s = initialState(p);
  const first = p.solution[0]!;
  s = applyAction(p, s, first)!;
  s = applyAction(p, s, 'Z')!;
  assert.equal(s.pos, p.start);
  assert.equal(s.moves, 1);
  assert.deepEqual(replayStage(p, `${first}Z${sol}`), {
    ok: true,
    moves: p.par + 1,
  });
  assert.deepEqual(replayStage(p, `${first}X${sol}`), {
    ok: true,
    moves: p.par + 1,
  });
  assert.equal(replayStage(p, sol.slice(0, -1)).ok, false);
  assert.equal(replayStage(p, `Z${sol}`).ok, false);
  assert.equal(replayStage(p, `${sol}U`).ok, false);
  assert.equal(replayStage(p, 'Q').ok, false);
});

void test('helpers', () => {
  assert.equal(dayNumber('2026-11-20'), 1);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(starRating(5, 5), 3);
  assert.equal(starRating(7, 5), 2);
  assert.equal(starRating(8, 5), 1);
});

function canFinishWithin(p: Puzzle, depth: number): boolean {
  const full = (1 << p.stars.length) - 1;
  const explored = new Map<number, number>();
  const search = (
    position: number,
    mask: number,
    remaining: number
  ): boolean => {
    if (mask === full) return true;
    if (remaining === 0) return false;
    const key = position * (full + 1) + mask;
    if ((explored.get(key) ?? -1) >= remaining) return false;
    explored.set(key, remaining);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      let x = position % p.width;
      let y = Math.floor(position / p.width);
      let collected = mask;
      for (;;) {
        const nx = x + dx!;
        const ny = y + dy!;
        if (nx < 0 || nx >= p.width || ny < 0 || ny >= p.height) break;
        const tile = ny * p.width + nx;
        if (p.tiles[tile] === 1) break;
        x = nx;
        y = ny;
        const star = p.stars.indexOf(tile);
        if (star !== -1) collected |= 1 << star;
        if (p.tiles[tile] === 2) break;
      }
      const next = y * p.width + x;
      if (next !== position && search(next, collected, remaining - 1))
        return true;
    }
    return false;
  };
  return search(p.start, 0, depth);
}

void test('independent iterative-deepening slide search proves exact par for 60 days and every stage', () => {
  for (let i = 0; i < 60; i++) {
    const day = addDays('2026-11-20', i);
    for (const puzzle of getDailyChallenge(day).stages) {
      for (let depth = 0; depth < puzzle.par; depth++) {
        assert.equal(
          canFinishWithin(puzzle, depth),
          false,
          `${day} stage ${puzzle.stage} depth ${depth} below par`
        );
      }
      assert.equal(
        canFinishWithin(puzzle, puzzle.par),
        true,
        `${day} stage ${puzzle.stage} at par`
      );
    }
  }
});

void test('fresh generation and cache eviction preserve UTC-day-only puzzle identity', () => {
  const before = dayKeyFromDate(new Date('2026-12-01T23:59:00Z'));
  const after = dayKeyFromDate(new Date('2026-12-02T00:01:00Z'));
  assert.equal(before, '2026-12-01');
  assert.equal(after, '2026-12-02');
  assert.equal(dayKeyFromDate(new Date('2026-12-02T01:59:00+02:00')), before);
  const original = getDailyChallenge(before);
  const fresh = STAGES.map((_, stage) => generateStage(before, stage));
  assert.deepEqual(fresh, original.stages);
  for (let i = 0; i < 66; i++) getDailyChallenge(addDays('2027-01-01', i));
  const regenerated = getDailyChallenge(before);
  assert.notEqual(regenerated, original);
  assert.deepEqual(regenerated, original);
  assert.notDeepEqual(getDailyChallenge(after).stages, regenerated.stages);
});
