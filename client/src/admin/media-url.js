const mediaBase = (import.meta.env.VITE_CATALOG_MEDIA_BASE_URL || 'https://media.tapandwrap.net').replace(/\/+$/, '');
export function catalogImageUrl(key) {
  if (typeof key !== 'string' || !key || key.length > 500 || /[:\\\x00-\x1f\x7f?#%]/.test(key) || key.startsWith('/')
      || key.split('/').some(part => !part || part === '.' || part === '..')) return '';
  return `${mediaBase}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
export function imageSizesForManaged(url) {
  const parts = /^(.*\/managed\/v1\/(?:product|category)\/[a-f0-9]{64}\/)(?:1600|1200|640|320)\.webp$/.exec(url || '');
  if (!parts) return undefined;
  return `${parts[1]}320.webp 320w, ${parts[1]}640.webp 640w, ${parts[1]}${url.includes('/category/') ? '1200' : '1600'}.webp ${url.includes('/category/') ? 1200 : 1600}w`;
}
