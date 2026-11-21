# Local browser playtest

Use Node 24+, run `npm ci && npm run build`, then `npm run dev:local`.
Open http://127.0.0.1:4173/splash.html or `/game.html`.

The server is loopback-only. It serves the production client, injects a fake
Devvit client context, and loads the **real** Hono API routes and Redis store.
A Node module hook substitutes only `@devvit/web/server`; no Reddit credentials
or network requests to Reddit are needed. Memory state is discarded on restart.
The Redis stand-in implements the commands used by the game, not Redis TTLs,
transactions, network failures, or production concurrency semantics.

- Set the `localUser` cookie to a username (default `alice`), or `guest` to log out.
  Reload after changing users; use separate browser profiles/contexts to isolate
  localStorage between accounts.
- `POST /__local/control` with JSON `{ "now": "2026-12-03T23:59:57Z" }`
  sets server time, which continues ticking normally. Reload once to synchronize
  the client offset, then leave the page open to observe UTC rollover.
- `POST /__local/control` with `{ "offline": true }` makes the real API return
  503, exercising the client's offline fallback. Set it to false to restore it.
- `GET /__local/challenge?day=2026-12-03` returns generated stages and solutions
  for browser test automation. Fake leaderboard users can submit these solutions
  through `/api/submit` with their own `localUser` cookie.

These test-only endpoints are not included in the production build or Devvit
server entrypoint. The harness forwards expanded-view messages to `game.html`.
