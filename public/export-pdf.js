import { lazyScript } from './async.js';
import { t } from './i18n.js';
import { rasterize } from './export-image.js';

const loadPDF = lazyScript(
  new URL('./vendor/jspdf.umd.min.js', import.meta.url).href,
  () => globalThis.jspdf.jsPDF,
  () => t('pdfLoadFailed'),
);

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
