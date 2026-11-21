import './index.css';

import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { showLoginPrompt } from '@devvit/web/client';
import type { DailyResult, DayBoard } from '../shared/api';
import {
  EPOCH_DAY,
  addDays,
  applyAction,
  dayNumber,
  formatDay,
  formatTime,
  getDailyChallenge,
  initialState,
  shareText,
  starRating,
} from '../shared/puzzle';
import type { Action, Dir, StageState } from '../shared/puzzle';
import { elapsedRun, pauseRun, shouldSaveResult } from '../shared/progress';
import { Board, STEP_MS } from './components/Board';
import { Countdown } from './components/Countdown';
import { Help } from './components/Help';
import { Logo } from './components/Logo';
import { Results } from './components/Results';
import { StatsGrid } from './components/StatsGrid';
import { isLoggedIn, loadSession, onReddit, submitRun } from './lib/api';
import type { Session } from './lib/api';
import { isMuted, setMuted, sfx } from './lib/sound';
import { applyLocalCompletion, storage } from './lib/storage';
import type { LocalResult } from './lib/storage';
import { useDayRollover } from './lib/useDayRollover';

type Screen = 'loading' | 'home' | 'play' | 'results' | 'archive';

type Run = {
  dayKey: string;
  ranked: boolean;
  stage: number;
  states: StageState[];
  baseMs: number;
  since: number | null;
};

type ResultView = {
  result: DailyResult;
  ranked: boolean;
  board: DayBoard | null;
};

const KEY_TO_ACTION: Record<string, Action> = {
  ArrowUp: 'U',
  ArrowDown: 'D',
  ArrowLeft: 'L',
  ArrowRight: 'R',
  w: 'U',
  s: 'D',
  a: 'L',
  d: 'R',
  z: 'Z',
  Backspace: 'Z',
  r: 'X',
};

function rebuild(dayKey: string, actions: string[]): StageState[] {
  const ch = getDailyChallenge(dayKey);
  return ch.stages.map((p, i) => {
    let s = initialState(p);
    for (const a of actions[i] ?? '') {
      const n = applyAction(p, s, a as Action);
      if (!n) return initialState(p);
      s = n;
    }
    return s;
  });
}

