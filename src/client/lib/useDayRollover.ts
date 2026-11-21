import { useEffect } from 'react';
import { clockDay } from '../../shared/progress';
import { loadSession } from './api';
import type { Session } from './api';

export function useDayRollover(
  session: Session | null,
  setSession: (next: Session) => void,
  onRollover?: () => void
): void {
  useEffect(() => {
    if (!session) return;
    let refreshing = false;
    let cancelled = false;
    let retryAfter = 0;
    const checkDay = () => {
      if (
        refreshing ||
        Date.now() < retryAfter ||
        clockDay(Date.now(), session.offsetMs) === session.dayKey
      )
        return;
      refreshing = true;
      retryAfter = Date.now() + 10000;
      void loadSession()
        .then((next) => {
          if (cancelled || (!next.online && session.online)) return;
          setSession(next);
          onRollover?.();
        })
        .finally(() => {
          refreshing = false;
        });
    };
    const id = setInterval(checkDay, 1000);
    window.addEventListener('focus', checkDay);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', checkDay);
    };
  }, [session, setSession, onRollover]);
}
