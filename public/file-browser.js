import { t } from './i18n.js';

export function createFileBrowser({ stage, storage, setSource, getSource, setLive, errBox }) {
  const $ = selector => document.querySelector(selector);
  /** Modalità 1: il server conosce il path e ci manda gli aggiornamenti via SSE.
   *  È la strada buona — funziona su ogni browser e su share di rete. */
  let stream = null;
  let handleTimer;
  let watchGeneration = 0;
  function stopWatching() {
    watchGeneration++;
    stream?.close(); stream = null;
    clearTimeout(handleTimer);
  }
  addEventListener('pagehide', stopWatching);

  function watchServer(path) {
    stopWatching();
    stream = new EventSource(`/api/watch?path=${encodeURIComponent(path)}`);
    stream.onopen = () => setLive(true);
    stream.onerror = () => setLive(false);
    stream.onmessage = (ev) => {
      const { text } = JSON.parse(ev.data);
      if (text === getSource()) return;
      setSource(text);
      setLive(true, true);
    };
  }

  /** Apre un file per path assoluto: è ciò che fanno selettore, recenti e URL. */
  let openSequence = 0;
  async function openPath(path) {
    const sequence = ++openSequence;
    const r = await fetch(`/api/open?path=${encodeURIComponent(path)}`);
    const d = await r.json();
    if (sequence !== openSequence) return;
    if (d.error) throw new Error(d.error);
    setSource(d.text, d.name, { reset: true });
    watchServer(d.path);
    remember(d.path);
    history.replaceState(null, '', `/?path=${encodeURIComponent(d.path)}`);
    storage.setItem('mv-dir', d.path.replace(/\/[^/]*$/, ''));
  }

  /** Modalità 2: handle del File System Access API, con polling su lastModified. */
  function watchHandle(handle) {
    stopWatching();
    const generation = watchGeneration;
    let last = -1;
    setLive(true);
    const tick = async () => {
      try {
        const f = await handle.getFile();
        const text = f.lastModified !== last ? await f.text() : null;
        if (generation !== watchGeneration) return;
        last = f.lastModified;
        if (text !== null && text !== getSource()) { setSource(text, f.name); setLive(true, true); }
      } catch { if (generation === watchGeneration) setLive(false); }
      if (generation === watchGeneration) handleTimer = setTimeout(tick, 700);
    };
    tick();
  }

  /* -------------------------------------------------------- selettore file */

  const picker = $('#picker');
  const listing = $('#listing');
  const crumbs = $('#crumbs');

  const recents = () => {
    try { const value = JSON.parse(storage.getItem('mv-recents') || '[]'); return Array.isArray(value) ? value.filter(p => typeof p === 'string') : []; } catch { return []; }
  };

  function remember(path) {
    const list = [path, ...recents().filter((p) => p !== path)].slice(0, 6);
    storage.setItem('mv-recents', JSON.stringify(list));
    drawRecents();
  }

  function drawRecents() {
    const list = recents();
    const box = $('#recents');
    box.replaceChildren();
    if (!list.length) return;
    box.append(Object.assign(document.createElement('b'), { textContent: t('recent') }));
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
      errBox.textContent = t('openFailed', { error: e.message });
    }
  }

  let directoryRequest = 0;
  async function loadDir(dir) {
    const request = ++directoryRequest;
    let d;
    try {
      const response = await fetch(`/api/browse?path=${encodeURIComponent(dir)}`);
      d = await response.json();
    } catch (error) {
      if (request === directoryRequest) listing.textContent = error.message;
      return;
    }
    if (request !== directoryRequest) return;
    if (d.error) { listing.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: d.error })); return; }

    storage.setItem('mv-dir', d.path);

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
        { className: 'empty', textContent: t('noDiagrams') }));
    }
  }

  function openPicker() {
    picker.hidden = false;
    drawRecents();
    void loadDir(storage.getItem('mv-dir') || '');   // vuoto = prima radice
  }

  $('#pickerClose').onclick = () => { picker.hidden = true; };
  picker.onclick = (e) => { if (e.target === picker) picker.hidden = true; };

  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
  stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    stage.classList.remove('dragover');
    openSequence++; // A dropped file supersedes any pending picker request.
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
    if (f) { stopWatching(); setSource(await f.text(), f.name, { reset: true }); setLive(false); }
  });

  return { open: openPicker, openPath, drawRecents, close() { picker.hidden = true; }, get isOpen() { return !picker.hidden; } };
}
