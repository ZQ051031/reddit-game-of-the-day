import type { UserStats } from '../../shared/api';

export const StatsGrid = ({ stats }: { stats: UserStats }) => (
  <div className="stats-grid">
    <div>
      <b>{stats.played}</b>
      <span>Played</span>
    </div>
    <div>
      <b>
        {stats.streak}
        {stats.streak > 0 ? '🔥' : ''}
      </b>
      <span>Streak</span>
    </div>
    <div>
      <b>{stats.maxStreak}</b>
      <span>Best streak</span>
    </div>
    <div>
      <b>{stats.perfectDays}</b>
      <span>Perfect days</span>
    </div>
  </div>
);
