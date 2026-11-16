// Knowing a reference + phone permits this small summary, never the owned DTO.
export function presentTrackingOrder(order) {
  return {
    orderNumber: order.orderNumber, fulfillmentState: order.fulfillmentState,
    paymentState: order.paymentState, createdAt: order.createdAt, updatedAt: order.updatedAt,
    shippingStatus: [1, 2].includes(order.accountingVersion) ? order.charges?.find(charge => charge.kind === 'shipping')?.state : 'legacy',
    items: (order.lines || []).slice(0, 50).map(item => ({
      name: item.kind === 'gift_box_v2' ? 'Gift Box' : ['engraving_service', 'engraving_service_v2'].includes(item.kind) ? 'Engraving service' : String(item.name || 'Order item').slice(0, 160),
      quantity: item.quantity,
    })),
    ...(Number.isSafeInteger(order.totals?.totalPiastres) ? { totalPiastres: order.totals.totalPiastres } : {}),
  };
}
