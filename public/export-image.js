// Shared limits prevent empty canvases or excessive allocations on huge diagrams.
export function rasterDimensions(width, height, scale = 2) {
  if (![width, height, scale].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('Dimensioni del diagramma non valide');
  }
  scale = Math.min(scale, 16384 / width, 16384 / height, Math.sqrt(32_000_000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}

export async function rasterize(out, scale = 2) {
  const size = rasterDimensions(out.w, out.h, scale);
  const url = URL.createObjectURL(new Blob([out.text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Impossibile convertire il diagramma in immagine'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas non disponibile');
    context.drawImage(img, 0, 0, size.width, size.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
