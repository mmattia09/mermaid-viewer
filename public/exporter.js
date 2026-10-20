import { t } from './i18n.js';
import { prepareMarkdown } from './md-labels.js';
import { renderDiagram } from './renderers.js';
import { rasterize } from './export-image.js';

/** Export data is captured synchronously, before any rendering or conversion. */
export function createExporter({ canvas, vscode, getSettings, toast }) {
  function capture() {
    const appearance = {};
    const style = getComputedStyle(canvas);
    for (const name of ['bg', 'fg', 'muted', 'line', 'surface', 'surface-alt', 'border', 'accent', 'critical', 'error', 'font', 'font-mono']) {
      appearance[`--pele-${name}`] = style.getPropertyValue(`--pele-${name}`).trim();
    }
    appearance['--bg'] = style.getPropertyValue('--bg').trim();
    return { ...getSettings(), appearance, svg: exportSvgString(appearance) };
  }
  /** SVG autoconsistente: dimensioni esplicite e sfondo opaco. */
  function selfContained(el, appearance) {
    const vb = el.viewBox.baseVal;
    const w = vb.width || el.clientWidth;
    const h = vb.height || el.clientHeight;
    const clone = el.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    // Resolve inherited Pele variables so exported SVG/PNG remains theme-independent.
    const style = appearance;
    for (const name of ['bg','fg','muted','line','surface','surface-alt','border','accent','critical','error','font','font-mono']) {
      const value = style[`--pele-${name}`];
      if (value) clone.style.setProperty(`--pele-${name}`, value);
    }

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', style['--bg']);
    clone.insertBefore(bg, clone.firstChild);

    return { text: new XMLSerializer().serializeToString(clone), w, h };
  }

  function exportSvgString(appearance) {
    const el = canvas.querySelector('svg');
    return el ? selfContained(el, appearance) : null;
  }

  /** Il canvas rifiuta di rasterizzare un SVG che contiene <foreignObject>
   *  (SecurityError: tainted). Per il PNG si rifà quindi il render con
   *  htmlLabels:false, che emette <text>. Non sempre riesce: i diagrammi con
   *  etichette multiriga non sono rappresentabili in quella modalità. */
  async function rasterSource(snapshot) {
    if (snapshot.engine === 'pele') return snapshot.svg;
    for (const src of new Set([snapshot.markdown ? prepareMarkdown(snapshot.source) : snapshot.source, snapshot.source])) {
      try {
        const { svg } = await renderDiagram(src, { engine: 'mermaid', theme: snapshot.theme, palette: snapshot.palette, raster: true });
        if (/<foreignObject/.test(svg)) continue;
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-99999px;top:0';
        host.innerHTML = svg;
        document.body.appendChild(host);
        try {
          return selfContained(host.querySelector('svg'), snapshot.appearance);
        } finally {
          host.remove();
        }
      } catch {
        /* si prova la variante successiva */
      }
    }
    return null;
  }

  function download(blob, ext, name) {
    if (vscode) {
      const reader = new FileReader();
      reader.onload = () => vscode.postMessage({ type: 'export', ext, data: reader.result.split(',')[1] });
      reader.readAsDataURL(blob); return;
    }
    const base = (name || t('diagramma')).replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(t('Esportato {file}', { file: `${base}.${ext}` }));
  }

  function exportSVG(snapshot) {
    const out = snapshot.svg;
    if (out) download(new Blob([out.text], { type: 'image/svg+xml' }), 'svg', snapshot.name);
  }

  async function exportPNG(snapshot, scale) {
    if (!snapshot.svg) return;
    toast(t('Preparo il PNG…'));
    try {
      const out = await rasterSource(snapshot);
      if (!out) throw new Error(t('PNG non disponibile per questo diagramma: usa SVG'));
      const image = await rasterize(out, scale);
      const blob = await new Promise(resolve => image.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(t('Canvas vuoto'));
      download(blob, 'png', snapshot.name);
    } catch (error) { toast(error.message || t('Export PNG non riuscito')); }
  }

  let exportingPDF = false;
  async function exportExtensionPDF(snapshot) {
    if (exportingPDF || !snapshot.svg) return;
    exportingPDF = true;
    toast(t('Preparo il PDF…'));
    try {
      const out = await rasterSource(snapshot);
      if (!out) throw new Error(t('PDF non disponibile per queste etichette Mermaid: usa SVG o il motore Pele'));
      const { createPDF } = await import('./export-pdf.js');
      download(await createPDF(out), 'pdf', snapshot.name);
    } catch (error) { toast(error.message || t('Export PDF non riuscito')); }
    finally { exportingPDF = false; }
  }

  /** PDF vettoriale passando dalla stampa del browser (“Salva come PDF”). */
  function exportPDF(snapshot) {
    if (vscode) { void exportExtensionPDF(snapshot); return; }
    const out = snapshot.svg;
    if (!out) return;
    const w = window.open('', '_blank');
    if (!w) { toast(t('Il browser ha bloccato la finestra')); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${t("diagramma")}</title>
  <style>
    @page { size: ${Math.ceil(out.w)}px ${Math.ceil(out.h)}px; margin: 0 }
    html,body { margin:0; padding:0 }
    svg { display:block }
  </style></head><body>${out.text}</body></html>`);
    w.document.close();
    w.addEventListener('load', () => { w.focus(); w.print(); });
  }

  return function exportDiagram(format) {
    const snapshot = capture();
    if (format === 'svg') exportSVG(snapshot);
    else if (format === 'pdf') exportPDF(snapshot);
    else if (/^png@(1|2|4)$/.test(format)) void exportPNG(snapshot, Number(format.split('@')[1]));
  };
}
