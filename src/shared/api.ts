import type { StageScore } from './puzzle';

export type UserStats = {
  played: number;
  streak: number;
  maxStreak: number;
  lastDay: string | null;
  perfectDays: number;
  totalStars: number;
};

export type DailyResult = {
  dayKey: string;
  number: number;
  stages: StageScore[];
  totalMoves: number;
  totalPar: number;
  timeMs: number;
  submittedAt: number;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  totalMoves: number;
  timeMs: number;
};

export type DayBoard = {
  dayKey: string;
  players: number;
  top: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  /** Players bucketed by moves over par: key "0" = at par, "1" = one over, ..., "6" = six or more over. */
  overPar: Record<string, number>;
};

export type InitResponse = {
  type: 'init';
  dayKey: string;
  serverNow: number;
  username: string | null;
  stats: UserStats;
  today: DailyResult | null;
  board: DayBoard;
};

export type SubmitRequest = {
  dayKey: string;
  actions: string[];
  timeMs: number;
};

export type SubmitResponse = {
  type: 'submit';
  result: DailyResult;
  stats: UserStats;
  board: DayBoard;
  alreadySubmitted: boolean;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

export const emptyStats = (): UserStats => ({
  played: 0,
  streak: 0,
  maxStreak: 0,
  lastDay: null,
  perfectDays: 0,
  totalStars: 0,
});
