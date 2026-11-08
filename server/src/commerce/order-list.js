/** Read-only projections and filters for the unified owner workspace. */
export const closedOrderStates = ['delivered', 'cancelled', 'returned'];
export const attentionConditions = () => [
  { initialContactAt: null, serviceRequestId: null },
  { responseState: 'requires_action' },
  { proofReviewRequired: true },
  { paymentState: { $in: ['awaiting_verification', 'rejected'] } },
  { 'financialSummary.refundReviewRequired': true },
  { cancellationRequestedAt: { $ne: null } },
  { 'engraving.items.stage': { $in: ['awaiting_customer_item', 'item_received', 'inspection_pending', 'needs_clarification', 'final_design_confirmed', 'engraving_completed', 'unsuitable', 'return_arranged', 'return_dispatched'] } },
  { 'lines.kind': 'gift_box_v2', fulfillmentState: { $in: ['received', 'confirmed', 'preparing'] } },
];
export function ownerOrderView(view) {
  if (view === 'requires_action') return { $or: [
    { fulfillmentState: { $nin: closedOrderStates }, $or: attentionConditions() },
    { 'engraving.items': { $elemMatch: { inCustody: true, stage: { $ne: 'returned_to_customer' } } } },
  ] };
  if (view === 'unpaid') return { fulfillmentState: { $nin: ['cancelled', 'returned'] }, paymentState: { $in: ['unpaid', 'awaiting_transfer', 'partially_paid'] } };
  if (view === 'verification') return { $or: [{ proofReviewRequired: true }, { paymentState: 'awaiting_verification' }] };
  if (view === 'preparing') return { fulfillmentState: 'preparing' };
  if (view === 'completed') return { fulfillmentState: 'delivered' };
  if (view === 'cancelled') return { fulfillmentState: 'cancelled' };
  return {};
}
export function orderItemTypes(order) {
  return [...new Set((order.lines || []).map(line => line.kind === 'gift_box_v2' ? 'gift_box' : line.kind === 'engraving_service_v1' ? 'engraving' : 'product'))];
}
export function orderActionLabel(order) {
  if (closedOrderStates.includes(order.fulfillmentState)) return (order.engraving?.items || []).some(item => item.inCustody === true) ? 'Return customer item' : null;
  if (order.financialSummary?.refundReviewRequired) return 'Review refund';
  if (order.cancellationRequestedAt) return 'Review cancellation';
  if (order.proofReviewRequired || order.paymentState === 'awaiting_verification') return 'Verify payment';
  if (order.paymentState === 'rejected') return 'Contact about payment';
  const stages = (order.engraving?.items || []).map(item => item.stage);
  if (stages.some(stage => ['item_received', 'inspection_pending'].includes(stage))) return 'Inspect customer item';
  if (stages.includes('needs_clarification')) return 'Clarify engraving details';
  if (stages.includes('awaiting_customer_item')) return 'Arrange item handover';
  if (stages.includes('final_design_proposed')) return 'Awaiting design acceptance';
  if (stages.some(stage => ['engraving_completed', 'unsuitable'].includes(stage))) return 'Arrange item return';
  if (stages.includes('return_arranged')) return 'Dispatch or hand over item';
  if (stages.includes('return_dispatched')) return 'Confirm item returned';
  if (stages.includes('final_design_confirmed') && order.engraving?.collectionAuthorized !== true) return 'Review payment authorization';
  if (order.engraving?.collectionMethod === 'cod' && !order.engraving.codCommitment?.customerAccepted) return 'Awaiting COD arrangement acceptance';
  if (!order.initialContactAt && !order.serviceRequestId) return 'Contact customer';
  if (order.responseState === 'requires_action') return 'Respond to customer';
  if (orderItemTypes(order).includes('gift_box') && ['received', 'confirmed', 'preparing'].includes(order.fulfillmentState)) return 'Prepare Gift Box';
  return null;
}
