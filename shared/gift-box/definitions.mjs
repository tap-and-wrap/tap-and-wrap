// Code-owned identities, never SKUs or inferred links to the merchant catalog.
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const CATALOG_VERSION = 'gift-box-v2.3';
// Image-less finishing definitions do not change the pinned image collection.
export const ASSET_CATALOG_VERSION = 'gift-box-v2.2';
export const ASSET_VERSION = '2026-10-28.2';
export const GEOMETRY_VERSION = 'gift-box-geometry-v1-draft';
export const OWNER_EDITABLE_FIELDS = deepFreeze(['displayName', 'displayOrder', 'pricePiastres', 'enabled', 'inventoryMode', 'inventoryQuantity', 'available']);
export const BUILDER_STEPS = deepFreeze([
  { id: 'box', title: 'Choose Your Box', required: true },
  { id: 'flowers', title: 'Fill With Flowers', required: false },
  { id: 'plush', title: 'Add Plush Toys', required: false },
  { id: 'chocolates', title: 'Add Chocolates', required: false },
  { id: 'personal', title: 'Make It Personal', required: false },
  { id: 'finishing', title: 'Finishing Touches', required: false },
]);

const boxes = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  return { id: `box-${number}`, category: 'box', sourceNumber: number, initialDisplayOrder: number,
    selectionAsset: `boxes/box-${number}.webp`, placementAsset: `boxes/box-${number}-open-top.webp`,
    interaction: 'choose-one', geometryId: `box-${number}` };
});
const roses = ['red', 'yellow', 'black'].map((color, index) => ({
  id: `rose-${color}`, category: 'flower', sourceNumber: null, initialDisplayOrder: index + 1,
  selectionAsset: `flowers/${color}-og.webp`, placementAsset: `flowers/rose-${color}-builder.webp`,
  bouquetReferenceAsset: `flowers/flowers-${color}.webp`, interaction: 'add-one-per-tap',
}));
const plush = Array.from({ length: 17 }, (_, index) => {
  const number = index + 1;
  return { id: `plush-${number}`, category: 'plush', sourceNumber: number, initialDisplayOrder: number,
    selectionAsset: `toys/plush-${number}.webp`, placementAsset: `toys/plush-${number}-builder.webp`,
    interaction: 'add-instance' };
});

// Future approved entries are source changes in this registry, not admin-created records.
const chocolates = Array.from({ length: 20 }, (_, index) => ({
  id: `chocolate-${index + 1}`, category: 'chocolate', sourceNumber: index + 1, initialDisplayOrder: index + 1,
  selectionAsset: null, placementAsset: `chocolate/chocolate-${index + 1}-builder.webp`,
  presentation: 'text-button', interaction: 'add-one-per-tap', unit: 'complete-pictured-retail-unit',
  businessReviewRequired: ['displayName', 'retailUnit', 'availability', 'price'],
}));
// Visual interpretations of the owner's color names, not measured fabric colors.
// Business names and prices are provisioned separately and never read from here.
export const RIBBON_COLORS = deepFreeze([
  ['cream-ivory', '#F3E8CC'], ['blush-pink', '#F4C6D0'], ['champagne', '#D8C49B'],
  ['white', '#FFFFFF'], ['burgundy-dark-red', '#752838'], ['dusty-pink', '#B77B8C'],
  ['mint', '#C3E9DF'], ['coral-soft-pink-red', '#EE847D'], ['red', '#C92D39'],
  ['navy', '#203356'], ['black', '#202024'], ['grey-blue', '#7C96AC'],
  ['mint-green', '#72BC99'], ['classic-green', '#3D814F'], ['emerald', '#087C60'],
  ['baby-blue', '#B0D5F1'], ['silver', '#BDC1C7'], ['gold', '#C39936'],
  ['lavender', '#B5A0D4'], ['beige', '#CBB799'], ['peach', '#F3B58F'],
]);
const ribbons = RIBBON_COLORS.map(([key, color], index) => ({
  id: `ribbon-${key}`, category: 'ribbon', sourceNumber: null, initialDisplayOrder: index + 1,
  selectionAsset: null, placementAsset: null, approvedColorHex: color,
  presentation: 'solid-color-button', interaction: 'choose-finishing-option', unit: 'one-ribbon',
}));
const giftCard = { id: 'gift-card-1', category: 'gift_card', sourceNumber: null, initialDisplayOrder: 1,
  selectionAsset: null, placementAsset: null, presentation: 'checkbox-and-message', interaction: 'choose-finishing-option', unit: 'one-gift-card' };
export const FIXED_COMPONENTS = deepFreeze([...boxes, ...roses, ...plush, ...chocolates, ...ribbons, giftCard]);
export const PENDING_CATEGORIES = deepFreeze({});
export const GIFT_CARD_POLICY = deepFreeze({
  optional: true, maxMessageCodePoints: 500, messageRequiredWhenSelected: false,
  image: null, placement: false, requiresApprovedComponent: true,
});
export const RIBBON_POLICY = deepFreeze({
  presentation: 'solid-color-button', interaction: 'choose-finishing-option',
  immutableDefinitionFields: ['id', 'approvedColorHex'], image: null, placement: false,
  requiresApprovedComponent: true,
});
export const ASSET_ISSUES = deepFreeze([
  { id: 'box-1-right-edge-remnants', source: 'boxes/box-1-open-top.webp', componentId: 'box-1',
    blocksDevelopmentCopy: true, blocksProduction: true, status: 'open',
    description: 'Unwanted horizontal remnants extend to the right of the box. Owner correction and a new reviewed manifest are required.' },
]);

export function getFixedComponent(id) {
  return FIXED_COMPONENTS.find(component => component.id === id) ?? null;
}

// A missing setting cannot imply free pricing, available stock, or an enabled product.
export const UNCONFIGURED_COMPONENT_STATE = deepFreeze({
  displayName: null, pricePiastres: null, enabled: false, inventoryMode: null, inventoryQuantity: null, available: false,
});
