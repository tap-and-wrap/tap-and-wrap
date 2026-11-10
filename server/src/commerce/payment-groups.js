import { isEngravingKind } from '../../../shared/engraving/definitions.mjs';
import { commerceError, checkedMoney } from './errors.js';

export const groupedOrder = order => order.accountingVersion === 2;
export function initialPaymentGroups(lines, totals, method) {
  const engraving = lines.filter(line => isEngravingKind(line.kind)).reduce((sum, line) => checkedMoney(sum + line.lineTotalPiastres), 0);
  const merchandise = checkedMoney(totals.totalPiastres - engraving);
  if (merchandise < 0) throw commerceError(409, 'INVALID_PAYMENT_ALLOCATION', 'The verified order allocation is invalid.');
  return [
    ...(lines.some(line => !isEngravingKind(line.kind)) ? [{ id: 'merchandise', label: 'Products & Gift Boxes', amountPiastres: merchandise, method }] : []),
    ...(lines.some(line => isEngravingKind(line.kind)) ? [{ id: 'engraving', label: 'Engraving after inspection', amountPiastres: engraving, method }] : []),
  ];
}
export function groupAuthorized(order, scope) {
  if (scope !== 'engraving') return !['returned','cancelled'].includes(order.merchandiseFulfillment);
  return order.engraving?.collectionAuthorized === true && (order.engraving.collectionMethod !== 'cod' || order.engraving.codCommitment?.customerAccepted === true);
}
export function groupMethod(order, group) {
  return group.id === 'engraving' ? order.engraving?.collectionMethod || group.method : group.method;
}
export function groupBalances(order, netFor, reductionFor) {
  return (order.paymentGroups || []).map(group => {
    // Inspection is not a chargeable engraving service. A wholly declined,
    // unworked group returned before collection authorization has no service due.
    // Keep the original quoted snapshot and explicit custody/inspection history.
    const notProvided = group.id === 'engraving' && !order.engraving?.collectionAuthorized && order.engraving?.items.length > 0
      && order.engraving.items.every(item => item.stage === 'returned_to_customer' && !item.history?.some(entry => entry.action === 'complete'));
    const amount = notProvided ? 0 : Math.max(0, group.amountPiastres - reductionFor(group.id));
    const collected = netFor(group.id), authorized = groupAuthorized(order, group.id);
    return { ...group, method: groupMethod(order, group), authorized, payablePiastres: amount, collectedPiastres: collected,
      outstandingPiastres: Math.max(0, amount - collected),
      codCommitted: group.id === 'engraving' && order.engraving?.codCommitment?.customerAccepted === true && authorized,
      status: notProvided ? 'not_provided' : !authorized ? group.id === 'engraving' ? 'deferred' : 'return_review' : collected >= amount ? 'paid' : collected > 0 ? 'partially_paid' : group.id === 'engraving' && order.engraving?.codCommitment?.customerAccepted ? 'cod_committed' : 'unpaid' };
  });
}
export function groupedPaymentState(order, summary) {
  const net = summary.collectedPiastres - summary.refundedPiastres;
  if (summary.refundedPiastres > 0 && net === 0) return 'refunded';
  if (summary.agreedTotalPiastres > 0 && summary.groups.every(group => (group.authorized || group.status === 'not_provided') && group.outstandingPiastres === 0) && summary.outstandingPiastres === 0) return 'paid';
  if (net > 0) return 'partially_paid';
  if (order.proofReviewRequired) return 'awaiting_verification';
  return 'unpaid';
}
export function engravingWorkAllowed(order, summary) {
  if (!order.engraving?.collectionAuthorized) return false;
  if (!groupedOrder(order)) return order.paymentState === 'paid';
  const group = summary.groups.find(group => group.id === 'engraving');
  return group?.status === 'paid' || group?.codCommitted === true;
}
export function overallFulfillment(order, engraving = order.engraving, merchandise = order.merchandiseFulfillment) {
  if (['cancelled', 'returned'].includes(order.fulfillmentState)) return order.fulfillmentState;
  if (!engraving) return merchandise || 'received';
  const hasMerchandise = order.paymentGroups?.some(group => group.id === 'merchandise');
  const servicesDone = !engraving || engraving.items.every(item => item.stage === 'returned_to_customer');
  if (servicesDone && hasMerchandise && merchandise === 'returned') return 'completed_with_changes';
  if ((!hasMerchandise || merchandise === 'delivered') && servicesDone) return engraving.items.every(item => item.history?.some(entry => entry.action === 'complete')) ? 'delivered' : 'completed_with_changes';
  if (engraving?.items.some(item => ['engraving_in_progress','engraving_completed','return_arranged','return_dispatched'].includes(item.stage)) || merchandise && merchandise !== 'received') return 'preparing';
  return 'received';
}

