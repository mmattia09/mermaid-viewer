import { test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createExporter } from '../public/exporter.js';

test('asynchronous export keeps its original source, palette, background and filename', async () => {
  const dom = new JSDOM('<body><div id="canvas" style="--bg:#ffffff;--pele-bg:#ffffff"><svg viewBox="0 0 100 50"></svg></div></body>');
  const previous = Object.fromEntries(['document','getComputedStyle','XMLSerializer'].map(k => [k, globalThis[k]]));
  Object.assign(globalThis, { document:dom.window.document, getComputedStyle:dom.window.getComputedStyle, XMLSerializer:dom.window.XMLSerializer });
  Object.defineProperty(dom.window.SVGElement.prototype, 'viewBox', { get() { return { baseVal:{ width:100,height:50 } }; } });
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { started = resolve; });
  const calls = [], saved = [];
  dom.window.HTMLAnchorElement.prototype.click = function () { saved.push(this.download); };
  const settings = { source:'flowchart TD\n A[Original]', name:'original.mmd', engine:'mermaid', markdown:false, theme:'default', palette:'ocean' };
  let output;
  const exporter = createExporter({
    canvas:document.querySelector('#canvas'), vscode:null, getSettings:()=>({...settings}), toast:()=>{},
    render:async (source, options) => { calls.push({source,options}); started(); await gate; return {svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text>Original</text></svg>'}; },
    toRaster:async out => { output = out; return {toBlob(callback) { callback(new Blob(['image'])); }}; },
  });
  try {
    const pending = exporter('png@1');
    await ready;
    Object.assign(settings, { source:'flowchart TD\n B[Changed]', name:'changed.mmd', theme:'dark', palette:'plum' });
    document.querySelector('#canvas').style.setProperty('--bg', '#000000');
    release(); await pending;
    expect(calls).toHaveLength(1);
    expect(calls[0].source).toContain('Original');
    expect(calls[0].options.palette).toBe('ocean');
    expect(output.text).toContain('fill="#ffffff"');
    expect(saved).toEqual(['original.png']);
  } finally { release(); Object.assign(globalThis, previous); dom.window.close(); }
});
