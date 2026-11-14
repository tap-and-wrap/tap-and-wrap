const fonts = new Map(), metrics = new Map();
let canvas;
export function loadArtworkFont(family) {
  if (!fonts.has(family)) {
    const loading = document.fonts.load(`100px "${family}"`).catch(error => { fonts.delete(family); throw error; });
    fonts.set(family, loading);
  }
  return fonts.get(family);
}
export function artworkMetrics(text, family) {
  const loaded = document.fonts.check(`100px "${family}"`);
  const key = JSON.stringify([text, family, loaded]);
  if (metrics.has(key)) return metrics.get(key);
  canvas ||= document.createElement('canvas').getContext('2d');
  canvas.font = `100px "${family}"`;
  const lines = text.split('\n');
  const result = { width: Math.max(100, ...lines.map(line => { const measured = canvas.measureText(line); return Math.max(measured.width, measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight); })), lines: lines.length };
  if (metrics.size >= 256) metrics.delete(metrics.keys().next().value);
  metrics.set(key, result);
  return result;
}
