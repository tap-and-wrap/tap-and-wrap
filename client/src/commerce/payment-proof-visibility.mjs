export function actionableProofInstructions(order) {
  const checkoutScopes = new Set(['checkout', ...(order.paymentObligations || []).map(group => group.id)]);
  const rejected = order.paymentAttention?.receiptReplacementEnabled === true || order.proofStatus === 'rejected';
  if (order.accountingVersion === 2) return (order.paymentInstructionsByGroup || []).filter(instruction => {
    if (instruction.proofStatus === 'submitted') return false;
    if (order.checkoutPayment && checkoutScopes.has(instruction.scope)) return instruction.proofStatus === 'rejected' || instruction.scope === 'checkout' && rejected;
    return true;
  });
  if (order.collectionAuthorized === false || !order.paymentInstructions || order.paymentMethod !== 'instapay') return [];
  if (!rejected && (order.checkoutPayment || order.proofStatus === 'submitted' || order.paymentState === 'awaiting_verification')) return [];
  return [{ ...order.paymentInstructions, scope: 'merchandise' }];
}
