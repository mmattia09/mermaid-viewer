import { t } from './i18n.js';
import { mermaidColors } from './themes.js';
let pele;
let mermaid;
let queue = Promise.resolve();
let nextId = 0;

export const baseConfig = {
  startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  flowchart: { htmlLabels: true, useMaxWidth: false, padding: 18 },
  htmlLabels: true, markdownAutoWrap: true,
};

function loadMermaid() {
  return mermaid ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/mermaid.min.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.mermaid);
    script.onerror = () => { mermaid = null; script.remove(); reject(new Error(t('Caricamento Mermaid non riuscito'))); };
    document.head.append(script);
  });
}

export async function renderDiagram(source, { engine = 'pele', responsive = true, width, theme = 'default', palette, raster = false } = {}) {
  if (source.length > 50000) throw new Error(t('Il diagramma supera il limite di 50.000 caratteri'));
  if (engine === 'pele') {
    const api = await (pele ??= import('./vendor/pele/lazy.js'));
    return api.renderAsync(source, {
      responsive, autoDirection: responsive,
      ...(responsive && width > 0 ? { maxWidth: width } : {}),
      links: false, images: false,
    });
  }
  // Mermaid has global configuration: exports and preview renders must be serialized.
  const run = queue.then(async () => {
    const api = await loadMermaid();
    const id = `diagram${++nextId}`;
    api.initialize({ ...baseConfig, theme: mermaidColors(palette) ? 'base' : theme, themeVariables: mermaidColors(palette), htmlLabels: !raster,
      flowchart: { ...baseConfig.flowchart, htmlLabels: !raster } });
    try { return await api.render(id, source); }
    finally { document.getElementById(id)?.remove(); }
  });
  queue = run.catch(() => {});
  return run;
}
