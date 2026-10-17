import { test, expect } from 'bun:test';
import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAsync } from '../public/vendor/pele/lazy.js';
import { prepareMarkdown } from '../public/md-labels.js';
import { watchFile } from '../watch-file.ts';

for (const file of ['flow.mmd', 'sequence.mermaid', 'markdown.mmd']) {
  test(`Pele renders ${file} in fixed and responsive modes`, async () => {
    const source = await Bun.file(join(import.meta.dir, 'fixtures', file)).text();
    for (const responsive of [true, false]) {
      const result = await renderAsync(prepareMarkdown(source), { responsive, autoDirection: responsive, ...(responsive ? { maxWidth: 320 } : {}) });
      expect(result.svg).toContain('<svg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.svg).not.toContain('NaN');
    }
  });
}
test('Pele changes layout at narrow widths only when requested', async () => {
  const source = 'flowchart LR\n A[Start] --> B[Next] --> C[More] --> D[Finish]';
  const wide = await renderAsync(source, { responsive: false, autoDirection: false });
  const narrow = await renderAsync(source, { maxWidth: 180 });
  expect(wide.width).toBeGreaterThan(wide.height);
  expect(narrow.height).toBeGreaterThan(narrow.width);
});
test('Pele rejects invalid input and escapes untrusted text', async () => {
  await expect(renderAsync('this is not a diagram')).rejects.toThrow();
  const { svg } = await renderAsync('flowchart TD\n A["<script>alert(1)</script>"]', { links: false, images: false });
  expect(svg).not.toContain('<script>');
});
test('watcher shares updates, survives atomic save and stops after disposal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'viewer-watch-'));
  const path = join(dir, 'test.mmd');
  const a = [], b = [];
  let stopA = () => {}, stopB = () => {};
  try {
    await writeFile(path, 'first');
    stopA = watchFile(path, value => a.push(value));
    stopB = watchFile(path, value => b.push(value));
    await Bun.sleep(100);
    await writeFile(join(dir, 'temp'), 'second');
    await rename(join(dir, 'temp'), path);
    await Bun.sleep(650);
    expect(a).toEqual(['first', 'second']); expect(b).toEqual(a);
    stopA();
    await writeFile(path, 'third'); await Bun.sleep(650);
    expect(a).toEqual(['first', 'second']); expect(b.at(-1)).toBe('third');
    stopB();
    await writeFile(path, 'fourth'); await Bun.sleep(600);
    expect(b.at(-1)).toBe('third');
  } finally { stopA(); stopB(); await rm(dir, { recursive: true, force: true }); }
});
