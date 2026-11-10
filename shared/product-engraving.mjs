import { FONT_REGISTRY, APPEARANCES } from './engraving/definitions.mjs';
export const productArtworkIds = spec => (spec?.design?.layers || []).filter(layer => layer.type === 'image').map(layer => layer.assetId);
export const productSurfaceId = (id, version) => `product-surface-${id}-${version}`;
export function productEngravingCapable(product) {
  const c = product?.productEngraving;
  return Boolean(c && Number.isSafeInteger(c.version) && c.version > 0 && (c.mode === 'text' || product.galleryKeys?.includes(c.imageKey) && c.width > 0 && c.height > 0) && (c.colorIds === undefined || c.colorIds.length > 0 && c.colorIds.every(id => APPEARANCES.includes(id))) && c.fontIds?.length && c.fontIds.every(id => FONT_REGISTRY.some(font => font.id === id)) && c.materials?.length);
}

export const productEngravingColors = configuration => configuration?.colorIds || APPEARANCES;
