// Explicit fields prevent private settings metadata, arbitrary image URLs or
// storage keys from entering the owner-facing saved request presentation.
import { GIFT_BOX_REQUEST_CONTRACT_VERSION, GIFT_BOX_REQUEST_COORDINATE_SYSTEM, GIFT_BOX_REQUEST_KIND } from '../../../shared/gift-box/request-contract.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.isWellFormed();
const amount = value => Number.isSafeInteger(value) && value >= 0;
const coordinate = value => Number.isFinite(value) && value >= 0 && value <= 1;
const units = { box: 'one-box', flower: 'individual-rose', plush: 'one-plush-toy', chocolate: 'complete-pictured-retail-unit', ribbon: 'one-ribbon', gift_card: 'one-gift-card' };
function presentable(snapshot) {
  if (!record(snapshot) || snapshot.kind !== GIFT_BOX_REQUEST_KIND || snapshot.contractVersion !== GIFT_BOX_REQUEST_CONTRACT_VERSION
    || snapshot.coordinateSystem !== GIFT_BOX_REQUEST_COORDINATE_SYSTEM || !['catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion'].every(key => text(snapshot[key]))
    || !record(snapshot.scene) || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(snapshot.scene[key]))
    || !record(snapshot.selection) || !text(snapshot.selection.boxId) || !Array.isArray(snapshot.selection.items)
    || !snapshot.selection.items.every(item => record(item) && text(item.componentId) && Number.isSafeInteger(item.quantity) && item.quantity > 0)
    || snapshot.selection.ribbonId != null && !text(snapshot.selection.ribbonId)
    || snapshot.selection.giftCard != null && (!record(snapshot.selection.giftCard) || !text(snapshot.selection.giftCard.componentId) || !text(snapshot.selection.giftCard.message))
    || !record(snapshot.estimate) || snapshot.estimate.currency !== 'EGP' || !amount(snapshot.estimate.componentSubtotalPiastres)
    || !Array.isArray(snapshot.estimate.items) || snapshot.estimate.items.length === 0 || !Array.isArray(snapshot.placements)) return false;
  if (!snapshot.estimate.items.every(item => record(item) && text(item.componentId) && text(item.displayName) && text(item.category) && Object.hasOwn(units, item.category) && item.unit === units[item.category]
    && Number.isSafeInteger(item.quantity) && item.quantity > 0 && amount(item.unitPricePiastres) && amount(item.lineSubtotalPiastres) && amount(item.settingsRevision)
    && ['paid', 'complimentary'].includes(item.priceApproval) && typeof item.available === 'boolean'
    && (item.category === 'ribbon' ? item.inventoryMode === 'status_only' && item.inventoryQuantity === null
      : item.inventoryMode === 'tracked' && amount(item.inventoryQuantity) || item.inventoryMode === 'made_to_order' && (item.inventoryQuantity === null || amount(item.inventoryQuantity)))
    && (item.category !== 'ribbon' || typeof item.colorHex === 'string' && /^#[\da-f]{6}$/i.test(item.colorHex)))) return false;
  return snapshot.placements.every(item => record(item) && ['instanceId', 'componentId', 'regionId'].every(key => text(item[key]))
    && coordinate(item.x) && coordinate(item.y) && ['inside', 'beside'].includes(item.zone) && amount(item.layer) && item.layer <= 1000);
}
const reviewOnly = snapshot => ({ kind: GIFT_BOX_REQUEST_KIND, contractVersion: text(snapshot?.contractVersion) ? snapshot.contractVersion : null,
  presentationStatus: 'specialist_review_required', geometryReviewStatus: 'unreviewed', physicalFitReviewRequired: true, arrangementApproved: false,
  submissionAllowed: false, orderConversionAllowed: false, inventoryReserved: false });

export function presentGiftBoxV2Snapshot(snapshot) {
  if (snapshot === null || snapshot === undefined) return null;
  if (!presentable(snapshot)) return reviewOnly(snapshot);
  const estimate = snapshot.estimate;
  return { kind: snapshot.kind, contractVersion: snapshot.contractVersion, catalogVersion: snapshot.catalogVersion, assetVersion: snapshot.assetVersion,
    geometryVersion: snapshot.geometryVersion, draftGeometryVersion: snapshot.draftGeometryVersion, coordinateSystem: snapshot.coordinateSystem,
    scene: snapshot.scene && { x: snapshot.scene.x, y: snapshot.scene.y, width: snapshot.scene.width, height: snapshot.scene.height },
    selection: snapshot.selection && { boxId: snapshot.selection.boxId, items: snapshot.selection.items?.map(item => ({ componentId: item.componentId, quantity: item.quantity })),
      ribbonId: snapshot.selection.ribbonId, giftCard: snapshot.selection.giftCard && { componentId: snapshot.selection.giftCard.componentId, message: snapshot.selection.giftCard.message } },
    placements: snapshot.placements?.map(item => ({ instanceId: item.instanceId, componentId: item.componentId, x: item.x, y: item.y, zone: item.zone, regionId: item.regionId, layer: item.layer })) || [],
    estimate: estimate && { kind: estimate.kind, currency: estimate.currency, componentSubtotalPiastres: estimate.componentSubtotalPiastres,
      items: estimate.items?.map(item => ({ componentId: item.componentId, category: item.category, displayName: item.displayName, quantity: item.quantity, unit: item.unit,
        ...(item.category === 'ribbon' ? { colorHex: item.colorHex } : {}), unitPricePiastres: item.unitPricePiastres, lineSubtotalPiastres: item.lineSubtotalPiastres,
        priceApproval: item.priceApproval, settingsRevision: item.settingsRevision, inventoryMode: item.inventoryMode, inventoryQuantity: item.inventoryQuantity, available: item.available })),
      delivery: { status: 'pending_confirmation', pricePiastres: null } },
    geometryReviewStatus: 'unreviewed', physicalFitReviewRequired: true, arrangementApproved: false,
    physicalFitReview: { required: true, authoritativeGeometryStatus: 'unreviewed', draftVersionVerified: false, regionIdsVerified: false, placementTraceStatus: 'unverified-customer-proposal' },
    submissionAllowed: false, orderConversionAllowed: false, inventoryReserved: false };
}
