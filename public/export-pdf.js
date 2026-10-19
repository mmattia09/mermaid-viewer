import { t } from './i18n.js';
import { rasterize } from './export-image.js';

let library;
function loadPDF() {
  return library ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/jspdf.umd.min.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.jspdf.jsPDF);
    script.onerror = () => {
      library = null; script.remove();
      reject(new Error(t('Caricamento del modulo PDF non riuscito')));
    };
    document.head.append(script);
  });
}

export async function createPDF(out) {
  const canvas = await rasterize(out, 2);
  const jsPDF = await loadPDF();
  // SVG pixels are 96 dpi, PDF points 72 dpi. Keep within the PDF page-size limit.
  const factor = Math.min(0.75, 14400 / out.w, 14400 / out.h);
  const width = out.w * factor, height = out.h * factor;
  const pdf = new jsPDF({ unit: 'pt', format: [width, height], orientation: width > height ? 'landscape' : 'portrait', compress: true });
  pdf.addImage(canvas, 'PNG', 0, 0, width, height, undefined, 'FAST');
  return pdf.output('blob');
}
