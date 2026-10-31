// Order snapshots contain Mixed fields for immutable historical records. Customer
// responses must explicitly select their public contract, never spread a record.
function pick(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
function configuredValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => /^[a-z][a-z0-9_-]{0,79}$/i.test(key)
    && (typeof entry === 'string' || (Array.isArray(entry) && entry.every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id))))));
}
function customization(value) {
  if (!value || typeof value !== 'object') return null;
  const result = pick(value, ['templateId', 'templateKey', 'templateName', 'kind', 'version', 'pricingMode', 'adjustmentPiastres']);
  result.fields = configuredValues(value.fields);
  result.selections = (value.selections || []).map(selection => pick(selection, ['groupKey', 'groupLabel', 'optionKey', 'label', 'componentId', 'componentName', 'quantity', 'unitAdjustmentPiastres']));
  if (value.engraving) {
    result.engraving = pick(value.engraving, ['type', 'otherDetails', 'text', 'adjustmentPiastres']);
    for (const key of ['engraving_material', 'engraving_font', 'engraving_placement']) {
      if (value.engraving[key]) result.engraving[key] = pick(value.engraving[key], ['key', 'label', 'adjustmentPiastres']);
    }
  }
  return result;
}
function state(value) { return pick(value, ['fulfillmentState', 'paymentState']); }
function personalizationDefinitions(value) {
  return (Array.isArray(value) ? value : []).slice(0, 20).filter(field => field && typeof field.key === 'string' && /^[a-z][a-z0-9_-]{0,49}$/.test(field.key)
    && typeof field.label === 'string' && field.label.length <= 160 && ['image', 'short_text', 'long_text', 'select'].includes(field.type)).map(field => pick(field, ['key', 'label', 'type']));
}
function giftBox(value, { admin }) {
  if (!value || !['gift-box-order-v1','gift-box-order-v2'].includes(value.snapshotVersion) || !Array.isArray(value.components)
    || value.components.length < 2 || value.components.length > 103
    || !value.components.every(component => component && typeof component === 'object' && typeof component.componentId === 'string'
      && typeof component.displayName === 'string' && ['box', 'flower', 'plush', 'chocolate', 'ribbon', 'gift_card'].includes(component.category)
      && ['quantityPerBox', 'quantityForLine'].every(key => Number.isSafeInteger(component[key]) && component[key] > 0)
      && ['unitPricePiastres', 'perBoxSubtotalPiastres', 'lineSubtotalPiastres'].every(key => Number.isSafeInteger(component[key]) && component[key] >= 0)
      && component.inventory?.owner === 'GiftBoxComponentSetting' && ['tracked', 'made_to_order', 'status_only'].includes(component.inventory.mode)
      && ['requiredQuantity', 'trackedDemand'].every(key => Number.isSafeInteger(component.inventory[key]) && component.inventory[key] >= 0))
    || value.components.filter(component => component.category === 'box').length !== 1
    || value.components.filter(component => component.category === 'ribbon').length !== 1
    || !value.configuration || typeof value.configuration !== 'object' || !value.configuration.selection
    || !Array.isArray(value.configuration.selection.items) || !Array.isArray(value.configuration.placements)
    || !value.configuration.placements.every(item => item && typeof item.componentId === 'string' && typeof item.instanceId === 'string'
      && ['inside', 'beside'].includes(item.zone) && typeof item.regionId === 'string' && ['x', 'y'].every(key => Number.isFinite(item[key]) && item[key] >= 0 && item[key] <= 1)
      && Number.isSafeInteger(item.layer))
    || !Array.isArray(value.inventoryClaims)) return null;
  const components = (Array.isArray(value.components) ? value.components : []).slice(0, 103);
  const selected = component => pick(component, ['componentId', 'category', 'displayName', 'quantityPerBox', 'quantityForLine']);
  const configuration = value.configuration || {}, selection = configuration.selection || {};
  const ribbon = components.find(component => component.category === 'ribbon');
  const result = { snapshotVersion: value.snapshotVersion,
    box: selected(components.find(component => component.category === 'box')),
    items: components.filter(component => ['flower', 'plush', 'chocolate'].includes(component.category)).map(selected),
    ribbon: { ...selected(ribbon), ...pick(ribbon, ['colorHex']) },
    giftCard: { selected: Boolean(selection.giftCard), ...(selection.giftCard ? pick(selection.giftCard, ['message']) : {}) },
    components: components.map(component => ({ ...pick(component, ['componentId', 'category', 'displayName', 'unit', 'quantityPerBox', 'quantityForLine', 'unitPricePiastres', 'perBoxSubtotalPiastres', 'lineSubtotalPiastres']),
      ...(admin ? { ...pick(component, ['priceApproval', 'priceApprovedBy', 'priceApprovedAt', 'settingsRevision']),
        inventory: pick(component.inventory, ['owner', 'componentId', 'mode', 'requiredQuantity', 'trackedDemand']) } : {}) })),
    artwork: { status: 'unavailable' },
    ...(value.snapshotVersion === 'gift-box-order-v2' && value.personalization && Array.isArray(value.personalization.photoPrints)
      && Array.isArray(value.personalization.engravings) ? { personalization: {
        photoCount: value.personalization.photoPrints.length,
        unitAdjustmentPiastres: value.personalization.unitAdjustmentPiastres,
        engravings: value.personalization.engravings.map(item => pick(item, ['text','styleId','colorId','surfaceOptionId','pricePiastres'])),
        ...(admin ? { photoPrints: value.personalization.photoPrints.map(item => pick(item, ['uploadId','printOptionId','zone','x','y','pricePiastres'])) } : {}),
      } } : {}),
  };
  if (admin) {
    result.configurationId = value.configurationId;
    result.configuration = { ...pick(configuration, ['kind', 'contractVersion', 'catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion', 'coordinateSystem']),
      selection: { ...pick(selection, ['boxId', 'ribbonId']), items: (selection.items || []).map(item => pick(item, ['componentId', 'quantity'])),
        giftCard: selection.giftCard ? pick(selection.giftCard, ['componentId', 'message']) : null },
      placements: configuration.placements.map(item => pick(item, ['instanceId', 'componentId', 'x', 'y', 'zone', 'regionId', 'layer'])) };
    result.fulfillment = { physicalFitCertifiedByGeometry: false,
      policyReference: pick(value.fulfillment?.policyReference, ['contractVersion', 'policyId', 'policyVersion', 'boxId', 'approvedBy', 'approvedAt', 'catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion']) };
    result.inventoryClaims = (value.inventoryClaims || []).map(claim => pick(claim, ['kind', 'id', 'mode', 'quantity', 'consumedQuantity', 'settingsRevision']));
  }
  return result;
}
function orderLine(line, { admin }) {
  if (line.kind === 'gift_box_v2') return { ...pick(line, ['kind', 'name', 'quantity', 'unitPricePiastres', 'lineTotalPiastres']), giftBox: giftBox(line.giftBox, { admin }) };
  if (line.kind !== undefined && line.kind !== 'product') return { kind: 'unsupported', name: 'Order item details unavailable' };
  return { kind: 'product', ...pick(line, ['productId', 'name', 'slug', 'variantKey', 'variantLabel', 'sku', 'description', 'categoryId', 'subcategoryId', 'mainImageUrl', 'quantity', 'unitPricePiastres', 'lineTotalPiastres']),
    personalization: configuredValues(line.personalization), personalizationDefinitions: personalizationDefinitions(line.personalizationDefinitions), customization: customization(line.customization) };
}
export function presentOrderHistory(history = [], { admin = false } = {}) {
  return history.map(entry => ({ ...pick(entry, ['at', 'event']),
    actor: admin ? entry.actor : String(entry.actor || '').startsWith('admin:') ? 'admin' : ['customer', 'guest'].includes(entry.actor) ? entry.actor : undefined,
    ...(entry.from ? { from: state(entry.from) } : {}), ...(entry.to ? { to: state(entry.to) } : {}),
    // Legacy reason was ambiguously labelled "audit note". Never infer it is public.
    ...(typeof entry.publicReason === 'string' && entry.publicReason ? { reason: entry.publicReason, publicReason: entry.publicReason } : {}),
    ...(admin && entry.actionDetails ? { actionDetails: pick(entry.actionDetails, ['action', 'chargeId', 'amountPiastres', 'quantities', 'quotationVersion', 'collectionMethod', 'allowedPaymentMethods', 'pricing', 'accepted', 'acceptanceChannel', 'codAuthorized', 'reducePayable', 'exceptionConfirmed']) } : {}),
    ...(admin && (entry.internalNote || entry.reason) ? { internalNote: entry.internalNote || entry.reason } : {}),
  }));
}
export function presentOrder(order, { admin = false } = {}) {
  const rejected = order.paymentMethod === 'instapay' && order.paymentState === 'rejected';
  const publicRejection = rejected ? [...(order.history || [])].reverse().find(entry => (entry.to?.paymentState === 'rejected' || entry.event === 'payment_rejected') && typeof entry.publicReason === 'string' && entry.publicReason.trim())?.publicReason : null;
  const totals = { ...pick(order.totals, ['subtotalPiastres', 'discountPiastres', 'shippingPiastres', 'totalPiastres']),
    applied: (order.totals?.applied || []).map(value => pick(value, ['kind', 'id', 'name', 'code', 'applications', 'discountPiastres'])) };
  return { id: String(order._id), _id: String(order._id), orderNumber: order.orderNumber,
    customer: pick(order.customer, ['name', 'email', 'phone', 'governorate', 'address', 'notes']),
    lines: (order.lines || []).map(line => orderLine(line, { admin })),
    proofStatus: order.proofHistory?.at(-1)?.state || null,
    orderChannel: order.orderChannel || 'website', ...(admin && order.serviceRequestId ? { serviceRequestId: String(order.serviceRequestId) } : {}), allowedPaymentMethods: order.allowedPaymentMethods || [], accountingVersion: order.accountingVersion || 0, followUpDueAt: order.followUpDueAt, cancellationRequestedAt: order.cancellationRequestedAt,
    shipping: order.accountingVersion === 1 ? (order.charges || []).filter(charge => charge.kind === 'shipping').map(charge => pick(charge, ['id', 'state', 'amountPiastres', 'collectionMethod', 'acceptedAt']))[0] : null,
    paymentInstructions: order.accountingVersion === 1 && order.orderChannel !== 'owner_quotation' && order.paymentMethod === 'instapay' ? { destination: '01060673073', amountPiastres: order.totals.totalPiastres, orderReference: order.orderNumber } : null,
    totals, paymentMethod: order.paymentMethod, paymentState: order.paymentState, fulfillmentState: order.fulfillmentState,
    history: presentOrderHistory(order.history, { admin }), createdAt: order.createdAt, updatedAt: order.updatedAt, revision: order.revision,
    canCancel: ['received', 'confirmed'].includes(order.fulfillmentState) && (order.accountingVersion === 1 || order.paymentState !== 'paid'),
    ...(rejected ? { paymentAttention: { code: 'PAYMENT_PROOF_REJECTED', message: 'Payment proof requires attention. Contact the store with your order reference before making another transfer.', publicReason: publicRejection || null, receiptReplacementEnabled: order.accountingVersion === 1 } } : {}),
    ...(admin ? { proofAvailable: Boolean(order.paymentProofId), uploadIds: (order.uploadIds || []).map(String) } : {}),
  };
}
export function presentOrderSummary(order, { admin = false } = {}) {
  return { ...pick(order, ['orderNumber', 'paymentMethod', 'paymentState', 'fulfillmentState', 'createdAt', 'updatedAt', 'revision']),
    accountingVersion: order.accountingVersion || 0, financialSummary: pick(order.financialSummary, ['collectedPiastres', 'refundedPiastres', 'outstandingPiastres', 'unresolvedCharges', 'refundReviewRequired']), followUpDueAt: order.followUpDueAt,
    id: String(order._id), _id: String(order._id), totals: pick(order.totals, ['subtotalPiastres', 'discountPiastres', 'shippingPiastres', 'totalPiastres']),
    ...(admin ? { customer: pick(order.customer, ['name', 'governorate']) } : {}) };
}
