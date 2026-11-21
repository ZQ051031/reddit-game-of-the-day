import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES,
  addDays,
  applyAction,
  dayNumber,
  getDailyChallenge,
  initialState,
  replayStage,
  solve,
  starRating,
} from './puzzle.ts';

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
