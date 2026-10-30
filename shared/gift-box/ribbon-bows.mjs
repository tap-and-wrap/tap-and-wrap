import { RIBBON_COLORS } from './definitions.mjs';

// Separate, unapproved local bow collection. Never make these public without
// an owner-reviewed, versioned asset manifest and publication action.
export const RIBBON_BOW_VERSION = 'ribbon-bows-v1';
export const RIBBON_BOW_FILES = Object.freeze(RIBBON_COLORS.map(([color]) => Object.freeze({
  componentId: `ribbon-${color}`, filename: `ribbon-${color}-bow.webp`,
})));
export function ribbonBowFilename(componentId) {
  return RIBBON_BOW_FILES.find(item => item.componentId === componentId)?.filename ?? null;
}
export function ribbonBowLocalUrl(componentId) {
  const filename = ribbonBowFilename(componentId);
  return filename ? `/__gift-box-ribbon-bows/${RIBBON_BOW_VERSION}/${filename}` : null;
}
