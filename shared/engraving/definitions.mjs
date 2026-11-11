import { STUDIO_ICONS } from './studio-icons.mjs';
export { ICON_CATEGORIES } from './studio-icons.mjs';
// Reviewable definitions only. Importing this module never creates merchant data.
export const ENGRAVING_KIND = 'engraving_service_v1';
export const VISUAL_ENGRAVING_KIND = 'engraving_service_v2';
export const ENGRAVING_KINDS = Object.freeze([ENGRAVING_KIND, VISUAL_ENGRAVING_KIND]);
export const isEngravingKind = kind => ENGRAVING_KINDS.includes(kind);
export const INITIAL_ENGRAVING_TYPES = Object.freeze(['Perfume','Necklace','Bracelet','Watch','Lip Gloss','Makeup','Bag','Office Set','Other'].map((name, displayOrder) => Object.freeze({ typeId: name.toLowerCase().replaceAll(' ', '-'), name, displayOrder, pricePiastres: 10000, status: 'disabled', placements: [], fontIds: [], iconIds: [], maxLines: 3, maxCharacters: 80, maxCharactersPerLine: 40 })));
export const APPEARANCES = Object.freeze(['black','white','grey']);
export const PERSONAL_TYPES = Object.freeze(['photo','drawing','handwriting','fingerprint']);
export const NEW_PERSONAL_TYPES = Object.freeze(['photo','handwriting','fingerprint']);
export const FILE_ROLES = Object.freeze(['item_photo','surface_photo','personal_artwork']);
export const FONT_REGISTRY = Object.freeze([
  { id: 'engraving-amiri-v1', label: 'Amiri', language: 'ar', family: 'Engraving-amiri-v1', source: '/assets/engraving/fonts/v1/amiri.ttf', license: '/assets/engraving/fonts/v1/amiri-LICENSE.txt' },
  { id: 'engraving-rochester-v1', label: 'Rochester', language: 'en', family: 'Engraving-rochester-v1', source: '/assets/engraving/fonts/v1/rochester.ttf', license: '/assets/engraving/fonts/v1/rochester-LICENSE.txt' },
  { id: 'engraving-allura-v1', label: 'Allura', language: 'en', family: 'Engraving-allura-v1', source: '/fonts/gift-sticker/allura.ttf', license: '/fonts/gift-sticker/allura-LICENSE.txt' },
  { id: 'engraving-greatvibes-v1', label: 'Great Vibes', language: 'en', family: 'Engraving-greatvibes-v1', source: '/fonts/gift-sticker/greatvibes.ttf', license: '/fonts/gift-sticker/greatvibes-LICENSE.txt' },
  { id: 'engraving-sacramento-v1', label: 'Sacramento', language: 'en', family: 'Engraving-sacramento-v1', source: '/fonts/gift-sticker/sacramento.ttf', license: '/fonts/gift-sticker/sacramento-LICENSE.txt' },
  { id: 'engraving-parisienne-v1', label: 'Parisienne', language: 'en', family: 'Engraving-parisienne-v1', source: '/fonts/gift-sticker/parisienne.ttf', license: '/fonts/gift-sticker/parisienne-LICENSE.txt' },
  { id: 'engraving-pinyonscript-v1', label: 'Pinyon Script', language: 'en', family: 'Engraving-pinyonscript-v1', source: '/fonts/gift-sticker/pinyonscript.ttf', license: '/fonts/gift-sticker/pinyonscript-LICENSE.txt' },
  { id: 'engraving-arefruqaa-v1', label: 'Aref Ruqaa', language: 'ar', family: 'Engraving-arefruqaa-v1', source: '/fonts/gift-sticker/arefruqaa.ttf', license: '/fonts/gift-sticker/arefruqaa-LICENSE.txt' },
  { id: 'engraving-lateef-v1', label: 'Lateef', language: 'ar', family: 'Engraving-lateef-v1', source: '/fonts/gift-sticker/lateef.ttf', license: '/fonts/gift-sticker/lateef-LICENSE.txt' },
  { id: 'engraving-scheherazadenew-v1', label: 'Scheherazade New', language: 'ar', family: 'Engraving-scheherazadenew-v1', source: '/fonts/gift-sticker/scheherazadenew.ttf', license: '/fonts/gift-sticker/scheherazadenew-LICENSE.txt' },
  { id: 'engraving-rakkas-v1', label: 'Rakkas', language: 'ar', family: 'Engraving-rakkas-v1', source: '/fonts/gift-sticker/rakkas.ttf', license: '/fonts/gift-sticker/rakkas-LICENSE.txt' },
  { id: 'engraving-mirza-v1', label: 'Mirza', language: 'ar', family: 'Engraving-mirza-v1', source: '/fonts/gift-sticker/mirza.ttf', license: '/fonts/gift-sticker/mirza-LICENSE.txt' },

]);
// Original geometric path artwork authored for this project; see assets/engraving/v1/NOTICE.txt.
export const ICON_REGISTRY = Object.freeze([
  { id: 'engraving-heart-v1', label: 'Heart', asset: '/assets/engraving/v1/heart.svg', version: 1 },
  { id: 'engraving-star-v1', label: 'Star', asset: '/assets/engraving/v1/star.svg', version: 1 },
  { id: 'engraving-infinity-v1', label: 'Infinity', asset: '/assets/engraving/v1/infinity.svg', version: 1 },
  ...STUDIO_ICONS,
]);
export const fontById = id => FONT_REGISTRY.find(font => font.id === id);
export const iconById = id => ICON_REGISTRY.find(icon => icon.id === id);
export function engravingUploadIds(spec) {
  return spec?.contractVersion === 'engraving-spec-v2'
    ? [spec.surfacePhotoUploadId, ...(spec.itemPhotoUploadIds || []), ...(spec.design?.layers || []).filter(layer => layer.type === 'image').map(layer => layer.assetId)]
    : [spec?.itemPhotoUploadId, spec?.surfacePhotoUploadId, spec?.content?.artworkUploadId].filter(Boolean);
}
export const isEngravingOrder = order => order?.lines?.some(line => isEngravingKind(line.kind)) === true;
// A missing/corrupt gate on a service order must never default to authorization.
export const UPFRONT_ENGRAVING_POLICY = 'standalone-checkout-payment-v1';
export const upfrontEngravingPayment = order => order?.engravingPaymentPolicy === UPFRONT_ENGRAVING_POLICY;
export const engravingCollectionAllowed = order => !isEngravingOrder(order) || upfrontEngravingPayment(order) || order.engraving?.collectionAuthorized === true;

export function engravingFileEntries(spec) {
  if (spec?.contractVersion !== 'engraving-spec-v2') return [['itemPhotoUploadId', spec?.itemPhotoUploadId, 'item_photo'], ['surfacePhotoUploadId', spec?.surfacePhotoUploadId, 'surface_photo'], ['artworkUploadId', spec?.content?.artworkUploadId, 'personal_artwork']].filter(([, id]) => id);
  return [['surfacePhotoUploadId', spec.surfacePhotoUploadId, 'surface_photo'], ...spec.itemPhotoUploadIds.map((id, index) => [`itemPhoto-${index}`, id, 'item_photo']), ...spec.design.layers.filter(layer => layer.type === 'image').map((layer, index) => [`artwork-${index}`, layer.assetId, 'personal_artwork'])];
}
