#!/usr/bin/env bun
// mermaid-viewer — server Bun: statico, sfoglia i file, watch via SSE.
import { createFileAccess } from './server/files.ts';
import { watchFile } from './watch-file.ts';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const HERE = dirname(Bun.fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');
const SIGNATURE = 'mermaid-viewer';
const { openFile, browse } = createFileAccess([homedir(), '/Volumes', process.cwd()]);

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/* ---------------------------------------------------------------- handlers */

function sse(abs: string) {
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (chunk: string) => {
        try { controller.enqueue(enc.encode(chunk)); } catch { stop(); }
      };
      const unwatch = watchFile(abs, (text) => send(`data: ${JSON.stringify({ text })}\n\n`), () => openFile(abs).then(file => file.text));
      const ka = setInterval(() => send(': ka\n\n'), 25000);
      stop = () => { clearInterval(ka); unwatch(); };
    },
    cancel() { stop(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}

/* ------------------------------------------------------------------ avvio */

const target = process.argv[2] ? resolve(process.argv[2]) : null;
const query = target ? `/?path=${encodeURIComponent(target)}` : '/';
const basePort = Number(process.env.PORT) || 4321;

function routes(req: Request) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method !== 'GET') return new Response('metodo non consentito', { status: 405 });
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin) return new Response('origine non consentita', { status: 403 });
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return new Response('host non consentito', { status: 403 });
  const arg = url.searchParams.get('path');

  if (p === '/api/ping') return json({ app: SIGNATURE });

  if ((p === '/api/open' || p === '/api/watch') && !arg) {
    return json({ error: 'manca il parametro path' }, 400);
  }

  if (p === '/api/open') {
    return openFile(arg!).then(json).catch((e) => json({ error: e.message }, 404));
  }

  // senza path si parte dalla prima radice
  if (p === '/api/browse') {
    return browse(arg || homedir()).then(json).catch((e) => json({ error: e.message }, 404));
  }

  if (p === '/api/watch') {
    return openFile(arg!)
      .then((f) => sse(f.path))
      .catch((e) => json({ error: e.message }, 404));
  }

  let pathname;
  try { pathname = decodeURIComponent(p); } catch { return new Response('path non valido', { status: 400 }); }
  const asset = resolve(PUBLIC, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!asset.startsWith(PUBLIC + '/')) return new Response('non consentito', { status: 403 });
  const file = Bun.file(asset);
  return file.exists().then((ok) =>
    ok ? new Response(file, { headers: { 'Cache-Control': 'no-store' } })
       : new Response('non trovato', { status: 404 })
  );
}

async function openBrowser(port: number) {
  if (process.env.NO_OPEN === '1') return;
  const address = `http://localhost:${port}${query}`;
  const command = process.platform === 'darwin' ? ['open', address]
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '', address] : ['xdg-open', address];
  try { Bun.spawn(command).unref(); } catch { /* The printed URL is still usable. */ }
}

/** Se la porta risponde ed è una nostra istanza, le passiamo il file invece di
 *  fallire; se è di un programma estraneo, proviamo la successiva. */
async function isOurs(port: number) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      signal: AbortSignal.timeout(700),
    });
    return r.ok && (await r.json()).app === SIGNATURE;
  } catch {
    return false;
  }
}

for (let port = basePort, tries = 0; tries < 12; port++, tries++) {
  try {
    Bun.serve({ port, hostname: '127.0.0.1', idleTimeout: 0, fetch: routes });
    console.log(`mermaid-viewer → http://localhost:${port}${query}`);
    await openBrowser(port);
    break;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== 'EADDRINUSE') {
      console.error(String(e));
      process.exit(1);
    }
    if (await isOurs(port)) {
      console.log(`mermaid-viewer già attivo → http://localhost:${port}${query}`);
      await openBrowser(port);
      process.exit(0);
    }
    if (tries === 11) {
      console.error(`nessuna porta libera tra ${basePort} e ${port}`);
      process.exit(1);
    }
  }
}
