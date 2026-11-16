export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_FORMAT_HELP = 'Use JPEG/JPG, PNG or WebP. For HEIC/HEIF, open the photo in Photos or Gallery and export/save a JPEG copy (renaming the extension will not convert it). On iPhone, Camera → Formats → Most Compatible saves future photos as JPEG.';
export class ImageSelectionError extends Error {}
const fail = message => { throw new ImageSelectionError(message); };
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Selection cancelled', 'AbortError'); };
function readerBytes(file, signal) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') { reject(new ImageSelectionError('This image could not be read. Choose it again from Gallery or Browse Files.')); return; }
    const reader = new FileReader(), abort = () => reader.abort();
    const finish = callback => value => { signal?.removeEventListener('abort', abort); callback(value); };
    reader.onload = finish(() => resolve(reader.result));
    reader.onerror = finish(() => reject(new ImageSelectionError('This image could not be read. Choose it again from Gallery or Browse Files.')));
    reader.onabort = finish(() => reject(new DOMException('Selection cancelled', 'AbortError')));
    signal?.addEventListener('abort', abort, { once: true });
    try { checkAbort(signal); reader.readAsArrayBuffer(file); } catch (error) { signal?.removeEventListener('abort', abort); reject(error); }
  });
}
async function readBytes(file, signal) {
  checkAbort(signal);
  try { if (typeof file.arrayBuffer === 'function') return await file.arrayBuffer(); } catch { checkAbort(signal); }
  return readerBytes(file, signal);
}
async function boundedBytes(file, signal) {
  const controller=new AbortController();let timer;
  const aborted=()=>controller.abort();signal?.addEventListener('abort',aborted,{once:true});
  try {
    checkAbort(signal);
    return await Promise.race([readBytes(file,controller.signal),new Promise((_,reject)=>{
      controller.signal.addEventListener('abort',()=>reject(new DOMException('Selection cancelled','AbortError')),{once:true});
      timer=setTimeout(()=>{reject(new ImageSelectionError('This image took too long to read. Choose it again from Gallery or Browse Files.'));controller.abort();},30000);
    })]);
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',aborted);}
}
function signature(bytes) {
  const b = new Uint8Array(bytes), ascii = (start,end) => String.fromCharCode(...b.slice(start,end));
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v)) return 'image/png';
  if (b.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
  return null;
}
// Mirror the server container rules before a browser's more tolerant decoder.
// A preview alone can accept truncated JPEGs and animated PNG/WebP files.
export function validateImageContainer(bytes, type) {
  const b = new Uint8Array(bytes), view = new DataView(bytes);
  const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));
  const invalid = () => fail('This image is incomplete or damaged. Export a new JPEG, PNG or WebP copy and try again.');
  if (type === 'image/jpeg') {
    if (b.length < 4 || b.at(-2) !== 255 || b.at(-1) !== 217) invalid();
  } else if (type === 'image/png') {
    let offset = 8, data = false, ended = false;
    while (offset + 12 <= b.length) {
      const size = view.getUint32(offset), chunk = ascii(offset + 4, offset + 8);
      if (offset + size + 12 > b.length) invalid();
      if (chunk === 'acTL') fail('Animated images cannot be printed. Export one still frame as JPEG or PNG.');
      if (chunk === 'IDAT' && size > 0) data = true;
      offset += size + 12;
      if (chunk === 'IEND') { ended = size === 0 && offset === b.length; break; }
    }
    if (!data || !ended) invalid();
  } else if (type === 'image/webp') {
    if (b.length < 20 || view.getUint32(4, true) + 8 !== b.length) invalid();
    let offset = 12;
    while (offset + 8 <= b.length) {
      const size = view.getUint32(offset + 4, true), chunk = ascii(offset, offset + 4);
      if (offset + 8 + size > b.length) invalid();
      if (chunk === 'ANIM' || chunk === 'ANMF' || chunk === 'VP8X' && size && (b[offset + 8] & 2)) fail('Animated images cannot be printed. Export one still frame as JPEG or PNG.');
      offset += 8 + size + (size % 2);
    }
    if (offset !== b.length) invalid();
  }
}
export async function inspectSelectedImage(file) {
  const url = URL.createObjectURL(file), image = new Image();let timer;
  try {
    await new Promise((resolve,reject) => {
      timer = setTimeout(() => reject(new ImageSelectionError('This image could not be previewed. Choose a compatible JPEG, PNG or WebP copy.')), 15000);
      image.onload = resolve;image.onerror = () => reject(new ImageSelectionError('This image could not be previewed. Choose a compatible JPEG, PNG or WebP copy.'));image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 12000 || image.naturalHeight > 12000 || image.naturalWidth * image.naturalHeight > 40000000) fail('Choose a smaller image, up to 12,000 pixels per side and 40 megapixels.');
  } finally { clearTimeout(timer);image.onload = null;image.onerror = null;image.src = '';URL.revokeObjectURL(url); }
}
// Keep the native input mounted and populated until the entire operation settles.
// Retaining a browser File alone is unreliable for some Android content providers.
export async function prepareSelectedImages(selected, { maxBytes = 10 * 1024 * 1024, maxFiles = 1, maxTotalBytes = maxBytes * maxFiles, acceptedTypes = IMAGE_TYPES, signal, inspect = inspectSelectedImage } = {}) {
  const files = Array.from(selected || []);
  if (!files.length) return [];
  if (files.length > maxFiles) fail(`Select no more than ${maxFiles} images.`);
  if (files.some(f => !Number.isSafeInteger(f.size) || !f.size)) fail(`This file is empty. ${IMAGE_FORMAT_HELP}`);
  if (files.some(f => f.size > maxBytes) || files.reduce((n,f) => n+f.size,0) > maxTotalBytes) fail(`Each image must be ${Math.round(maxBytes / 1048576)} MB or smaller and within this selection's total limit.`);
  if (files.some(f => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name))) fail(IMAGE_FORMAT_HELP);
  const prepared = [];
  for (const file of files) {
    checkAbort(signal);const bytes = await boundedBytes(file, signal);checkAbort(signal);
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== file.size) fail('The selected image could not be fully read. Choose it again from Gallery or Browse Files.');
    const type = signature(bytes), declared = file.type?.toLowerCase();
    if (!type) fail(`The file contents are not a supported image, even if its name ends in .jpg. ${IMAGE_FORMAT_HELP}`);
    const normalized = ['image/jpg', 'image/pjpeg'].includes(declared) ? 'image/jpeg' : declared;
    if (!acceptedTypes.includes(type)) fail(`This field does not accept ${type.replace('image/', '').toUpperCase()}. Choose ${acceptedTypes.map(value => value.replace('image/', '').toUpperCase()).join(', ')}.`);
    if (normalized && normalized !== 'application/octet-stream' && normalized !== type) fail('The image format does not match its file information. Export a new JPEG, PNG or WebP copy; changing the filename alone will not fix it.');
    validateImageContainer(bytes, type);
    const owned = new File([bytes], file.name || 'selected-image', { type, lastModified: Number.isFinite(file.lastModified) ? file.lastModified : Date.now() });
    await inspect(owned);checkAbort(signal);prepared.push(owned);
  }
  return prepared;
}
