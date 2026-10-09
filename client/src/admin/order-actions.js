const nextFulfillment = { received: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['out_for_delivery'], out_for_delivery: ['delivered'], delivered: [], cancelled: [] };
// Mirror the inspected server transition contract for useful choices. The server
// remains authoritative and independently checks revisions and every transition.
export function adminOrderActions(order, { fulfillmentState = '', paymentState = '' } = {}) {
  const effectivePayment = paymentState || order.paymentState;
  const fulfillment = (nextFulfillment[order.fulfillmentState] || []).filter(state => {
    if (state === 'cancelled') return effectivePayment !== 'paid';
    return order.paymentMethod !== 'instapay' || effectivePayment === 'paid';
  });
  const payment = order.fulfillmentState === 'cancelled' ? [] : order.paymentMethod === 'instapay'
    ? order.paymentState === 'awaiting_verification' ? ['paid', 'rejected'] : []
    : order.paymentState === 'unpaid' && ['out_for_delivery', 'delivered'].includes(order.fulfillmentState) ? ['paid'] : [];
  return { fulfillment, payment: fulfillmentState === 'cancelled' ? payment.filter(state => state !== 'paid') : payment };
}
