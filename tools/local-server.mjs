import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { requests } from './local-devvit.mjs';

const root = new URL('../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@devvit/web/server')
      return {
        url: new URL('./local-devvit.mjs', import.meta.url).href,
        shortCircuit: true,
      };
    if (specifier.startsWith('.') && context.parentURL?.startsWith(root.href)) {
      const url = new URL(specifier, context.parentURL);
      if (!existsSync(url) && existsSync(`${fileURLToPath(url)}.ts`))
        return { url: `${url.href}.ts`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const RealDate = Date;
let offset = 0;
let offline = false;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [RealDate.now() + offset]));
  }
  static now() {
    return RealDate.now() + offset;
  }
};
const { api } = await import('../src/server/routes/api.ts');
const { getDailyChallenge } = await import('../src/shared/puzzle.ts');

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const user =
      /(?:^|; )localUser=([^;]*)/.exec(req.headers.cookie ?? '')?.[1] ??
      'alice';
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/__local/control' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.now) offset = RealDate.parse(body.now) - RealDate.now();
      if ('offline' in body) offline = Boolean(body.offline);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ now: Date.now(), offline }));
      return;
    }
    if (url.pathname === '/__local/challenge') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          getDailyChallenge(
            url.searchParams.get('day') ?? new Date().toISOString().slice(0, 10)
          )
        )
      );
      return;
    }
    if (url.pathname === '/__local/context.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(
        `globalThis.devvit={context:${JSON.stringify({ userId: user === 'guest' ? undefined : user, subredditName: 'local_upslide' })},webViewMode:0,entrypoints:{game:location.origin+'/game.html'}};addEventListener('message',e=>{if(e.source===window&&e.data?.immersiveMode?.entryUrl)location.assign(e.data.immersiveMode.entryUrl)});`
      );
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (offline) {
        res.writeHead(503);
        res.end('Local API disabled');
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const response = await requests.run(
        {
          userId: user === 'guest' ? undefined : user,
          subredditName: 'local_upslide',
        },
        () =>
          api.fetch(
            new Request(
              `http://127.0.0.1${url.pathname.slice(4)}${url.search}`,
              {
                method: req.method,
                headers: req.headers,
                ...(body.length ? { body } : {}),
              }
            )
          )
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const pathname = url.pathname === '/' ? '/splash.html' : url.pathname;
    const file = new URL(`dist/client${pathname}`, root);
    if (!file.href.startsWith(new URL('dist/client/', root).href)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let content = await readFile(file);
    const extension = pathname.split('.').pop();
    const mime =
      {
        html: 'text/html',
        js: 'text/javascript',
        css: 'text/css',
        map: 'application/json',
      }[extension] ?? 'application/octet-stream';
    if (extension === 'html')
      content = Buffer.from(
        content
          .toString()
          .replace(
            '<head>',
            '<head><script src="/__local/context.js"></script>'
          )
      );
    res.setHeader('Content-Type', mime);
    res.end(content);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500);
    res.end(String(error));
  }
});
server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () =>
  console.log(
    'Local Upslide: http://127.0.0.1:4173 (built client; real Hono API; in-memory Redis)'
  )
);
