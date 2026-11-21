import { reddit } from '@devvit/web/server';
import { dayKeyFromDate, dayNumber, formatDay } from '../../shared/puzzle';
import { getDailyPostId, setDailyPostId } from './store';

export const createDailyPost = async (dayKey = dayKeyFromDate(new Date())) => {
  const number = dayNumber(dayKey);
  const post = await reddit.submitCustomPost({
    title: `Upslide #${number} · ${formatDay(dayKey)} — slide the puck, grab every upvote`,
    textFallback: {
      text: `Upslide #${number}: today's daily ice-sliding puzzle. Open this post on the Reddit app or new Reddit to play.`,
    },
  });
  await setDailyPostId(dayKey, post.id);
  return post;
};

/** Creates today's post unless one was already created for this subreddit today. */
export const ensureDailyPost = async (dayKey = dayKeyFromDate(new Date())) => {
  const existing = await getDailyPostId(dayKey);
  if (existing) return { id: existing, created: false };
  const post = await createDailyPost(dayKey);
  return { id: post.id, created: true };
};
