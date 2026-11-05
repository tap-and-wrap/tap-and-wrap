import { stickerStyle, STICKER_APPLICATION } from './sticker-styles.mjs';
import { ENGRAVING_COLORS, LETTERING_STYLES, MAX_ENGRAVING_CODEPOINTS, MAX_ENGRAVING_LINES, MAX_GIFT_PHOTOS, validateDraftEngraving } from './lettering-styles.mjs';
import { deepFreeze } from './definitions.mjs';

// Phase 6B.8A: strict shape of a FUTURE gift-box personalization proposal.
// Validation here never verifies private upload ownership, licensed artwork,
// approved physical fit, manufacturing availability or prices. Never treat a
// parsed proposal as an order-ready snapshot or an upload receipt.
export const GIFT_BOX_PERSONALIZATION_INTENT_VERSION = 'gift-box-personalization-intent-v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, required) => object(value)
  && Object.keys(value).length === required.length
  && required.every(key => Object.hasOwn(value, key));
const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value);
const uploadId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const unit = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const fail = () => { throw new Error('Invalid gift-box personalization intent.'); };
const acceptedStyles = new Set(LETTERING_STYLES.map(style => style.id));
const acceptedColors = new Set(ENGRAVING_COLORS.map(color => color.id));

export function parseGiftBoxPersonalizationIntent(raw) {
  const v2 = raw?.version === 'gift-box-personalization-intent-v2';
  if (!exact(raw, v2 ? ['version','photoPrints','engravings','sticker'] : ['version', 'photoPrints', 'engravings']) || !v2 && raw.version !== GIFT_BOX_PERSONALIZATION_INTENT_VERSION
    || !Array.isArray(raw.photoPrints) || raw.photoPrints.length > MAX_GIFT_PHOTOS
    || !Array.isArray(raw.engravings) || raw.engravings.length > MAX_ENGRAVING_LINES) fail();
  const seen = new Set();
  const photoPrints = raw.photoPrints.map((photo, index) => {
    if (!exact(photo, v2 && Object.hasOwn(photo,'aspectRatio') ? ['uploadId','printOptionId','zone','x','y','aspectRatio'] : ['uploadId', 'printOptionId', 'zone', 'x', 'y'])
      || !uploadId(photo.uploadId) || seen.has(photo.uploadId) || !slug(photo.printOptionId)
      || !['inside', 'beside'].includes(photo.zone) || !unit(photo.x) || !unit(photo.y)) fail();
    if (photo.aspectRatio !== undefined && (!v2 || !Number.isFinite(photo.aspectRatio) || photo.aspectRatio < 1/12000 || photo.aspectRatio > 12000)) fail();
    if (v2 && photo.aspectRatio === undefined && (photo.x > .880001 || photo.y > .840001)) fail();
    seen.add(photo.uploadId);
    // Array position is intentional print order; no browser UUID, object URL,
    // filename, R2 storage key or raw File can cross this boundary.
    return { uploadId: photo.uploadId, printOptionId: photo.printOptionId, zone: photo.zone,
      x: Object.is(photo.x, -0) ? 0 : photo.x, y: Object.is(photo.y, -0) ? 0 : photo.y, ...(photo.aspectRatio !== undefined ? {aspectRatio:photo.aspectRatio} : {}) };
  });
  const engravings = raw.engravings.map(engraving => {
    if (!exact(engraving, ['text', 'styleId', 'colorId', 'surfaceOptionId'])
      || !validateDraftEngraving(engraving.text) || !engraving.text.trim()
      || [...engraving.text].length > MAX_ENGRAVING_CODEPOINTS
      || !acceptedStyles.has(engraving.styleId) || !acceptedColors.has(engraving.colorId)
      || !slug(engraving.surfaceOptionId)) fail();
    // Unicode, spacing, Arabic and date literals must never be silently trimmed.
    return { text: engraving.text, styleId: engraving.styleId, colorId: engraving.colorId,
      surfaceOptionId: engraving.surfaceOptionId };
  });
  let sticker = null;
  if (v2) {
    if (engravings.length) fail();
    const line = raw.sticker;
    if (line !== null) {
      if (!exact(line, ['text','styleId','colorId','optionId','application']) || !validateDraftEngraving(line.text) || !line.text.trim()
        || !stickerStyle(line.styleId) || !acceptedColors.has(line.colorId) || !slug(line.optionId) || line.application !== STICKER_APPLICATION) fail();
      sticker = { text: line.text, styleId: line.styleId, colorId: line.colorId, optionId: line.optionId, application: STICKER_APPLICATION };
    }
  }
  return deepFreeze({ version: raw.version, photoPrints, engravings, ...(v2 ? { sticker } : {}) });
}
