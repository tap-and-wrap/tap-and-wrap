// Decode common non-uploadable consumer image formats locally. Private source
// bytes never leave the device during conversion. Uploads remain restricted to
// validated JPEG/PNG/WebP bytes by the existing server contract.
const HEIC = /\.(?:heic|heif)$/i;
const RASTER = /\.(?:gif|bmp|avif)$/i;
const extraMime = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence', 'image/gif', 'image/bmp', 'image/x-ms-bmp', 'image/avif']);
export const canNormalizeImage = file => HEIC.test(file.name || '') || RASTER.test(file.name || '') || extraMime.has(file.type?.toLowerCase());

const jpegName = name => `${(name || 'photo').replace(/\.[^.]*$/, '').slice(0, 110) || 'photo'}.jpg`;
function blobFromCanvas(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('This image could not be converted.')), 'image/jpeg', quality));
}
async function canvasJPEG(file, {signal, maxBytes}) {
  if (signal?.aborted) throw new DOMException('Selection cancelled', 'AbortError');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Image decoding took too long.')), 20000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(Error('This image cannot be decoded on this device.')); };
      image.src = url;
    });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width > 12000 || height > 12000 || width * height > 40_000_000) throw Error('Choose an image up to 40 megapixels.');
    let factor = Math.min(1, 4000 / Math.max(width, height));
    for (let attempt = 0; attempt < 4; attempt++) {
      if (signal?.aborted) throw new DOMException('Selection cancelled', 'AbortError');
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * factor));
      canvas.height = Math.max(1, Math.round(height * factor));
      canvas.getContext('2d', {alpha: false}).drawImage(image, 0, 0, canvas.width, canvas.height);
      const converted = await blobFromCanvas(canvas, attempt < 2 ? .88 : .78);
      canvas.width = canvas.height = 0;
      if (converted.size <= maxBytes) return converted;
      factor *= .75;
    }
    throw Error('Converted image exceeds the upload size limit.');
  } finally { image.onload = image.onerror = null; image.src = ''; URL.revokeObjectURL(url); }
}
export async function normalizeConsumerImage(file, { signal, maxBytes }) {
  const isHeic = HEIC.test(file.name || '') || /heic|heif/i.test(file.type || '');
  let source = file;
  if (isHeic) {
    try {
      // Lazy-loaded only when an HEIC/HEIF photo is actually selected.
      const module = await import('heic2any');
      const convert = module.default?.default || module.default || module;
      const result = await convert({ blob: file, toType: 'image/jpeg', quality: .88 });
      source = Array.isArray(result) ? result[0] : result;
      if (!(source instanceof Blob) || !source.size) throw Error('Empty converted image.');
    } catch {
      if (signal?.aborted) throw new DOMException('Selection cancelled', 'AbortError');
      // Native HEIF support on Safari is still worth trying if the converter
      // cannot handle the camera's particular HEIC variation.
      try { return new File([await canvasJPEG(file, {signal,maxBytes})], jpegName(file.name), {type: 'image/jpeg', lastModified: file.lastModified}); }
      catch { throw Error('This HEIC/HEIF photo could not be converted on this device. Choose another image or save it as JPEG.'); }
    }
  }
  try {
    const jpeg = await canvasJPEG(source, {signal,maxBytes});
    return new File([jpeg], jpegName(file.name), {type: 'image/jpeg',lastModified:file.lastModified});
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Selection cancelled', 'AbortError');
    throw Error(isHeic ? 'This HEIC/HEIF photo could not be converted on this device. Choose another photo or save it as JPEG.' : 'This image format cannot be converted on this device.');
  }
}
