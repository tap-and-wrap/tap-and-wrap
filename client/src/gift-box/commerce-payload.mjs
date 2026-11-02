import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, deepFreeze, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_KIND, GIFT_BOX_COMMERCE_CONTRACT_VERSION, GIFT_BOX_COMMERCE_COORDINATE_SYSTEM,
  GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION, GIFT_BOX_COMMERCE_SCENE } from '../../../shared/gift-box/commerce-contract.mjs';
import { estimateSelection } from './state.mjs';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const unit = value => Number.isFinite(value) && value >= 0 && value <= 1;
const fail = () => { throw new Error('Choose a box and ribbon and arrange every selected item before cart review.'); };

// This is a browser proposal only, with no prices, stock or approval assertions.
// The server validates it again and derives the permanent canonical identity.
export function prepareGiftBoxCommerceConfiguration(state, { cardId } = {}) {
  if (!state || !Array.isArray(state.instances) || state.instances.length > 200
    || getFixedComponent(state.boxId)?.category !== 'box' || getFixedComponent(state.ribbonId)?.category !== 'ribbon') fail();
  const selection = estimateSelection(state, cardId);
  if (!selection || selection.items.some(item => item.quantity > 100)
    || selection.giftCard && getFixedComponent(selection.giftCard.componentId)?.category !== 'gift_card') fail();
  const instanceIds = new Set();
  const scene = GIFT_BOX_COMMERCE_SCENE;
  const placements = state.instances.map(item => {
    const category = getFixedComponent(item.componentId)?.category;
    const zone = item.placementZone;
    if (!uuid(item.id) || instanceIds.has(item.id.toLowerCase()) || !['flower', 'plush', 'chocolate'].includes(category)
      || !['inside', 'beside'].includes(zone) || zone === 'beside' && !['plush', 'chocolate'].includes(category)
      || !/^[a-z][a-z0-9-]{0,79}$/.test(item.regionId || '')
      || ![item.x, item.y, item.height, item.anchorOffsetY, item.layerBase].every(Number.isFinite)) fail();
    instanceIds.add(item.id.toLowerCase());
    const x = (item.x - scene.x) / scene.width, y = (item.y - scene.y) / scene.height;
    // Match the current visual scene's layer calculation without certifying fit.
    const layer = item.layerBase + Math.round((item.y + item.height * item.anchorOffsetY) * 60);
    if (!unit(x) || !unit(y) || !Number.isSafeInteger(layer) || layer < 0 || layer > 1000) fail();
    return { instanceId: item.id, componentId: item.componentId, x, y, zone, regionId: item.regionId, layer };
  });
  return deepFreeze({ kind: GIFT_BOX_COMMERCE_KIND, contractVersion: GIFT_BOX_COMMERCE_CONTRACT_VERSION,
    catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
    draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION, coordinateSystem: GIFT_BOX_COMMERCE_COORDINATE_SYSTEM,
    selection, placements });
}

export function prepareGiftBoxCartPayload(state, { cardId, operationKey, quantity = 1 } = {}) {
  // The caller must retain this key and immutable payload for an explicit retry.
  // No message or configuration is written to browser storage by this helper.
  if (!uuid(operationKey) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('A stable operation key and valid completed-box quantity are required.');
  return deepFreeze({ kind: GIFT_BOX_COMMERCE_KIND, operationKey, quantity,
    configuration: prepareGiftBoxCommerceConfiguration(state, { cardId }) });
}
