import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { formatDay, getDailyChallenge, initialState } from '../shared/puzzle';
import { Board } from './components/Board';
import { Logo } from './components/Logo';
import { loadSession, offlineSession, onReddit } from './lib/api';
import type { Session } from './lib/api';
import { storage } from './lib/storage';

export const Splash = () => {
  const [session, setSession] = useState<Session>(offlineSession);
  useEffect(() => {
    void loadSession().then(setSession);
  }, []);

  const ch = getDailyChallenge(session.dayKey);
  const preview = ch.stages[0]!;
  const done = session.today ?? storage.getResult(session.dayKey);
  const inProgress = storage.getRun(session.dayKey);
  const open = (e: MouseEvent) => {
    if (onReddit()) requestExpandedMode(e.nativeEvent, 'game');
    else window.open('game.html', '_self');
  };

  return (
    <div className="splash">
      <div className="splash-text">
        <Logo />
        <div className="kicker">
          Daily #{ch.number} · {formatDay(session.dayKey)}
        </div>
        <p className="tagline">
          Slide across the ice. Grab every upvote. Beat par.
        </p>
        <div className="splash-meta">
          {session.stats.streak > 0 && (
            <span className="chip">🔥 {session.stats.streak}-day streak</span>
          )}
          {session.board.players > 0 && (
            <span className="chip">{session.board.players} solved today</span>
          )}
          <span className="chip">
            3 stages · par {ch.stages.reduce((a, s) => a + s.par, 0)}
          </span>
        </div>
        <button className="btn btn-primary btn-big" onClick={open}>
          {done
            ? `✓ ${done.totalMoves} moves — see results`
            : inProgress
              ? 'Continue playing'
              : 'Play'}
        </button>
      </div>
      <div className="splash-board" onClick={open}>
        <Board puzzle={preview} state={initialState(preview)} mini />
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
