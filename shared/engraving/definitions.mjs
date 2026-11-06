// Reviewable definitions only. Importing this module never creates merchant data.
export const ENGRAVING_KIND = 'engraving_service_v1';
export const INITIAL_ENGRAVING_TYPES = Object.freeze(['Perfume','Necklace','Bracelet','Watch','Lip Gloss','Makeup','Bag','Office Set','Other'].map((name, displayOrder) => Object.freeze({ typeId: name.toLowerCase().replaceAll(' ', '-'), name, displayOrder, pricePiastres: 10000, status: 'disabled', placements: [], fontIds: [], iconIds: [], maxLines: 3, maxCharacters: 80, maxCharactersPerLine: 40 })));
export const APPEARANCES = Object.freeze(['black','white','grey']);
export const PERSONAL_TYPES = Object.freeze(['photo','drawing','handwriting','fingerprint']);
export const FILE_ROLES = Object.freeze(['item_photo','surface_photo','personal_artwork']);
export const FONT_REGISTRY = Object.freeze([
  { id: 'engraving-amiri-v1', label: 'Amiri', language: 'ar', family: 'Engraving-amiri-v1', source: '/assets/engraving/fonts/v1/amiri.ttf', license: '/assets/engraving/fonts/v1/amiri-LICENSE.txt' },
  { id: 'engraving-rochester-v1', label: 'Rochester', language: 'en', family: 'Engraving-rochester-v1', source: '/assets/engraving/fonts/v1/rochester.ttf', license: '/assets/engraving/fonts/v1/rochester-LICENSE.txt' },
]);
// Original geometric path artwork authored for this project; see assets/engraving/v1/NOTICE.txt.
export const ICON_REGISTRY = Object.freeze([
  { id: 'engraving-heart-v1', label: 'Heart', asset: '/assets/engraving/v1/heart.svg', version: 1 },
  { id: 'engraving-star-v1', label: 'Star', asset: '/assets/engraving/v1/star.svg', version: 1 },
  { id: 'engraving-infinity-v1', label: 'Infinity', asset: '/assets/engraving/v1/infinity.svg', version: 1 },
]);
export const fontById = id => FONT_REGISTRY.find(font => font.id === id);
export const iconById = id => ICON_REGISTRY.find(icon => icon.id === id);
export function engravingUploadIds(spec) {
  return [spec?.itemPhotoUploadId, spec?.surfacePhotoUploadId, spec?.content?.artworkUploadId].filter(Boolean);
}
export const isEngravingOrder = order => order?.lines?.some(line => line.kind === ENGRAVING_KIND) === true;
// A missing/corrupt gate on a service order must never default to authorization.
export const engravingCollectionAllowed = order => !isEngravingOrder(order) || order.engraving?.collectionAuthorized === true;
