import { useEffect, useState } from 'react';
import { msUntilNextDay } from '../../shared/puzzle';

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m ${(s % 60).toString().padStart(2, '0')}s`;
};

export const Countdown = () => {
  const [left, setLeft] = useState(() => msUntilNextDay(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilNextDay(Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="countdown">
      Next puzzle in <b>{fmt(left)}</b>
    </div>
  );
};
