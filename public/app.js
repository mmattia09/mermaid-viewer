/* mermaid-viewer — anteprima live, zoom infinito, export SVG/PNG/PDF. */

const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const canvas = $('#canvas');
const errBox = $('#err');
const toastBox = $('#toast');
const liveDot = $('#live');
const fileLabel = $('#file');
const zoomLabel = $('#zoomLabel');

const state = {
  source: '',
  name: '',
  svg: '',
  /** pan/zoom corrente; va preservato tra un reload e l'altro */
  view: { x: 0, y: 0, k: 1 },
  fresh: true,      // true finché non abbiamo fatto il primo "adatta"
  markdown: true,
  theme: 'auto',
  seq: 0,
};

/* ------------------------------------------------------------------ tema */

const prefersDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () =>
  state.theme === 'dark' || (state.theme === 'auto' && prefersDark.matches);

function mermaidTheme() {
  if (state.theme === 'auto') return prefersDark.matches ? 'dark' : 'default';
  return state.theme;
}

function applyChrome() {
  document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
}

/* --------------------------------------------------- markdown nelle celle
 * Mermaid interpreta **grassetto** solo dentro le "markdown string", cioè le
 * label racchiuse tra backtick. I file scritti a mano usano **bold** in label
 * normali, quindi qui le convertiamo prima di dare il sorgente a Mermaid.
 */

const MD = /\*\*[^*]+\*\*|__[^_]+__|(?:^|[\s(])\*[^*\s][^*]*\*|`[^`]+`/;

function wrapQuotedLabels(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    // salta le righe di commento per intero
    const atLineStart = i === 0 || src[i - 1] === '\n';
    if (atLineStart) {
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
      if (src[j] === '%' && src[j + 1] === '%') {
        const eol = src.indexOf('\n', j);
        const end = eol === -1 ? n : eol + 1;
        out += src.slice(i, end);
        i = end;
        continue;
      }
    }

    if (src[i] === '"') {
      const close = src.indexOf('"', i + 1);
      if (close === -1) { out += src.slice(i); break; }
      const body = src.slice(i + 1, close);
      const already = body.startsWith('`') && body.endsWith('`');
      out += already || !MD.test(body) ? `"${body}"` : `"\`${body}\`"`;
      i = close + 1;
      continue;
    }

    out += src[i++];
  }
  return out;
}

/** Label senza virgolette, es. `X(nega il **libero arbitrio**)`. Restiamo
 *  conservativi: niente parentesi, quadre, graffe o virgolette annidate. */
function wrapBareLabels(src) {
  return src.replace(
    /(\[\[|\[\(|\[\/|\[\\|\{\{|\[|\(|\{)([^"`(){}[\]\n]*?)(\]\]|\)\]|\/\]|\\\]|\}\}|\]|\)|\})/g,
    (m, open, body, close) => (MD.test(body) ? `${open}"\`${body}\`"${close}` : m)
  );
}

const prepare = (src) => (state.markdown ? wrapBareLabels(wrapQuotedLabels(src)) : src);

/* ------------------------------------------------------------------ render */

/* mermaid.initialize() riparte sempre dai default: va ripassata la config
   completa a ogni chiamata, altrimenti cambiare tema azzera htmlLabels. */
const baseConfig = {
  startOnLoad: false,
  securityLevel: 'loose',
  suppressErrorRendering: true,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif',
  // htmlLabels:false fa emettere <text>/<tspan> invece di <foreignObject>:
  // il markdown viene comunque reso, e l'SVG resta rasterizzabile su canvas
  // (i foreignObject rompono l'export PNG).
  flowchart: { htmlLabels: false, useMaxWidth: false, padding: 18 },
  htmlLabels: false,
  markdownAutoWrap: true,
};

async function render() {
  if (!state.source.trim()) return;
  const id = `d${++state.seq}`;
  mermaid.initialize({ ...baseConfig, theme: mermaidTheme() });

  try {
    const { svg } = await mermaid.render(id, prepare(state.source));
    state.svg = svg;
    canvas.innerHTML = svg;
    const el = canvas.querySelector('svg');
    if (el) {
      el.removeAttribute('style');
      el.removeAttribute('width');
      el.removeAttribute('height');
      const vb = el.viewBox.baseVal;
      el.setAttribute('width', vb.width);
      el.setAttribute('height', vb.height);
    }
    errBox.hidden = true;
    $('#drop').classList.add('hide');
    if (state.fresh) { fit(); state.fresh = false; } else { applyView(); }
  } catch (e) {
    document.getElementById(id)?.remove();       // Mermaid lascia un nodo orfano
    errBox.hidden = false;
    errBox.textContent = (e?.message ?? String(e)).trim();
  }
}

/* ------------------------------------------------------------- pan e zoom */

const GRID = 24;

/** La griglia di sfondo si ancora al diagramma. Il passo raddoppia o si dimezza
 *  a potenze di due per restare leggibile a qualsiasi zoom, invece di
 *  impastarsi da lontano o sparire da vicino. */
