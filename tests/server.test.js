import { test, expect } from 'bun:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';

test('server serves local diagrams and rejects unsafe paths and origins', async () => {
  const reservation = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() });
  const port = reservation.port; reservation.stop(true);
  const process = Bun.spawn(['bun', 'server.ts'], { env: { ...globalThis.process.env, PORT: String(port), NO_OPEN: '1' }, stdout: 'ignore', stderr: 'pipe' });
  const base = `http://127.0.0.1:${port}`;
  const dir = await mkdtemp(join(import.meta.dir, 'server-'));
  try {
    let started = false;
    for (let n = 0; n < 60; n++) {
      try { if ((await fetch(base + '/api/ping')).ok) { started = true; break; } } catch {}
      await Bun.sleep(50);
    }
    expect(started).toBe(true);
    const source = join(import.meta.dir, 'fixtures/flow.mmd');
    expect((await (await fetch(base + '/api/open?path=' + encodeURIComponent(source))).json()).text).toContain('flowchart');
    expect((await fetch(base + '/app.js')).status).toBe(200);
    expect((await fetch(base + '/api/open')).status).toBe(400);
    expect((await fetch(base + '/api/ping', { method: 'POST' })).status).toBe(405);
    expect((await fetch(base + '/api/ping', { headers: { Origin: 'https://example.com' } })).status).toBe(403);
    expect((await fetch(base + '/api/open?path=/etc/passwd')).status).toBe(404);
    await symlink('/etc', join(dir, 'outside'));
    expect((await fetch(base + '/api/browse?path=' + encodeURIComponent(join(dir, 'outside')))).status).toBe(404);
    expect((await fetch(base + '/%2e%2e%2fpackage.json')).status).toBe(403);
  } finally { process.kill(); await process.exited; await rm(dir, { recursive: true, force: true }); }
}, 10000);
