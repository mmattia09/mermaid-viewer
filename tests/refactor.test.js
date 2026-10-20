import { test, expect } from 'bun:test';
import { latestTask } from '../public/async.js';
import { createStorage, readPreferences } from '../public/preferences.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('only the latest queued preview starts and an active stale result is identifiable', async () => {
  const started = [], published = [], gate = deferred();
  const queue = latestTask(async (value, current) => {
    started.push(value);
    if (value === 1) await gate.promise;
    if (current()) published.push(value);
  });
  const first = queue.request(1);
  await Promise.resolve();
  const second = queue.request(2), third = queue.request(3);
  gate.resolve();
  await Promise.all([first, second, third]);
  expect(started).toEqual([1, 3]);
  expect(published).toEqual([3]);
});

test('invalidated or failed preview work does not prevent subsequent renders', async () => {
  const values = [];
  const queue = latestTask(async value => { if (value === 'bad') throw Error('bad'); values.push(value); });
  await expect(queue.request('bad')).rejects.toThrow('bad');
  const stale = queue.request('stale'); queue.invalidate(); await stale;
  await queue.request('valid'); expect(values).toEqual(['valid']);
});

test('preferences validate persisted values and tolerate unavailable storage', () => {
  const storage = createStorage(null, () => { throw Error('blocked'); });
  expect(readPreferences(storage)).toEqual({ engine:'pele', theme:'auto', language:'auto', responsive:true, markdown:true });
  expect(() => storage.setItem('mv-theme', 'dark')).not.toThrow();
  const state = { 'mv-engine':'invalid', 'mv-theme':'invalid', 'mv-language':'xx', 'mv-responsive':'false' };
  const host = { getState: () => state, setState: () => {} };
  const preferences = readPreferences(createStorage(host));
  expect(preferences.engine).toBe('pele'); expect(preferences.theme).toBe('auto');
  expect(preferences.language).toBe('auto'); expect(preferences.responsive).toBe(false);
});

test('concurrent panel requests share one creation and closed panels can reopen', async () => {
  const { createPanelRegistry } = await import('../extension/panel-registry.cjs');
  const registry = createPanelRegistry();
  let calls = 0, close;
  const panel = { onDidDispose(fn) { close = fn; }, dispose() { close?.(); } };
  const create = async () => { calls++; return panel; };
  const [first, second] = await Promise.all([registry.getOrCreate('file', create), registry.getOrCreate('file', create)]);
  expect(calls).toBe(1); expect(first).toBe(second);
  panel.dispose(); await registry.getOrCreate('file', create);
  expect(calls).toBe(2); registry.dispose();
});

test('failed panel creation can be retried', async () => {
  const { createPanelRegistry } = await import('../extension/panel-registry.cjs');
  const registry = createPanelRegistry();
  await expect(registry.getOrCreate('file', async () => { throw Error('read failed'); })).rejects.toThrow();
  const panel = { onDidDispose() {}, dispose() {} };
  expect(await registry.getOrCreate('file', async () => panel)).toBe(panel);
  registry.dispose();
});

test('webview HTML uses explicit markers and preserves restrictive CSP', async () => {
  const { buildWebviewHTML } = await import('../extension/webview-html.cjs');
  const template = await Bun.file('public/index.html').text();
  const html = buildWebviewHTML(template.replace('lang="it"', 'lang="fr"'), {
    language:'de', nonce:'test', cspSource:'vscode-webview:', resource: file => `https://local/${file}`,
  });
  expect(html).toContain('data-language="de"');
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain('nonce="test"');
  expect(html).toContain('src="https://local/app.js"');
  expect(() => buildWebviewHTML('', {})).toThrow('template marker');
});
