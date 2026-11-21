import { context } from '@devvit/web/client';
import type {
  ErrorResponse,
  InitResponse,
  SubmitRequest,
  SubmitResponse,
} from '../../shared/api';
import { dayKeyFromDate } from '../../shared/puzzle';
import { liveLocalStreak, storage } from './storage';
import { mergeGuestSession } from '../../shared/progress';

/** True when running inside a Reddit post (Devvit injects the context). */
export const onReddit = (): boolean => Boolean(context);
export const isLoggedIn = (): boolean => Boolean(context?.userId);

export type Session = InitResponse & { online: boolean; offsetMs: number };

export function offlineSession(): Session {
  const dayKey = dayKeyFromDate(new Date());
  const local = storage.getResult(dayKey);
  return {
    type: 'init',
    online: false,
    offsetMs: 0,
    dayKey,
    serverNow: Date.now(),
    username: null,
    stats: liveLocalStreak(storage.getStats(), dayKey),
    today: local,
    board: { dayKey, players: 0, top: [], me: null, overPar: {} },
  };
}

export async function loadSession(): Promise<Session> {
  if (!onReddit()) return offlineSession();
  try {
    const res = await fetch('/api/init');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: InitResponse = await res.json();
    if (data.type !== 'init') throw new Error('Unexpected response');
    return {
      ...mergeGuestSession(
        data,
        isLoggedIn(),
        storage.getStats(),
        storage.getResult(data.dayKey)
      ),
      online: true,
      offsetMs: data.serverNow - Date.now(),
    };
  } catch (err) {
    console.error('Falling back to offline mode', err);
    return offlineSession();
  }
}

export async function submitRun(req: SubmitRequest): Promise<SubmitResponse> {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data: SubmitResponse | ErrorResponse = await res.json();
  if (!res.ok || !('type' in data)) {
    throw new Error('message' in data ? data.message : `HTTP ${res.status}`);
  }
  return data;
}
