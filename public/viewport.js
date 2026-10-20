/** Pan, zoom and resize behavior shared by browser and VS Code. */
export function createViewport({ stage, canvas, zoomLabel, getSettings, onResize }) {
  let view = { x: 0, y: 0, k: 1 };
  let framing = 'fit';
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
    const { x, y, k } = view;
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

  function centerActual() {
    framing = 'actual';
    centerDiagram(1);
  }

  function centerDiagram(scale) {
    const s = svgSize();
    if (!s) return;
    view = { k: scale, x: (stage.clientWidth - s.w * scale) / 2, y: (stage.clientHeight - s.h * scale) / 2 };
    applyView();
  }

  function fit(pad = Math.min(40, stage.clientWidth * 0.07)) {
    framing = 'fit';
    const s = svgSize();
    if (!s) return;
    const k = Math.min((stage.clientWidth - pad * 2) / s.w, (stage.clientHeight - pad * 2) / s.h);
    view.k = k > 0 ? k : 1;
    view.x = (stage.clientWidth - s.w * view.k) / 2;
    view.y = (stage.clientHeight - s.h * view.k) / 2;
    applyView();
  }

  /** Zoom centrato su un punto dello schermo: il punto resta fermo. */
  function zoomAt(cx, cy, factor) {
    framing = 'manual';
    const { x, y, k } = view;
    const nk = Math.max(0.001, Math.min(1000, k * factor));
    view.k = nk;
    view.x = cx - (cx - x) * (nk / k);
    view.y = cy - (cy - y) * (nk / k);
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
      framing = 'manual';
      view.x -= e.deltaX;
      view.y -= e.deltaY;
      applyView();
    }
  }, { passive: false });

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('panning');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    framing = 'manual';
    view.x = drag.x + (e.clientX - drag.px);
    view.y = drag.y + (e.clientY - drag.py);
    applyView();
  });
  const endDrag = () => { drag = null; stage.classList.remove('panning'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', () => fit());

  let resizeTimer;
  let stageWidth = stage.clientWidth, stageHeight = stage.clientHeight;
  new ResizeObserver(() => {
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    const widthChanged = width !== stageWidth;
    const heightChanged = height !== stageHeight;
    if (!widthChanged && !heightChanged) return;
    // Preserve the point under the viewport center while the editor divider moves.
    view.x += (width - stageWidth) / 2;
    view.y += (height - stageHeight) / 2;
    stageWidth = width; stageHeight = height;
    applyView();
    if (widthChanged && getSettings().responsive && getSettings().engine === 'pele') {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        onResize(framing !== 'manual');
      }, 120);
    } else if (framing === 'fit') fit();
    else if (framing === 'actual') centerActual();
  }).observe(stage);

  return {
    fit, centerActual, centerZoom, applyView,
    get framing() { return framing; },
    set framing(value) { framing = value; },
  };
}
