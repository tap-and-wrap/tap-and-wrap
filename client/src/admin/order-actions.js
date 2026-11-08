const nextFulfillment = { received: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['out_for_delivery'], out_for_delivery: ['delivered', 'delivery_failed'], delivered: ['returned'], delivery_failed: ['returned'], returned: [], cancelled: [] };
// Mirror the inspected server transition contract for useful choices. The server
// remains authoritative and independently checks revisions and every transition.
export function adminOrderActions(order, { fulfillmentState = '', paymentState = '' } = {}) {
  if (order.accountingVersion === 2) {
    const group = order.accounting?.groups?.find(group => group.id === 'merchandise');
    return {fulfillment:group && !['cancelled','returned'].includes(order.fulfillmentState) ? (nextFulfillment[order.merchandiseFulfillment || 'received'] || []).filter(state => state !== 'cancelled' && (['returned','delivery_failed'].includes(state) || group.method === 'cod' || group.outstandingPiastres === 0)) : [], payment:[]};
  }
  if (order.lines?.some(line => line.kind === 'engraving_service_v1')) return { fulfillment: [], payment: [] };
  const effectivePayment = paymentState || order.paymentState;
  const fulfillment = (nextFulfillment[order.fulfillmentState] || []).filter(state => {
    if ([1, 2].includes(order.accountingVersion) && state === 'cancelled') return false;
    if (['returned', 'delivery_failed'].includes(state)) return true;
    if ([1, 2].includes(order.accountingVersion) && ['out_for_delivery', 'delivered'].includes(state) && order.accounting?.unresolvedCharges) return false;
    if (state === 'cancelled') return effectivePayment !== 'paid';
    return order.paymentMethod !== 'instapay' || effectivePayment === 'paid';
  });
  const payment = [1, 2].includes(order.accountingVersion) ? [] : order.fulfillmentState === 'cancelled' ? [] : order.paymentMethod === 'instapay'
    ? order.paymentState === 'awaiting_verification' ? ['paid', 'rejected'] : []
    : order.paymentState === 'unpaid' && ['out_for_delivery', 'delivered'].includes(order.fulfillmentState) ? ['paid'] : [];
  return { fulfillment, payment: fulfillmentState === 'cancelled' ? payment.filter(state => state !== 'paid') : payment };
}