export function groupedAccountingSummary(order, settlements) {
  const sum = values => values.reduce((a, b) => checkedMoney(a + b), 0);
  const allocated = (entry, scope) => sum((entry.allocations?.length ? entry.allocations : [{scope:entry.scope,amountPiastres:entry.amountPiastres}]).filter(part => part.scope === scope).map(part => part.amountPiastres));
  const collections = settlements.filter(entry => entry.direction === 'collection'), refunds = settlements.filter(entry => entry.direction === 'refund');
  const net = scope => sum(collections.map(entry => allocated(entry, scope))) - sum(refunds.map(entry => allocated(entry, scope)));
  const reduction = scope => sum(refunds.filter(entry => entry.reducePayable).map(entry => allocated(entry, scope)));
  const groups = groupBalances(order, net, reduction);
  const charges = (order.charges || []).map(charge => ({...Object.fromEntries(['id','kind','label','amountPiastres','pricing','state','collectionMethod','createdAt','quotedAt','acceptedAt','allowedPaymentMethods','quotationVersion','acceptanceChannel'].filter(key => charge[key] !== undefined).map(key => [key,charge[key]])), outstandingPiastres:charge.state === 'accepted' ? Math.max(0, charge.amountPiastres - reduction(charge.id) - net(charge.id)) : null,
    authorized:groupAuthorized(order, charge.id === 'return_shipping' ? 'engraving' : 'merchandise')}));
  const scopes = [...groups.map(group => ({...group, amountPiastres:group.payablePiastres})), ...charges.filter(charge => charge.state === 'accepted').map(charge => ({...charge, amountPiastres:Math.max(0, charge.amountPiastres - reduction(charge.id))}))];
  const closed = ['cancelled','returned'].includes(order.fulfillmentState);
  return {groups, charges, collectionAuthorized:groups.some(group => group.authorized),
    amountDueNowPiastres:closed ? 0 : sum(scopes.filter(scope => scope.authorized && (scope.method || scope.collectionMethod) === 'instapay').map(scope => scope.outstandingPiastres)),
    merchandisePiastres:order.totals.totalPiastres, merchandisePayablePiastres:groups.find(group => group.id === 'merchandise')?.payablePiastres || 0, merchandiseCollectedPiastres:net('merchandise'),
    collectedPiastres:sum(collections.map(entry => entry.amountPiastres)), refundedPiastres:sum(refunds.map(entry => entry.amountPiastres)),
    agreedTotalPiastres:sum(scopes.map(scope => scope.amountPiastres)), outstandingPiastres:closed ? 0 : sum(scopes.map(scope => scope.outstandingPiastres)),
    overpaymentPiastres:sum(scopes.map(scope => Math.max(0, net(scope.id) - scope.amountPiastres))),
    unresolvedCharges:charges.filter(charge => ['pending','offered','declined'].includes(charge.state)).length,
    refundReviewRequired:closed ? sum(collections.map(entry => entry.amountPiastres)) > sum(refunds.map(entry => entry.amountPiastres)) : order.merchandiseFulfillment === 'returned' && net('merchandise') > 0};
}
