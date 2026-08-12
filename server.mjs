#!/usr/bin/env node
// mermaid-viewer — server statico a zero dipendenze + watch dei file via SSE.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { extname, join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, code, obj) =>
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

async function readTarget(p) {
  const abs = resolve(p);
  const st = await stat(abs);
  if (!st.isFile()) throw new Error('non è un file');
  return { path: abs, name: basename(abs), mtime: st.mtimeMs, text: await readFile(abs, 'utf8') };
}

/**
 * fs.watch da solo non basta: molti editor salvano con rename+replace, il che
 * invalida il descrittore. Combino watch (reattivo) e un poll lento (rete di
 * sicurezza), deduplicando sul mtime.
 */
function watchFile(abs, onChange) {
  let last = 0;
  let timer = null;
  const check = async () => {
    try {
      const st = await stat(abs);
      if (st.mtimeMs !== last) {
        last = st.mtimeMs;
        onChange(await readFile(abs, 'utf8'), st.mtimeMs);
      }
    } catch {
      /* file momentaneamente assente durante un salvataggio atomico */
    }
  };
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 40);
  };

  let w = null;
  const arm = () => {
    try {
      w?.close();
      w = watch(abs, debounced);
      w.on('error', () => setTimeout(arm, 300));
    } catch {
      setTimeout(arm, 300);
    }
  };
  arm();

  // Il poll copre anche il caso "watcher morto e mai riarmato".
  const poll = setInterval(check, 1000);
  check();

  return () => {
    clearInterval(poll);
    clearTimeout(timer);
    try { w?.close(); } catch { /* già chiuso */ }
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/open') {
    const p = url.searchParams.get('path');
    if (!p) return json(res, 400, { error: 'manca il parametro path' });
    try {
      return json(res, 200, await readTarget(p));
    } catch (e) {
      return json(res, 404, { error: e.message });
    }
  }

  if (url.pathname === '/api/watch') {
    const p = url.searchParams.get('path');
    if (!p) return json(res, 400, { error: 'manca il parametro path' });
    let abs;
    try {
      abs = (await readTarget(p)).path;
    } catch (e) {
      return json(res, 404, { error: e.message });
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    const emit = (text, mtime) =>
      res.write(`data: ${JSON.stringify({ text, mtime })}\n\n`);
    const stop = watchFile(abs, emit);
    const ka = setInterval(() => res.write(': ka\n\n'), 25000);
    req.on('close', () => { clearInterval(ka); stop(); });
    return;
  }

  // statico
  let name = url.pathname === '/' ? '/index.html' : url.pathname;
  const abs = join(PUBLIC, name);
  if (!abs.startsWith(PUBLIC)) return send(res, 403, 'vietato');
  try {
    const body = await readFile(abs);
    return send(res, 200, body, { 'Content-Type': MIME[extname(abs)] ?? 'application/octet-stream' });
  } catch {
    return send(res, 404, 'non trovato');
  }
});

const port = Number(process.env.PORT) || 4321;
const target = process.argv[2] ? resolve(process.argv[2]) : null;

server.listen(port, '127.0.0.1', () => {
  const q = target ? `/?path=${encodeURIComponent(target)}` : '/';
  console.log(`mermaid-viewer → http://localhost:${port}${q}`);
  if (process.env.NO_OPEN !== '1') {
    import('node:child_process').then(({ spawn }) =>
      spawn('open', [`http://localhost:${port}${q}`], { stdio: 'ignore', detached: true }).unref()
    );
  }
});
