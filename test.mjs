#!/usr/bin/env node
/* Regressione: ogni .mmd passato come argomento (o tutti quelli sotto una
 * cartella) viene reso con la stessa configurazione dell'app, prima grezzo e
 * poi passato per prepareMarkdown().
 *
 * Si usa render() e non parse(): un diagramma può superare il parser e poi
 * fallire in fase di disegno, ed è esattamente così che era sfuggito
 * "splitLineToFitWidth does not support newlines" sulle etichette multiriga.
 *
 *   node test.mjs <file-o-cartella>...
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { prepareMarkdown } from './public/md-labels.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });

// mermaid.render() tocca parecchia superficie del DOM che in node non esiste
for (const k of [
  'Element', 'SVGElement', 'SVGGraphicsElement', 'CSSStyleSheet',
  'CSSStyleDeclaration', 'StyleSheet', 'DOMParser', 'XMLSerializer',
  'Image', 'getComputedStyle', 'requestAnimationFrame', 'MutationObserver',
]) {
  if (dom.window[k] !== undefined) global[k] = dom.window[k];
}

// jsdom non calcola i box: senza queste, dagre riceve dimensioni NaN
dom.window.SVGElement.prototype.getBBox ??= function () {
  const t = this.textContent ?? '';
  return { x: 0, y: 0, width: Math.max(8, t.length * 7), height: 18 };
};
dom.window.SVGElement.prototype.getComputedTextLength ??= function () {
  return (this.textContent ?? '').length * 7;
};

const mermaid = (await import('mermaid')).default;

// stessa configurazione di public/app.js
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  suppressErrorRendering: true,
  flowchart: { htmlLabels: true, useMaxWidth: false, padding: 18 },
  htmlLabels: true,
  markdownAutoWrap: true,
});

async function collect(p) {
  const st = await stat(p);
  if (st.isFile()) return p.endsWith('.mmd') ? [p] : [];
  const out = [];
  for (const e of await readdir(p, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    out.push(...(await collect(join(p, e.name))));
  }
  return out;
}

const roots = process.argv.slice(2);
if (!roots.length) {
  console.error('uso: node test.mjs <file-o-cartella>...');
  process.exit(2);
}

const files = (await Promise.all(roots.map(collect))).flat().sort();
let failed = 0;

for (const f of files) {
  const src = await readFile(f, 'utf8');
  const name = f.split('/').slice(-2).join('/');
  const results = [];

  let n = 0;
  for (const [label, text] of [['grezzo', src], ['markdown', prepareMarkdown(src)]]) {
    const id = `t${n++}`;
    try {
      await mermaid.render(id, text);
      results.push(`${label} ok`);
    } catch (e) {
      results.push(`${label} ROTTO`);
      results.push('    ' + (e?.message ?? String(e)).split('\n').slice(0, 3).join('\n    '));
    } finally {
      document.getElementById(id)?.remove();
    }
  }

  const bad = results.some((r) => r.includes('ROTTO'));
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : ' ok '}  ${name}  [${results.filter((r) => !r.startsWith('    ')).join(', ')}]`);
  results.filter((r) => r.startsWith('    ')).forEach((r) => console.log(r));
}

console.log(`\n${files.length - failed}/${files.length} diagrammi ok`);
process.exit(failed ? 1 : 0);
