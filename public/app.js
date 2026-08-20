/* mermaid-viewer — anteprima live, zoom infinito, export SVG/PNG/PDF. */

import { prepareMarkdown } from './md-labels.js';

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

/* --------------------------------------------------- markdown nelle celle */

const prepare = (src) => (state.markdown ? prepareMarkdown(src) : src);

/* ------------------------------------------------------------------ render */

/* mermaid.initialize() riparte sempre dai default: va ripassata la config
   completa a ogni chiamata, altrimenti cambiare tema azzera htmlLabels. */
const baseConfig = {
  startOnLoad: false,
  securityLevel: 'loose',
  suppressErrorRendering: true,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif',
  // htmlLabels:true è obbligatorio: con false Mermaid non regge le etichette
  // multiriga fra backtick ("splitLineToFitWidth does not support newlines") e
  // il diagramma non viene proprio. Il prezzo è che l'SVG contiene
  // <foreignObject>, che il canvas si rifiuta di rasterizzare: se ne occupa
  // l'export PNG, rifacendo il render senza.
  flowchart: { htmlLabels: true, useMaxWidth: false, padding: 18 },
  htmlLabels: true,
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
  if (e.key === 'Escape') { picker.hidden = true; return; }
  if (!picker.hidden || e.metaKey || e.ctrlKey) return;
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

/** Modalità 1: il server conosce il path e ci manda gli aggiornamenti via SSE.
 *  È la strada buona — funziona su ogni browser e su share di rete. */
let stream = null;

function watchServer(path) {
  stream?.close();
  stream = new EventSource(`/api/watch?path=${encodeURIComponent(path)}`);
  stream.onopen = () => setLive(true);
  stream.onerror = () => setLive(false);
  stream.onmessage = (ev) => {
    const { text } = JSON.parse(ev.data);
    if (text === state.source) return;
    setSource(text);
    setLive(true, true);
  };
}

/** Apre un file per path assoluto: è ciò che fanno selettore, recenti e URL. */
async function openPath(path) {
  const r = await fetch(`/api/open?path=${encodeURIComponent(path)}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  setSource(d.text, d.name, { reset: true });
  watchServer(d.path);
  remember(d.path);
  history.replaceState(null, '', `/?path=${encodeURIComponent(d.path)}`);
  localStorage.setItem('mv-dir', d.path.replace(/\/[^/]*$/, ''));
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

/* -------------------------------------------------------- selettore file */

const picker = $('#picker');
const listing = $('#listing');
const crumbs = $('#crumbs');

const recents = () => {
  try { return JSON.parse(localStorage.getItem('mv-recents') || '[]'); } catch { return []; }
};

function remember(path) {
  const list = [path, ...recents().filter((p) => p !== path)].slice(0, 6);
  localStorage.setItem('mv-recents', JSON.stringify(list));
  drawRecents();
}

function drawRecents() {
  const list = recents();
  const box = $('#recents');
  box.replaceChildren();
  if (!list.length) return;
  box.append(Object.assign(document.createElement('b'), { textContent: 'Recenti' }));
  for (const p of list) {
    const b = document.createElement('button');
    b.textContent = p.split('/').pop();
    b.title = p;
    b.onclick = () => choose(p);
    box.append(b);
  }
}

async function choose(path) {
  try {
    await openPath(path);
    picker.hidden = true;
  } catch (e) {
    errBox.hidden = false;
    errBox.textContent = `Impossibile aprire il file: ${e.message}`;
  }
}

async function loadDir(dir) {
  const r = await fetch(`/api/browse?path=${encodeURIComponent(dir)}`);
  const d = await r.json();
  if (d.error) { listing.innerHTML = `<li class="empty">${d.error}</li>`; return; }

  localStorage.setItem('mv-dir', d.path);

  // briciole: le radici consentite più il percorso relativo alla radice attiva
  crumbs.replaceChildren();
  const root = d.roots.find((x) => d.path === x || d.path.startsWith(x + '/')) ?? '/';
  const rest = d.path.slice(root.length).split('/').filter(Boolean);
  const mk = (label, target) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => loadDir(target);
    return b;
  };
  crumbs.append(mk(root === '/' ? '/' : root.split('/').pop() || root, root));
  let acc = root;
  for (const part of rest) {
    acc = `${acc}/${part}`;
    crumbs.append(Object.assign(document.createElement('span'), { textContent: '›' }), mk(part, acc));
  }

  listing.replaceChildren();
  const row = (icon, label, onclick) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `<span class="ico">${icon}</span>`;
    b.append(Object.assign(document.createElement('span'), { textContent: label }));
    b.onclick = onclick;
    li.append(b);
    return li;
  };

  if (d.parent) listing.append(row('↰', '..', () => loadDir(d.parent)));
  for (const name of d.dirs) listing.append(row('📁', name, () => loadDir(`${d.path}/${name}`)));
  for (const name of d.files) listing.append(row('◈', name, () => choose(`${d.path}/${name}`)));

  if (!d.dirs.length && !d.files.length) {
    listing.append(Object.assign(document.createElement('li'),
      { className: 'empty', textContent: 'nessun diagramma qui' }));
  }
}

function openPicker() {
  picker.hidden = false;
  drawRecents();
  loadDir(localStorage.getItem('mv-dir') || '');   // vuoto = prima radice
}

$('#pickerClose').onclick = () => { picker.hidden = true; };
picker.onclick = (e) => { if (e.target === picker) picker.hidden = true; };

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
function selfContained(el) {
  const vb = el.viewBox.baseVal;
  const w = vb.width || el.clientWidth;
  const h = vb.height || el.clientHeight;
  const clone = el.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', isDark() ? '#14171c' : '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  return { text: new XMLSerializer().serializeToString(clone), w, h };
}

function exportSvgString() {
  const el = canvas.querySelector('svg');
  return el ? selfContained(el) : null;
}

/** Il canvas rifiuta di rasterizzare un SVG che contiene <foreignObject>
 *  (SecurityError: tainted). Per il PNG si rifà quindi il render con
 *  htmlLabels:false, che emette <text>. Non sempre riesce: i diagrammi con
 *  etichette multiriga non sono rappresentabili in quella modalità. */
async function rasterSource() {
  const cfg = {
    ...baseConfig,
    theme: mermaidTheme(),
    flowchart: { ...baseConfig.flowchart, htmlLabels: false },
    htmlLabels: false,
  };
  for (const src of [prepare(state.source), state.source]) {
    const id = `r${++state.seq}`;
    try {
      mermaid.initialize(cfg);
      const { svg } = await mermaid.render(id, src);
      if (/<foreignObject/.test(svg)) continue;
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-99999px;top:0';
      host.innerHTML = svg;
      document.body.appendChild(host);
      try {
        return selfContained(host.querySelector('svg'));
      } finally {
        host.remove();
      }
    } catch {
      /* si prova la variante successiva */
    } finally {
      document.getElementById(id)?.remove();
    }
  }
  return null;
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
  if (!canvas.querySelector('svg')) return;
  toast('Preparo il PNG…');
  const out = await rasterSource();
  if (!out) {
    toast('PNG non disponibile per questo diagramma: usa SVG o PDF');
    return;
  }

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
  openPath(path).catch((e) => {
    errBox.hidden = false;
    errBox.textContent = `Impossibile aprire il file: ${e.message}`;
    openPicker();
  });
} else {
  // avviato senza argomenti: si sceglie da qui
  openPicker();
}
