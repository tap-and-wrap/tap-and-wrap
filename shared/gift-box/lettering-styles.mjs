// Internal owner-supplied style candidates. The screenshots are not font files
// and are not evidence of web-embedding or redistribution permissions.
// Never expose these internal names in customer-facing markup or APIs.
export const LETTERING_STYLES = Object.freeze([
  ['lettering-01','1Lionsys Reqa'],
  ['lettering-02','Kunstler Script'],
  ['lettering-03','Diwani Simple Striped'],
  ['lettering-04','Diwani Bent'],
  ['lettering-05','Arabic Typesetting'],
  ['lettering-06','DecoType Thuluth'],
  ['lettering-07','Farsi Simple Bold'],
  ['lettering-08','Farsi Simple Outline'],
  ['lettering-09','Old Antic Decorative'],
  ['lettering-10','Palace Script MT'],
  ['lettering-11','Traditional Arabic'],
  ['lettering-12','Rochester'],
].map(([id, internalName], index) => Object.freeze({
  id, internalName, customerLabel: `Style ${String(index+1).padStart(2,'0')}`,
  actualFontPreviewReady: false, webEmbeddingApproved: false,
})));
export const MAX_GIFT_PHOTOS = 6;
export const MAX_ENGRAVING_LINES = 2;
export const MAX_ENGRAVING_CODEPOINTS = 80;
export const MAX_GIFT_PHOTO_BYTES = 8 * 1024 * 1024;
export const GIFT_PHOTO_TYPES = Object.freeze(['image/jpeg','image/png','image/webp']);
export function validateDraftEngraving(text) {
  return typeof text === 'string' && text.isWellFormed()
    && [...text].length <= MAX_ENGRAVING_CODEPOINTS
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text);
}
export function validateLocalPhoto(file) {
  if (!file || !GIFT_PHOTO_TYPES.includes(file.type) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_GIFT_PHOTO_BYTES) {
    return 'Choose a JPEG, PNG or WebP image no larger than 8 MB.';
  }
  return null;
}

// Visual-only engraving ink/material COLOR CANDIDATES. These choices do not
// represent a real material, print guarantee, licensed font, price or approval.
// Never accept a customer-supplied CSS color/hex string as an engraving style.
export const DEFAULT_ENGRAVING_COLOR = 'black';
export const ENGRAVING_COLORS = Object.freeze([
  { id: 'black', label: 'Black', hex: '#252220', contrast: 'light' },
  { id: 'white', label: 'White', hex: '#FFFFFF', contrast: 'dark' },
  { id: 'red', label: 'Red', hex: '#C92339', contrast: 'light' },
  { id: 'gold', label: 'Gold', hex: '#D4AF37', contrast: 'dark' },
  { id: 'yellow', label: 'Yellow', hex: '#F0CE3A', contrast: 'dark' },
].map(color => Object.freeze(color)));
export const getEngravingColor = colorId => ENGRAVING_COLORS.find(color => color.id === colorId) || ENGRAVING_COLORS[0];
