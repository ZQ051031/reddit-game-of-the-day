import type { CSSProperties } from 'react';
import { MOSS, ROCK } from '../../shared/puzzle';
import type { Puzzle, StageState } from '../../shared/puzzle';

export const STEP_MS = 55;

type Props = {
  puzzle: Puzzle;
  state: StageState;
  bumpKey?: number;
  mini?: boolean;
};

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

export const Board = ({ puzzle, state, bumpKey = 0, mini = false }: Props) => {
  const { width: w, height: h } = puzzle;
  const px = state.pos % w;
  const py = Math.floor(state.pos / w);
  const cellStyle = (i: number): CSSProperties => ({
    left: pct(i % w, w),
    top: pct(Math.floor(i / w), h),
    width: pct(1, w),
    height: pct(1, h),
  });
  const slideMs = state.lastPath.length * STEP_MS;

  return (
    <div
      className={`board${mini ? ' board-mini' : ''}`}
      style={{ aspectRatio: `${w} / ${h}` }}
      role="img"
      aria-label={`Stage board ${w} by ${h}`}
    >
      {puzzle.tiles.map((t, i) => (
        <div key={`t${i}`} className="cell" style={cellStyle(i)}>
          <div className={t === ROCK ? 'rock' : t === MOSS ? 'moss' : 'ice'} />
        </div>
      ))}
      {state.lastPath.map((c, j) => (
        <div
          key={`trail-${state.actions.length}-${c}`}
          className="cell trail"
          style={{ ...cellStyle(c), animationDelay: `${j * STEP_MS}ms` }}
        />
      ))}
      {puzzle.stars.map((c, si) => {
        const got = (state.mask & (1 << si)) !== 0;
        const j = state.lastPath.indexOf(c);
        return (
          <div
            key={`s${si}`}
            className={`cell token${got ? ' got' : ''}`}
            style={{
              ...cellStyle(c),
              animationDelay: got && j >= 0 ? `${(j + 1) * STEP_MS}ms` : '0ms',
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 3 13h5.5v8h7v-8H21z" />
            </svg>
          </div>
        );
      })}
      <div
        className="cell puck-wrap"
        style={{
          left: pct(px, w),
          top: pct(py, h),
          width: pct(1, w),
          height: pct(1, h),
          transitionDuration: `${slideMs}ms`,
        }}
      >
        <div
          key={bumpKey}
          className={`puck${bumpKey ? ' bump' : ''}${state.solved ? ' happy' : ''}`}
        >
          <span className="eye l" />
          <span className="eye r" />
          <span className="mouth" />
        </div>
      </div>
    </div>
  );
};