function runElapsed(r: Run): number {
  return elapsedRun(r, Date.now());
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [view, setView] = useState<ResultView | null>(null);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stageClear, setStageClear] = useState(false);
  const [bumpKey, setBumpKey] = useState(0);
  const run = useRef<Run | null>(null);
  const [shown, setShown] = useState<Run | null>(null);
  const actRef = useRef<(a: Action) => void>(() => undefined);
  const sync = () => setShown(run.current ? { ...run.current } : null);
  const busyUntil = useRef(0);
  const pending = useRef<Action | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const submitLocal = useCallback(async (local: LocalResult, s: Session) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitRun({
        dayKey: local.dayKey,
        actions: local.actions,
        timeMs: local.timeMs,
      });
      storage.setResult({ ...local, ...res.result, submitted: true });
      setSession((current) => {
        const active = current ?? s;
        return {
          ...active,
          stats: res.stats,
          today:
            res.result.dayKey === active.dayKey ? res.result : active.today,
          board: res.result.dayKey === active.dayKey ? res.board : active.board,
        };
      });
      setView({ result: res.result, ranked: true, board: res.board });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not save your score'
      );
    } finally {
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    void loadSession().then((s) => {
      setSession(s);
      setScreen('home');
      // A logged-out player who finished and then logged in: push their saved run now.
      const local = storage.getResult(s.dayKey);
      if (
        s.online &&
        isLoggedIn() &&
        local &&
        local.ranked !== false &&
        !local.submitted
      )
        void submitLocal(local, s);
      if (!storage.getSeenHelp()) setHelp(true);
    });
  }, [submitLocal]);

  const onRollover = useCallback(() => {
    if (screen !== 'play') setScreen('home');
  }, [screen]);
  useDayRollover(session, setSession, onRollover);

  const elapsed = () => (run.current ? runElapsed(run.current) : 0);

  const pauseTimer = () => {
    const r = run.current;
    if (r) pauseRun(r, Date.now());
  };

  const persist = () => {
    const r = run.current;
    if (!r) return;
    storage.setRun(r.dayKey, {
      actions: r.states.map((s) => s.actions),
      stage: r.stage,
      elapsedMs: elapsed(),
    });
  };

  const startRun = (dayKey: string, ranked: boolean) => {
    pauseTimer();
    persist();
    const saved = storage.getRun(dayKey);
    const states = rebuild(dayKey, saved?.actions ?? []);
    const stage = Math.min(saved?.stage ?? 0, states.length - 1);
    run.current = {
      dayKey,
      ranked,
      stage,
      states,
      baseMs: saved?.elapsedMs ?? 0,
      since: Date.now(),
    };
    setStageClear(Boolean(states[stage]?.solved));
    if (states[stage]?.solved) pauseTimer();
    setSubmitError(null);
    sync();
    setScreen('play');
  };

  const finishRun = useCallback(() => {
    const r = run.current;
    if (!r || !session) return;
    pauseTimer();
    const ch = getDailyChallenge(r.dayKey);
    const stages = ch.stages.map((p, i) => {
      const moves = r.states[i]!.moves;
      return { moves, par: p.par, stars: starRating(moves, p.par) };
    });
    const local: LocalResult = {
      ranked: r.ranked,
      dayKey: r.dayKey,
      number: ch.number,
      stages,
      totalMoves: stages.reduce((a, s) => a + s.moves, 0),
      totalPar: stages.reduce((a, s) => a + s.par, 0),
      timeMs: Math.max(1000, elapsed()),
      submittedAt: Date.now(),
      actions: r.states.map((s) => s.actions),
      submitted: false,
    };
    if (shouldSaveResult(r.ranked, storage.getResult(r.dayKey)))
      storage.setResult(local);
    storage.clearRun(r.dayKey);
    run.current = null;
    setView({
      result: local,
      ranked: r.ranked,
      board: r.ranked ? session.board : null,
    });
    setScreen('results');
    if (!r.ranked) return;
    if (session.online && isLoggedIn()) {
      void submitLocal(local, session);
    } else {
      const stats = applyLocalCompletion(storage.getStats(), local);
      storage.setStats(stats);
      setSession({
        ...session,
        stats,
        today: r.dayKey === session.dayKey ? local : session.today,
      });
    }
  }, [session, submitLocal]);

  const act = useCallback(
    (a: Action) => {
      const r = run.current;
      if (!r || stageClear) return;
      const now = Date.now();
      if (now < busyUntil.current) {
        pending.current = a;
        return;
      }
      const puzzle = getDailyChallenge(r.dayKey).stages[r.stage]!;
      const cur = r.states[r.stage]!;
      const next = applyAction(puzzle, cur, a);
      if (!next) {
        if (a !== 'Z' && a !== 'X') {
          sfx.bump();
          setBumpKey((k) => k + 1);
        }
        return;
      }
      if (!r.since) r.since = now;
      r.states = r.states.map((s, i) => (i === r.stage ? next : s));
      const slideMs = next.lastPath.length * STEP_MS;
      busyUntil.current = now + slideMs;
      if (a !== 'Z' && a !== 'X') {
        sfx.slide(next.lastPath.length);
        const newly = next.mask & ~cur.mask;
        puzzle.stars.forEach((c, si) => {
          if (newly & (1 << si))
            sfx.collect(((next.lastPath.indexOf(c) + 1) * STEP_MS) / 1000);
        });
      }
      persist();
      sync();
      if (next.solved) {
        pauseTimer();
        persist();
        setTimeout(() => {
          sfx.clear();
          setStageClear(true);
        }, slideMs + 180);
        return;
      }
      if (slideMs > 0) {
        setTimeout(() => {
          const q = pending.current;
          pending.current = null;
          if (q) actRef.current(q);
        }, slideMs + 5);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stageClear]
  );

  useEffect(() => {
    actRef.current = act;
  }, [act]);

  const nextStage = useCallback(() => {
    const r = run.current;
    if (!r) return;
    if (r.stage >= r.states.length - 1) {
      finishRun();
      return;
    }
    r.stage += 1;
    r.since = Date.now();
    busyUntil.current = 0;
    setStageClear(false);
    persist();
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishRun]);

  // Keyboard controls.
  useEffect(() => {
    if (screen !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (help) return;
      if (stageClear && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        nextStage();
        return;
      }
      const a = KEY_TO_ACTION[e.key] ?? KEY_TO_ACTION[e.key.toLowerCase()];
      if (a) {
        e.preventDefault();
        act(a);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, act, help, stageClear, nextStage]);

  // Timer tick + pause when the tab is hidden.
  useEffect(() => {
    if (screen !== 'play') return;
    const id = setInterval(() => {
      sync();
      persist();
    }, 500);
    const onHide = () => {
      pauseTimer();
      persist();
    };
    const onVis = () => {
      const r = run.current;
      if (!r) return;
      if (document.hidden) pauseTimer();
      else if (!r.states[r.stage]?.solved) r.since = Date.now();
      persist();
    };
    const onShow = () => {
      const r = run.current;
      if (
        r &&
        r.since === null &&
        !document.hidden &&
        !r.states[r.stage]?.solved
      ) {
        r.since = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const goHome = () => {
    pauseTimer();
    persist();
    setScreen('home');
  };

  // Swipe controls.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    const dir: Dir =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U';
    act(dir);
  };

  const closeHelp = () => {
    storage.setSeenHelp();
    setHelp(false);
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const share = async () => {
    if (!view) return;
    const text = shareText({
      number: view.result.number,
      stages: view.result.stages,
      timeMs: view.result.timeMs,
      streak: view.ranked ? (session?.stats.streak ?? 0) : 0,
    });
    say(
      (await copyText(text))
        ? 'Result copied — paste it in the comments!'
        : 'Could not copy result'
    );
  };

  if (!session || screen === 'loading') {
    return (
      <div className="app center-all">
        <Logo />
        <div className="spinner" />
      </div>
    );
  }

  const today = session.dayKey;
  const todayChallenge = getDailyChallenge(today);
  const todaySaved = storage.getRun(today);
  const doneToday = session.today ?? storage.getResult(today);
  const loginAction =
    onReddit() && !isLoggedIn() ? () => showLoginPrompt() : null;

  const topBar = (
    <div className="topbar">
      <button className="icon-btn" onClick={goHome} aria-label="Home">
        <Logo small />
      </button>
      <div className="topbar-right">
        <button
          className="icon-btn"
          onClick={() => setHelp(true)}
          aria-label="How to play"
        >
          ?
        </button>
        <button
          className="icon-btn"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {muted ? (
              <path d="M17 9l5 6M22 9l-5 6" />
            ) : (
              <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />
            )}
          </svg>
        </button>
      </div>
    </div>
  );

  let body = null;

  if (screen === 'home') {
    const preview = todayChallenge.stages[0]!;
    body = (
      <div className="screen home">
        <Logo />
        <div className="kicker">
          Daily #{todayChallenge.number} · {formatDay(today)}
        </div>
        <p className="tagline">
          Slide across the ice. Grab every upvote. Beat par.
        </p>
        <div className="preview">
          <Board puzzle={preview} state={initialState(preview)} mini />
        </div>
        {doneToday ? (
          <button
            className="btn btn-primary btn-big"
            onClick={() => {
              setView({
                result: doneToday,
                ranked: true,
                board: session.board,
              });
              setScreen('results');
            }}
          >
            ✓ Solved in {doneToday.totalMoves} — see results
          </button>
        ) : (
          <button
            className="btn btn-primary btn-big"
            onClick={() => startRun(today, true)}
          >
            {todaySaved
              ? `Continue · stage ${todaySaved.stage + 1}/3`
              : `Play today’s puzzle`}
          </button>
        )}
        <div className="row-gap">
          <button className="btn" onClick={() => setHelp(true)}>
            How to play
          </button>
          <button className="btn" onClick={() => setScreen('archive')}>
            Past puzzles
          </button>
        </div>
        <div className="card">
          <StatsGrid stats={session.stats} />
          {session.online && session.board.players > 0 && (
            <p className="muted small center">
              {session.board.players} player
              {session.board.players === 1 ? '' : 's'} solved today’s puzzle
            </p>
          )}
        </div>
        <Countdown offsetMs={session.offsetMs} />
      </div>
    );
  }

  if (screen === 'archive') {
    const days: string[] = [];
    for (
      let d = addDays(today, -1);
      d >= EPOCH_DAY && days.length < 30;
      d = addDays(d, -1)
    )
      days.push(d);
    body = (
      <div className="screen archive">
        <h2>Past puzzles</h2>
        <p className="muted small">
          Practice puzzles from the last 30 days. Archive runs don’t affect your
          streak or the leaderboard.
        </p>
        {days.length === 0 && (
          <div className="card center muted">
            No past puzzles yet — come back tomorrow!
          </div>
        )}
        <ul className="archive-list">
          {days.map((d) => {
            const r = storage.getResult(d);
            const inProgress = storage.getRun(d);
            return (
              <li key={d}>
                <button
                  className="archive-item"
                  onClick={() => startRun(d, false)}
                >
                  <span className="a-num">#{dayNumber(d)}</span>
                  <span className="a-date">{formatDay(d)}</span>
                  <span className="a-status">
                    {r
                      ? `✓ ${r.totalMoves}/${r.totalPar}`
                      : inProgress
                        ? `stage ${inProgress.stage + 1}/3`
                        : 'Play →'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          className="btn btn-ghost btn-block"
          onClick={() => setScreen('home')}
        >
          Back
        </button>
      </div>
    );
  }

  if (screen === 'play' && shown) {
    const r = shown;
    const ch = getDailyChallenge(r.dayKey);
    const puzzle = ch.stages[r.stage]!;
    const st = r.states[r.stage]!;
    const got = puzzle.stars.filter((_, i) => st.mask & (1 << i)).length;
    const stars = starRating(st.moves, puzzle.par);
    body = (
      <div className="screen play">
        {r.ranked && r.dayKey !== today && (
          <p className="muted small">
            A new daily puzzle is ready on Home. You can still finish this run.
          </p>
        )}
        <div className="play-head">
          <div className="stage-pips">
            {ch.stages.map((_, i) => (
              <span
                key={i}
                className={`pip${i < r.stage || r.states[i]!.solved ? ' done' : ''}${i === r.stage ? ' cur' : ''}`}
              >
                {i + 1}
              </span>
            ))}
            <span className="stage-label">
              {puzzle.name}
              {!r.ranked && <em> · #{ch.number} practice</em>}
            </span>
          </div>
          <div className="hud">
            <div>
              <b className={st.moves > puzzle.par ? 'over' : ''}>{st.moves}</b>
              <span>moves</span>
            </div>
            <div>
              <b>{puzzle.par}</b>
              <span>par</span>
            </div>
            <div>
              <b>
                {got}/{puzzle.stars.length}
              </b>
              <span>upvotes</span>
            </div>
            <div>
              <b>{formatTime(runElapsed(r))}</b>
              <span>time</span>
            </div>
          </div>
        </div>
        <div
          className="play-area"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <Board puzzle={puzzle} state={st} bumpKey={bumpKey} />
          {stageClear && (
            <div className="stage-clear">
              <div className="sc-card">
                <div className="sc-stars">
                  {[0, 1, 2].map((k) => (
                    <span
                      key={k}
                      className={k < stars ? 'on' : ''}
                      style={{ animationDelay: `${k * 0.15}s` }}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <h3>
                  {st.moves <= puzzle.par ? 'Par! Perfect.' : 'Stage clear!'}
                </h3>
                <p>
                  {st.moves} moves · par {puzzle.par}
                </p>
                <button
                  className="btn btn-primary btn-block"
                  onClick={nextStage}
                  autoFocus
                >
                  {r.stage >= r.states.length - 1
                    ? 'See results'
                    : `Next: ${ch.stages[r.stage + 1]!.name} →`}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="controls">
          <button
            className="btn ctl"
            onClick={() => act('Z')}
            disabled={!st.history.length || stageClear}
          >
            ↶ Undo
          </button>
          <div className="dpad">
            <button className="dp up" onClick={() => act('U')} aria-label="Up">
              ▲
            </button>
            <button
              className="dp left"
              onClick={() => act('L')}
              aria-label="Left"
            >
              ◀
            </button>
            <button
              className="dp right"
              onClick={() => act('R')}
              aria-label="Right"
            >
              ▶
            </button>
            <button
              className="dp down"
              onClick={() => act('D')}
              aria-label="Down"
            >
              ▼
            </button>
          </div>
          <button
            className="btn ctl"
            onClick={() => act('X')}
            disabled={stageClear || (st.pos === puzzle.start && st.mask === 0)}
          >
            ⟲ Restart
          </button>
        </div>
        <p className="hint muted small">
          Swipe the board or use arrow keys · undo still counts the move
        </p>
      </div>
    );
  }

  if (screen === 'results' && view) {
    const isToday = view.result.dayKey === today;
    body = (
      <Results
        offsetMs={session.offsetMs}
        result={view.result}
        board={
          view.ranked
            ? view.result.dayKey === today && session.today
              ? session.board
              : view.board
            : null
        }
        stats={view.ranked ? session.stats : null}
        ranked={view.ranked}
        isToday={isToday}
        online={session.online}
        loggedIn={isLoggedIn()}
        submitting={submitting}
        submitError={submitError}
        onShare={() => void share()}
        onLogin={loginAction}
        onArchive={() => setScreen('archive')}
        onHome={goHome}
      />
    );
  }

  return (
    <div className={`app app-${screen}`}>
      {topBar}
      <main>{body}</main>
      {help && <Help onClose={closeHelp} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
