/* mermaid-viewer — anteprima live, zoom infinito, export SVG/PNG/PDF. */

import { prepareMarkdown } from './md-labels.js';
import { renderDiagram } from './renderers.js';
import { createExporter } from './exporter.js';
import { createViewport } from './viewport.js';
import { createFileBrowser } from './file-browser.js';
import { createStorage, readPreferences } from './preferences.js';
import { latestTask } from './async.js';
import { themes } from './themes.js';
import { t, setLanguage, bindTranslations } from './i18n.js';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
if (vscode) document.documentElement.dataset.host = 'vscode';
const storage = createStorage(vscode);
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
  fresh: true,      // true finché non abbiamo fatto il primo "adatta"
  ...readPreferences(storage),
};

const viewport = createViewport({
  stage, canvas, zoomLabel, getSettings: () => state,
  onResize(fresh) { state.fresh = fresh; render(); },
});

/* ------------------------------------------------------------------ tema */

const prefersDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () =>
  themes[state.theme]?.dark || state.theme === 'dark' || (state.theme === 'auto' && (vscode ? document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast') : prefersDark.matches));

function mermaidTheme() {
  if (themes[state.theme]) return isDark() ? 'dark' : 'default';
  if (state.theme === 'auto') return isDark() ? 'dark' : 'default';
  return state.theme;
}

function applyChrome() {
  document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
  document.documentElement.dataset.palette = state.theme;
  const palette = themes[state.theme];
  for (const [key, token] of Object.entries({ bg: 'bg', bar: 'bar', fg: 'fg', dim: 'dim', line: 'line', accent: 'accent', btn: 'btn', hover: 'btn-h', grid: 'grid' })) {
    if (palette) document.body.style.setProperty(`--${token}`, palette[key]);
    else document.body.style.removeProperty(`--${token}`);
  }
}

/* --------------------------------------------------- markdown nelle celle */

const prepare = (src) => (state.markdown ? prepareMarkdown(src) : src);

/* ------------------------------------------------------------------ render */

const renderQueue = latestTask(async (snapshot, current) => {
  try {
    const { svg } = await renderDiagram(snapshot.source, snapshot.options);
    if (!current()) return;
    canvas.innerHTML = svg;
    // Keep diagram navigation and external images disabled for both engines.
    canvas.querySelectorAll('a').forEach(el => { el.removeAttribute('href'); el.removeAttribute('xlink:href'); });
    canvas.querySelectorAll('image').forEach(el => el.remove());
    const el = canvas.querySelector('svg');
    if (el) {
      el.style.maxWidth = 'none';
      el.setAttribute('width', el.viewBox.baseVal.width);
      el.setAttribute('height', el.viewBox.baseVal.height);
    }
    errBox.hidden = true;
    $('#drop').classList.add('hide');
    if (state.fresh) {
      if (viewport.framing === 'actual') viewport.centerActual();
      else viewport.fit();
      state.fresh = false;
    } else viewport.applyView();
  } catch (error) {
    if (!current()) return;
    errBox.hidden = false;
    errBox.textContent = (error?.message ?? String(error)).trim();
  }
});
function render() {
  if (!state.source.trim()) {
    renderQueue.invalidate();
    canvas.replaceChildren(); errBox.hidden = true;
    $('#drop').classList.remove('hide'); return;
  }
  return renderQueue.request({ source: prepare(state.source), options: {
    engine: state.engine, responsive: state.responsive,
    width: Math.max(1, stage.clientWidth - 80), theme: mermaidTheme(), palette: state.theme,
  } });
}

/* ------------------------------------------------------------- pan e zoom */

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { files?.close(); closeMenus(true); return; }
  if (e.target.matches('input, select, textarea')) return;
  if (!vscode && (e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); files?.open(); return; }
  if (files?.isOpen || e.metaKey || e.ctrlKey) return;
  const k = e.key;
  if (k === '+' || k === '=') viewport.centerZoom(1.2);
  else if (k === '-' || k === '_') viewport.centerZoom(1 / 1.2);
  else if (k === '0') viewport.centerActual();
  else if (k === 'f' || k === 'F') viewport.fit();
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

const files = vscode ? null : createFileBrowser({
  stage, storage, setSource, getSource: () => state.source, setLive, errBox,
});
// A VS Code preview accepts documents only from its host editor.
if (vscode) {
  stage.addEventListener('dragover', event => event.preventDefault());
  stage.addEventListener('drop', event => event.preventDefault());
}

/* ---------------------------------------------------------------- export */

const exportDiagram = createExporter({
  canvas, vscode, toast,
  getSettings: () => ({ ...state, theme: mermaidTheme(), palette: state.theme }),
});

/* ------------------------------------------------------------------- UI */

$('#open').onclick = () => files?.open();
$('#fit').onclick = () => viewport.fit();
zoomLabel.onclick = viewport.centerActual;
document.querySelectorAll('[data-zoom]').forEach((b) => {
  b.onclick = () => viewport.centerZoom(b.dataset.zoom === 'in' ? 1.2 : 1 / 1.2);
});

function resetFraming() {
  viewport.framing = state.responsive ? 'fit' : 'actual';
  state.fresh = true;
}

$('#md').onchange = (e) => { state.markdown = e.target.checked; storage.setItem('mv-markdown', state.markdown); render(); };
$('#engine').onchange = (e) => {
  state.engine = e.target.value; storage.setItem('mv-engine', state.engine);
  resetFraming(); render();
};
$('#responsive').onchange = (e) => {
  state.responsive = e.target.checked; storage.setItem('mv-responsive', state.responsive);
  resetFraming(); render();
};

const themeSel = $('#theme');
themeSel.onchange = (e) => {
  state.theme = e.target.value;
  storage.setItem('mv-theme', state.theme);
  applyChrome();
  render();
};

const menu = $('#exportMenu');
const optionsMenu = $('#optionsMenu');
const menus = [[menu, $('#exportBtn')], [optionsMenu, $('#optionsBtn')]];
function closeMenus(restoreFocus = false) {
  for (const [panel, button] of menus) {
    if (!panel.hidden && restoreFocus) button.focus();
    panel.hidden = true; button.setAttribute('aria-expanded', 'false');
  }
}
for (const [panel, button] of menus) {
  button.onclick = (e) => {
    e.stopPropagation();
    const opening = panel.hidden;
    closeMenus();
    panel.hidden = !opening; button.setAttribute('aria-expanded', String(opening));
    if (opening) panel.querySelector('button, select, input')?.focus();
  };
  panel.addEventListener('click', e => e.stopPropagation());
}
document.addEventListener('click', () => closeMenus());
document.addEventListener('focusin', e => {
  for (const [panel, button] of menus) {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== button) {
      panel.hidden = true; button.setAttribute('aria-expanded', 'false');
    }
  }
});
menu.onclick = (e) => {
  const what = e.target.closest('[data-export]')?.dataset.export;
  if (!what) return;
  closeMenus(true);
  exportDiagram(what);
};

prefersDark.addEventListener('change', () => {
  if (state.theme === 'auto') { applyChrome(); render(); }
});
/* ------------------------------------------------------------------ boot */

if (vscode) $('#drop').innerHTML = '<p>Il diagramma apparirà qui</p><p class="small">Scrivi nel file aperto a lato per aggiornare l’anteprima.</p>';
let hostLanguage = document.documentElement.dataset.language || navigator.language;
const languageSelect = $('#language');
languageSelect.value = state.language;
// The filename is dynamic and is deliberately excluded from translation bindings.
const emptyFileText = fileLabel.firstChild;
fileLabel.replaceChildren();
fileLabel.removeAttribute('title');
const translateUI = bindTranslations(document.body);
fileLabel.append(emptyFileText);
function applyLanguage() {
  document.documentElement.lang = setLanguage(languageSelect.value === 'auto' ? hostLanguage : languageSelect.value);
  translateUI();
  if (!state.name) { fileLabel.textContent = t('Nessun diagramma'); fileLabel.title = t('nessun file'); }
  files?.drawRecents();
}
languageSelect.onchange = () => { storage.setItem('mv-language', languageSelect.value); applyLanguage(); };
addEventListener('languagechange', () => { if (!vscode) { hostLanguage = navigator.language; applyLanguage(); } });
applyLanguage();

viewport.framing = state.responsive ? 'fit' : 'actual';
$('#engine').value = state.engine;
$('#responsive').checked = state.responsive;
$('#md').checked = state.markdown;
themeSel.value = state.theme;
applyChrome();
viewport.applyView();

const path = new URLSearchParams(location.search).get('path');
if (vscode) {
  new MutationObserver(() => { if (state.theme === 'auto') { applyChrome(); render(); } })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  let defaults;
  addEventListener('message', ({ data }) => {
    if (data?.type !== 'document' || typeof data.text !== 'string') return;
    const nextDefaults = JSON.stringify(data.settings);
    if (defaults !== nextDefaults) {
      const initial = defaults === undefined;
      state.engine = initial && storage.getItem('mv-engine') ? state.engine : data.settings.engine;
      state.responsive = initial && storage.getItem('mv-responsive') !== null ? state.responsive : data.settings.responsive;
      resetFraming();
      $('#engine').value = state.engine; $('#responsive').checked = state.responsive;
      defaults = nextDefaults;
    }
    setSource(data.text, data.name);
    setLive(true, true);
  });
  vscode.postMessage({ type: 'ready' });
} else if (path) {
  files.openPath(path).catch((e) => {
    errBox.hidden = false;
    errBox.textContent = t('Impossibile aprire il file: {error}', { error: e.message });
    files?.open();
  });
} else {
  // avviato senza argomenti: si sceglie da qui
  files?.open();
}
