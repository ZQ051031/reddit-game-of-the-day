import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

void test('local harness executes real routes: guest, validation, retry, leaderboard and out-of-order streak', async (t) => {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', 'tools/local-server.mjs'],
    {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PORT: '4174' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  t.after(() => {
    child.kill();
  });
  let errors = '';
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(([code]) => {
      throw new Error(`Harness exited ${code}: ${errors}`);
    }),
  ]);
  const base = 'http://127.0.0.1:4174';
  const request = (path, user = 'alice', body) =>
    fetch(base + path, {
      headers: {
        cookie: `localUser=${user}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined
        ? {}
        : { method: 'POST', body: JSON.stringify(body) }),
    });
  await request('/__local/control', 'alice', { now: '2026-12-04T12:00:00Z' });
  const guest = await (await request('/api/init', 'guest')).json();
  assert.equal(guest.username, null);
  assert.equal(guest.stats.played, 0);
  assert.equal((await request('/api/submit', 'guest', {})).status, 401);
  assert.equal((await request('/api/submit', 'alice', null)).status, 400);
  assert.equal((await request('/api/board?day=2026-02-31')).status, 400);
  const submit = async (day) => {
    const ch = await (await request(`/__local/challenge?day=${day}`)).json();
    const res = await request('/api/submit', 'alice', {
      dayKey: day,
      actions: ch.stages.map((p) => p.solution.join('')),
      timeMs: 5000,
    });
    assert.equal(res.status, 200);
    return res.json();
  };
  await request('/api/init');
  const first = await submit('2026-12-04');
  assert.equal(first.stats.played, 1);
  assert.equal(first.board.players, 1);
  assert.equal(first.alreadySubmitted, false);
  const retry = await submit('2026-12-04');
  assert.equal(retry.stats.played, 1);
  assert.equal(retry.board.players, 1);
  assert.deepEqual(retry.board.overPar, { 0: 1 });
  assert.deepEqual(retry.result, first.result);
  assert.equal(retry.alreadySubmitted, true);
  const yesterday = await submit('2026-12-03');
  assert.equal(yesterday.stats.streak, 2);
  assert.equal(yesterday.stats.played, 2);
  await request('/__local/control', 'alice', { offline: true });
  assert.equal((await request('/api/init')).status, 503);
});