function applyGrid(x, y, k) {
  let step = GRID * k;
  if (step > 0) {
    while (step < 10) step *= 2;
    while (step > 120) step /= 2;
  } else {
    step = GRID;
  }
  stage.style.backgroundSize = `${step}px ${step}px`;
  stage.style.backgroundPosition = `${x % step}px ${y % step}px`;
}

function applyView() {
  const { x, y, k } = state.view;
  canvas.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  zoomLabel.textContent = `${Math.round(k * 100)}%`;
  applyGrid(x, y, k);
}

function svgSize() {
  const el = canvas.querySelector('svg');
  if (!el) return null;
  const vb = el.viewBox.baseVal;
  return { w: vb.width || el.clientWidth, h: vb.height || el.clientHeight };
}

function fit(pad = 40) {
  const s = svgSize();
  if (!s) return;
  const k = Math.min((stage.clientWidth - pad * 2) / s.w, (stage.clientHeight - pad * 2) / s.h);
  state.view.k = k > 0 ? k : 1;
  state.view.x = (stage.clientWidth - s.w * state.view.k) / 2;
  state.view.y = (stage.clientHeight - s.h * state.view.k) / 2;
  applyView();
}

/** Zoom centrato su un punto dello schermo: il punto resta fermo. */
function zoomAt(cx, cy, factor) {
  const { x, y, k } = state.view;
  const nk = k * factor;
  state.view.k = nk;
  state.view.x = cx - (cx - x) * (nk / k);
  state.view.y = cy - (cy - y) * (nk / k);
  applyView();
}

const centerZoom = (f) => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, f);

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  // ⌘/ctrl + rotella (o pinch sul trackpad) = zoom; rotella liscia = pan
  if (e.ctrlKey || e.metaKey) {
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
  } else {
    state.view.x -= e.deltaX;
    state.view.y -= e.deltaY;
    applyView();
  }
}, { passive: false });

let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  drag = { px: e.clientX, py: e.clientY, x: state.view.x, y: state.view.y };
  stage.setPointerCapture(e.pointerId);
  stage.classList.add('panning');
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  state.view.x = drag.x + (e.clientX - drag.px);
  state.view.y = drag.y + (e.clientY - drag.py);
  applyView();
});
const endDrag = () => { drag = null; stage.classList.remove('panning'); };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('dblclick', () => fit());

addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); openPicker(); return; }
  if (e.metaKey || e.ctrlKey) return;
  const k = e.key;
  if (k === '+' || k === '=') centerZoom(1.2);
  else if (k === '-' || k === '_') centerZoom(1 / 1.2);
  else if (k === '0') { state.view.k = 1; applyView(); }
  else if (k === 'f' || k === 'F') fit();
});

/* ----------------------------------------------------------------- toast */

let toastTimer;
function toast(msg) {
  toastBox.textContent = msg;
  toastBox.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastBox.hidden = true; }, 1800);
}

/* ------------------------------------------------------- caricamento file */

function setSource(text, name, { reset = false } = {}) {
  state.source = text;
  if (name) {
    state.name = name;
    fileLabel.textContent = name;
    fileLabel.title = name;
    fileLabel.classList.add('loaded');
    document.title = `${name} — mermaid-viewer`;
  }
  if (reset) state.fresh = true;
  render();
}

function setLive(on, pulse = false) {
  liveDot.className = `dot ${on ? 'on' : 'off'}`;
  if (pulse) {
    liveDot.classList.add('pulse');
    setTimeout(() => liveDot.classList.remove('pulse'), 320);
  }
}

/** Modalità 1: il server conosce il path e ci manda gli aggiornamenti via SSE. */
function watchServer(path) {
  const es = new EventSource(`/api/watch?path=${encodeURIComponent(path)}`);
  es.onopen = () => setLive(true);
  es.onerror = () => setLive(false);
  es.onmessage = (ev) => {
    const { text } = JSON.parse(ev.data);
    if (text === state.source) return;
    setSource(text);
    setLive(true, true);
  };
}

/** Modalità 2: handle del File System Access API, con polling su lastModified. */
function watchHandle(handle) {
  let last = -1;
  setLive(true);
  const tick = async () => {
    try {
      const f = await handle.getFile();
      if (f.lastModified !== last) {
        last = last === -1 ? f.lastModified : f.lastModified;
        const text = await f.text();
        if (text !== state.source) { setSource(text, f.name); setLive(true, true); }
      }
    } catch { setLive(false); }
  };
  tick();
  setInterval(tick, 700);
}

async function openPicker() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: 'Mermaid', accept: { 'text/plain': ['.mmd', '.mermaid', '.md', '.txt'] } }],
      });
      const f = await h.getFile();
      setSource(await f.text(), f.name, { reset: true });
      watchHandle(h);
    } catch { /* annullato dall'utente */ }
    return;
  }
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.mmd,.mermaid,.md,.txt';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (f) { setSource(await f.text(), f.name, { reset: true }); setLive(false); }
  };
  inp.click();
}

stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
stage.addEventListener('drop', async (e) => {
  e.preventDefault();
  stage.classList.remove('dragover');
  const item = e.dataTransfer.items?.[0];
  if (item?.getAsFileSystemHandle) {
    const h = await item.getAsFileSystemHandle();
    if (h?.kind === 'file') {
      const f = await h.getFile();
      setSource(await f.text(), f.name, { reset: true });
      watchHandle(h);
      return;
    }
  }
  const f = e.dataTransfer.files?.[0];
  if (f) { setSource(await f.text(), f.name, { reset: true }); setLive(false); }
});

/* ---------------------------------------------------------------- export */

/** SVG autoconsistente: dimensioni esplicite e sfondo opaco. */
function exportSvgString() {
  const el = canvas.querySelector('svg');
  if (!el) return null;
  const clone = el.cloneNode(true);
  const s = svgSize();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', s.w);
  clone.setAttribute('height', s.h);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', isDark() ? '#14171c' : '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  return { text: new XMLSerializer().serializeToString(clone), ...s };
}

function download(blob, ext) {
  const base = (state.name || 'diagramma').replace(/\.[^.]+$/, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`Esportato ${base}.${ext}`);
}

function exportSVG() {
  const out = exportSvgString();
  if (out) download(new Blob([out.text], { type: 'image/svg+xml' }), 'svg');
}

/** Oltre ~16384px per lato Chrome restituisce una tela vuota senza errori:
 *  meglio ridurre il fattore e dirlo, che salvare un PNG bianco. */
const CANVAS_MAX = 16384;

async function exportPNG(scale) {
  const out = exportSvgString();
  if (!out) return;

  const limit = Math.min(CANVAS_MAX / out.w, CANVAS_MAX / out.h);
  if (scale > limit) {
    const capped = Math.max(1, Math.floor(limit * 10) / 10);
    if (capped < scale) {
      toast(`Diagramma troppo grande: PNG ridotto a ${capped}×`);
      scale = capped;
    }
  }

  const url = URL.createObjectURL(new Blob([out.text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });

    const c = document.createElement('canvas');
    c.width = Math.round(out.w * scale);
    c.height = Math.round(out.h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = isDark() ? '#14171c' : '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    download(blob, 'png');
  } catch {
    toast('Export PNG non riuscito');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PDF vettoriale passando dalla stampa del browser (“Salva come PDF”). */
function exportPDF() {
  const out = exportSvgString();
  if (!out) return;
  const w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${(state.name || 'diagramma').replace(/\.[^.]+$/, '')}</title>
<style>
  @page { size: ${Math.ceil(out.w)}px ${Math.ceil(out.h)}px; margin: 0 }
  html,body { margin:0; padding:0 }
  svg { display:block }
</style></head><body>${out.text}</body></html>`);
  w.document.close();
  w.addEventListener('load', () => { w.focus(); w.print(); });
}

/* ------------------------------------------------------------------- UI */

$('#open').onclick = openPicker;
$('#fit').onclick = () => fit();
zoomLabel.onclick = () => { state.view.k = 1; applyView(); };
document.querySelectorAll('[data-zoom]').forEach((b) => {
  b.onclick = () => centerZoom(b.dataset.zoom === 'in' ? 1.2 : 1 / 1.2);
});

$('#md').onchange = (e) => { state.markdown = e.target.checked; render(); };

const themeSel = $('#theme');
themeSel.onchange = (e) => {
  state.theme = e.target.value;
  localStorage.setItem('mv-theme', state.theme);
  applyChrome();
  render();
};

const menu = $('#exportMenu');
$('#exportBtn').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
document.addEventListener('click', () => { menu.hidden = true; });
menu.onclick = (e) => {
  const what = e.target.dataset?.export;
  if (!what) return;
  menu.hidden = true;
  if (what === 'svg') exportSVG();
  else if (what === 'pdf') exportPDF();
  else exportPNG(Number(what.split('@')[1]));
};

prefersDark.addEventListener('change', () => {
  if (state.theme === 'auto') { applyChrome(); render(); }
});
addEventListener('resize', () => { if (state.fresh) fit(); });

/* ------------------------------------------------------------------ boot */

state.theme = localStorage.getItem('mv-theme') || 'auto';
themeSel.value = state.theme;
applyChrome();
applyView();

const path = new URLSearchParams(location.search).get('path');
if (path) {
  fetch(`/api/open?path=${encodeURIComponent(path)}`)
    .then((r) => r.json())
    .then((d) => {
      if (d.error) throw new Error(d.error);
      setSource(d.text, d.name, { reset: true });
      watchServer(d.path);
    })
    .catch((e) => { errBox.hidden = false; errBox.textContent = `Impossibile aprire il file: ${e.message}`; });
}
