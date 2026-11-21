import type { DailyResult, DayBoard, UserStats } from '../../shared/api';
import { formatTime } from '../../shared/puzzle';
import { Countdown } from './Countdown';
import { StatsGrid } from './StatsGrid';

type Props = {
  offsetMs: number;
  result: DailyResult;
  board: DayBoard | null;
  stats: UserStats | null;
  ranked: boolean;
  isToday: boolean;
  online: boolean;
  loggedIn: boolean;
  submitting: boolean;
  submitError: string | null;
  onShare: () => void;
  onLogin: (() => void) | null;
  onArchive: () => void;
  onHome: () => void;
};

const BUCKETS = ['Par', '+1', '+2', '+3', '+4', '+5', '+6'];

export const Results = (p: Props) => {
  const { result, board } = p;
  const over = Math.max(0, result.totalMoves - result.totalPar);
  const myBucket = Math.min(6, over);
  const stars = result.stages.reduce((a, s) => a + s.stars, 0);
  const perfect = result.totalMoves <= result.totalPar;
  const hist = BUCKETS.map((_, i) => board?.overPar[String(i)] ?? 0);
  const maxHist = Math.max(1, ...hist);
  const me = board?.me ?? null;
  const beat =
    me && board && board.players > 1
      ? Math.round(((board.players - me.rank) / (board.players - 1)) * 100)
      : null;

  return (
    <div className="screen results">
      {perfect && <Confetti />}
      <div className="results-head">
        <div className="kicker">
          Upslide #{result.number}
          {p.ranked ? '' : ' · practice'}
        </div>
        <h1>
          {perfect
            ? 'Perfect run!'
            : stars >= 7
              ? 'Smooth sliding!'
              : 'Puzzle solved!'}
        </h1>
        <div className="big-score">
          <span className="num">{result.totalMoves}</span>
          <span className="lbl">
            moves
            <br />
            par {result.totalPar}
          </span>
          <span className="divider" />
          <span className="num">{formatTime(result.timeMs)}</span>
          <span className="lbl">time</span>
        </div>
        <div className="stage-rows">
          {result.stages.map((s, i) => (
            <div key={i} className="stage-row">
              <span className="stage-name">Stage {i + 1}</span>
              <span className="stars">
                {[0, 1, 2].map((k) => (
                  <span key={k} className={k < s.stars ? 'on' : ''}>
                    ★
                  </span>
                ))}
              </span>
              <span className="stage-moves">
                {s.moves}/{s.par}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="actions-row">
        <button className="btn btn-primary" onClick={p.onShare}>
          Share result
        </button>
        <button className="btn" onClick={p.onArchive}>
          Past puzzles
        </button>
      </div>

      {p.submitting && (
        <div className="card muted center">Saving your score…</div>
      )}
      {p.submitError && (
        <div className="card error center">{p.submitError}</div>
      )}

      {p.ranked && p.online && board && board.players > 0 && (
        <div className="card">
          <div className="card-title">
            Today on Reddit{' '}
            <span className="muted">
              · {board.players} player{board.players === 1 ? '' : 's'}
            </span>
          </div>
          {me && (
            <div className="rank-line">
              You’re <b>#{me.rank}</b>
              {beat !== null && (
                <>
                  {' '}
                  — better than <b>{beat}%</b> of players
                </>
              )}
            </div>
          )}
          <div className="hist">
            {hist.map((v, i) => (
              <div
                key={i}
                className={`hist-col${i === myBucket && me ? ' mine' : ''}`}
              >
                <div
                  className="hist-bar"
                  style={{ height: `${(v / maxHist) * 100}%` }}
                >
                  {v > 0 && <span>{v}</span>}
                </div>
                <div className="hist-lbl">{BUCKETS[i]}</div>
              </div>
            ))}
          </div>
          <ol className="leaderboard">
            {board.top.map((e) => (
              <li
                key={e.username}
                className={me?.username === e.username ? 'mine' : ''}
              >
                <span className="lb-rank">{e.rank}</span>
                <span className="lb-name">u/{e.username}</span>
                <span className="lb-score">
                  {e.totalMoves} <small>moves</small> · {formatTime(e.timeMs)}
                </span>
              </li>
            ))}
            {me && !board.top.some((e) => e.username === me.username) && (
              <li className="mine">
                <span className="lb-rank">{me.rank}</span>
                <span className="lb-name">u/{me.username}</span>
                <span className="lb-score">
                  {me.totalMoves} <small>moves</small> · {formatTime(me.timeMs)}
                </span>
              </li>
            )}
          </ol>
        </div>
      )}

      {p.ranked && p.onLogin && (
        <div className="card center">
          <p>Log in to save your streak and join the daily leaderboard.</p>
          <button className="btn btn-primary" onClick={p.onLogin}>
            Log in to Reddit
          </button>
        </div>
      )}
      {p.ranked && !p.online && (
        <p className="muted small center">
          Playing offline — leaderboards appear when you play inside Reddit.
        </p>
      )}

      {p.stats && (
        <div className="card">
          <div className="card-title">Your stats</div>
          <StatsGrid stats={p.stats} />
        </div>
      )}

      {p.isToday && <Countdown offsetMs={p.offsetMs} />}

      <button className="btn btn-ghost btn-block" onClick={p.onHome}>
        Back to start
      </button>
    </div>
  );
};

const Confetti = () => (
  <div className="confetti" aria-hidden="true">
    {Array.from({ length: 36 }, (_, i) => (
      <i
        key={i}
        style={{
          left: `${(i * 37) % 100}%`,
          animationDelay: `${(i % 9) * 0.12}s`,
          background: ['#ff4500', '#ffb000', '#5bd1ff', '#7ee081', '#ffffff'][
            i % 5
          ],
        }}
      />
    ))}
  </div>
);
