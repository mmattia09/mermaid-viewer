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
 * Rilevare le modifiche è più insidioso di quanto sembri:
 *
 * - fs.watch da solo non basta, perché molti editor (VS Code compreso) salvano
 *   con temp+rename e il descrittore resta legato al vecchio inode;
 * - su una share SMB, come /Volumes/share, fs.watch non notifica proprio nulla
 *   e per giunta il client macOS cachea gli attributi: stat() continua a
 *   restituire lo stesso mtime anche dopo una riscrittura. Il contenuto letto è
 *   invece sempre aggiornato.
 *
 * Quindi il confronto va fatto sul contenuto, non sul mtime; fs.watch resta solo
 * come accelleratore sui filesystem locali.
 */
const POLL_MS = 500;

function watchFile(abs, onChange) {
  let lastText = null;
  let timer = null;
  const check = async () => {
    try {
      const text = await readFile(abs, 'utf8');
      if (text !== lastText) {
        lastText = text;
        onChange(text);
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

  // Il poll è la vera fonte di verità: copre share di rete, salvataggi atomici
  // e il caso "watcher morto e mai riarmato".
  const poll = setInterval(check, POLL_MS);
  check();

  return () => {
    clearInterval(poll);
    clearTimeout(timer);
    try { w?.close(); } catch { /* già chiuso */ }
  };
}

const SIGNATURE = 'mermaid-viewer';

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // permette a una seconda istanza di riconoscere la prima
  if (url.pathname === '/api/ping') return json(res, 200, { app: SIGNATURE });

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
    const emit = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`);
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

const basePort = Number(process.env.PORT) || 4321;
const target = process.argv[2] ? resolve(process.argv[2]) : null;
const query = target ? `/?path=${encodeURIComponent(target)}` : '/';

async function openBrowser(port) {
  if (process.env.NO_OPEN === '1') return;
  const { spawn } = await import('node:child_process');
  spawn('open', [`http://localhost:${port}${query}`], { stdio: 'ignore', detached: true }).unref();
}

/** Se la porta risponde ed è una nostra istanza, riusiamola invece di fallire. */
async function isOurs(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      signal: AbortSignal.timeout(700),
    });
    return r.ok && (await r.json()).app === SIGNATURE;
  } catch {
    return false;
  }
}

/** Un tentativo di bind, ripulendo sempre i listener: riusando lo stesso oggetto
 *  server le callback dei tentativi falliti resterebbero appese e scatterebbero
 *  tutte insieme al primo successo. */
function tryListen(port) {
  return new Promise((ok, fail) => {
    const onError = (e) => { server.removeListener('listening', onListening); fail(e); };
    const onListening = () => { server.removeListener('error', onError); ok(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function start() {
  for (let port = basePort; port < basePort + 12; port++) {
    try {
      await tryListen(port);
      console.log(`mermaid-viewer → http://localhost:${port}${query}`);
      return openBrowser(port);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') {
        console.error(err.message);
        process.exit(1);
      }
      if (await isOurs(port)) {
        // già in esecuzione: gli passiamo il file aprendo una scheda e usciamo
        console.log(`mermaid-viewer già attivo → http://localhost:${port}${query}`);
        await openBrowser(port);
        process.exit(0);
      }
      // porta occupata da altri: si prova la successiva
    }
  }
  console.error(`nessuna porta libera tra ${basePort} e ${basePort + 11}`);
  process.exit(1);
}

start();
