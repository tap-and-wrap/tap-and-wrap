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
    result.engraving = pick(value.engraving, ['text', 'adjustmentPiastres']);
    for (const key of ['engraving_material', 'engraving_font', 'engraving_placement']) {
      if (value.engraving[key]) result.engraving[key] = pick(value.engraving[key], ['key', 'label', 'adjustmentPiastres']);
    }
  }
  return result;
}
function state(value) { return pick(value, ['fulfillmentState', 'paymentState']); }
export function presentOrderHistory(history = [], { admin = false } = {}) {
  return history.map(entry => ({ ...pick(entry, ['at', 'event']),
    actor: admin ? entry.actor : String(entry.actor || '').startsWith('admin:') ? 'admin' : ['customer', 'guest'].includes(entry.actor) ? entry.actor : undefined,
    ...(entry.from ? { from: state(entry.from) } : {}), ...(entry.to ? { to: state(entry.to) } : {}),
    // Legacy reason was ambiguously labelled "audit note". Never infer it is public.
    ...(typeof entry.publicReason === 'string' && entry.publicReason ? { reason: entry.publicReason, publicReason: entry.publicReason } : {}),
    ...(admin && (entry.internalNote || entry.reason) ? { internalNote: entry.internalNote || entry.reason } : {}),
  }));
}
export function presentOrder(order, { admin = false } = {}) {
  const rejected = order.paymentMethod === 'instapay' && order.paymentState === 'rejected';
  const publicRejection = rejected ? [...(order.history || [])].reverse().find(entry => entry.to?.paymentState === 'rejected' && typeof entry.publicReason === 'string' && entry.publicReason.trim())?.publicReason : null;
  const totals = { ...pick(order.totals, ['subtotalPiastres', 'discountPiastres', 'shippingPiastres', 'totalPiastres']),
    applied: (order.totals?.applied || []).map(value => pick(value, ['kind', 'id', 'name', 'code', 'applications', 'discountPiastres'])) };
  return { id: String(order._id), _id: String(order._id), orderNumber: order.orderNumber,
    customer: pick(order.customer, ['name', 'email', 'phone', 'governorate', 'address', 'notes']),
    lines: (order.lines || []).map(line => ({ ...pick(line, ['productId', 'name', 'slug', 'variantKey', 'variantLabel', 'sku', 'description', 'categoryId', 'subcategoryId', 'mainImageUrl', 'quantity', 'unitPricePiastres', 'lineTotalPiastres']),
      personalization: configuredValues(line.personalization), customization: customization(line.customization) })),
    totals, paymentMethod: order.paymentMethod, paymentState: order.paymentState, fulfillmentState: order.fulfillmentState,
    history: presentOrderHistory(order.history, { admin }), createdAt: order.createdAt, updatedAt: order.updatedAt, revision: order.revision,
    canCancel: ['received', 'confirmed'].includes(order.fulfillmentState) && order.paymentState !== 'paid',
    ...(rejected ? { paymentAttention: { code: 'PAYMENT_PROOF_REJECTED', message: 'Payment proof requires attention. Contact the store with your order reference before making another transfer.', publicReason: publicRejection || null, receiptReplacementEnabled: false } } : {}),
    ...(admin ? { proofAvailable: Boolean(order.paymentProofId), uploadIds: (order.uploadIds || []).map(String) } : {}),
  };
}
export function presentOrderSummary(order, { admin = false } = {}) {
  return { ...pick(order, ['orderNumber', 'paymentMethod', 'paymentState', 'fulfillmentState', 'createdAt', 'updatedAt', 'revision']),
    id: String(order._id), _id: String(order._id), totals: pick(order.totals, ['subtotalPiastres', 'discountPiastres', 'shippingPiastres', 'totalPiastres']),
    ...(admin ? { customer: pick(order.customer, ['name', 'governorate']) } : {}) };
}
