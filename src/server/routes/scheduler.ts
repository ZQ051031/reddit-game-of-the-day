import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import { ensureDailyPost } from '../core/post';

export const scheduler = new Hono();

scheduler.post('/daily-post', async (c) => {
  try {
    const post = await ensureDailyPost();
    console.log(
      `daily-post: ${post.created ? 'created' : 'already had'} ${post.id}`
    );
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error('daily-post failed', error);
    return c.json<TaskResponse>({ status: 'error' }, 500);
  }
});
