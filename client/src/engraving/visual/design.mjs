import { FONT_REGISTRY, APPEARANCES } from '../../../../shared/engraving/definitions.mjs';

export const VISUAL_DESIGN_VERSION = 'visual-engraving-v1';
export const MAX_LAYERS = 12;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const only = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(field => fields.includes(field));
const fail = () => { throw new Error('This saved design could not be opened.'); };

export function emptyDesign() {
  return { version: VISUAL_DESIGN_VERSION, surface: null, layers: [] };
}

/** Strict allowlist. No URLs, file names, bytes, prices or legacy order fields. */
export function validateDesign(value) {
  if (!only(value, ['version', 'surface', 'layers']) || value.version !== VISUAL_DESIGN_VERSION || !Array.isArray(value.layers) || value.layers.length > MAX_LAYERS) fail();
  if (value.surface !== null && (!only(value.surface, ['assetId', 'aspectRatio']) || !key(value.surface.assetId) || !finite(value.surface.aspectRatio, .05, 20))) fail();
  if (!value.surface && value.layers.length) fail();
  const ids = new Set();
  for (const layer of value.layers) {
    const fields = ['id', 'type', 'x', 'y', 'width', 'aspectRatio', ...(layer?.type === 'text' ? ['text', 'fontId', 'color'] : ['assetId'])];
    if (!only(layer, fields) || !key(layer.id) || ids.has(layer.id) || !['text', 'image'].includes(layer.type) || !finite(layer.x, 0, 1) || !finite(layer.y, 0, 1) || !finite(layer.width, .0001, 1) || !finite(layer.aspectRatio, .05, 40)) fail();
    ids.add(layer.id);
    if (layer.type === 'image' && (!key(layer.assetId) || layer.assetId === value.surface.assetId)) fail();
    if (layer.type === 'text' && (typeof layer.text !== 'string' || [...layer.text].length > 500 || !layer.text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(layer.text) || !FONT_REGISTRY.some(font => font.id === layer.fontId) || !APPEARANCES.includes(layer.color) || /\p{Script=Arabic}/u.test(layer.text) && FONT_REGISTRY.find(font => font.id === layer.fontId)?.language !== 'ar')) fail();
    const bounded = fitLayer(layer, value.surface.aspectRatio);
    if (['x', 'y', 'width'].some(field => Math.abs(bounded[field] - layer[field]) > .000001)) fail();
  }
  return structuredClone(value);
}

/** Coordinates refer to the full, uncropped surface, never the viewport. */
export function fitLayer(layer, surfaceRatio) {
  const maxWidth = Math.min(1, layer.aspectRatio / surfaceRatio);
  const width = clamp(layer.width, Math.min(.04, maxWidth), maxWidth);
  const height = width * surfaceRatio / layer.aspectRatio;
  return { ...layer, width, x: clamp(layer.x, width / 2, 1 - width / 2), y: clamp(layer.y, height / 2, 1 - height / 2) };
}
export const layerHeight = (layer, surfaceRatio) => layer.width * surfaceRatio / layer.aspectRatio;
export function editLayer(design, id, patch) {
  return { ...design, layers: design.layers.map(layer => layer.id === id ? fitLayer({ ...layer, ...patch }, design.surface.aspectRatio) : layer) };
}
export function createVisualDraft(ownerScope, design) {
  if (typeof ownerScope !== 'string' || !ownerScope) fail();
  return { ownerScope, design: validateDesign(design) };
}
export function restoreVisualDraft(draft, ownerScope) {
  if (!draft || draft.ownerScope !== ownerScope) fail();
  return validateDesign(draft.design);
}
/** Host integration readiness only; never a price, stock or checkout approval. */
export function designReadiness(design, { approvedFontIds = [], availableAssetIds = [] } = {}) {
  const checked = validateDesign(design), issues = [];
  if (!checked.surface || !availableAssetIds.includes(checked.surface.assetId)) issues.push('surface_unavailable');
  if (!checked.layers.length) issues.push('design_empty');
  for (const layer of checked.layers) {
    if (layer.type === 'image' && !availableAssetIds.includes(layer.assetId)) issues.push('artwork_unavailable');
    if (layer.type === 'text' && !layer.text.trim()) issues.push('text_empty');
    if (layer.type === 'text' && !approvedFontIds.includes(layer.fontId)) issues.push('font_unapproved');
  }
  return { ready: issues.length === 0, issues: [...new Set(issues)] };
}
export const newHistory = value => ({ past: [], present: value, future: [] });
export function commitHistory(history, next) {
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return { past: [...history.past, history.present].slice(-60), present: next, future: [] };
}
export function undoHistory(history) {
  return history.past.length ? { past: history.past.slice(0, -1), present: history.past.at(-1), future: [history.present, ...history.future] } : history;
}
export function redoHistory(history) {
  return history.future.length ? { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) } : history;
}
