import type { DailyResult, UserStats } from './api.ts';

type CompletionStore = {
  saveResult(
    day: string,
    userId: string,
    result: DailyResult
  ): Promise<boolean>;
  getResult(day: string, userId: string): Promise<DailyResult | null>;
  addToBoard(day: string, username: string, result: DailyResult): Promise<void>;
  recordCompletion(userId: string, result: DailyResult): Promise<UserStats>;
};

export async function ensureCompletion(
  store: CompletionStore,
  userId: string,
  username: string,
  candidate: DailyResult
): Promise<{
  result: DailyResult;
  stats: UserStats;
  alreadySubmitted: boolean;
}> {
  const created = await store.saveResult(candidate.dayKey, userId, candidate);
  const result = await store.getResult(candidate.dayKey, userId);
  if (!result) throw new Error('Saved result missing');
  await store.addToBoard(result.dayKey, username, result);
  const stats = await store.recordCompletion(userId, result);
  return { result, stats, alreadySubmitted: !created };
}
