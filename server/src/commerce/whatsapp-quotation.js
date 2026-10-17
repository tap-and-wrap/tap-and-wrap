const money = value => `EGP ${(value / 100).toFixed(2)}`;
// Derived only from saved records. Opening the link never records send/delivery/acceptance.
export function whatsappQuotation(order, accounting) {
  const lines = [`Tap & Wrap | Order #${order.orderNumber}`, `Merchandise: ${money(order.totals.totalPiastres)}`];
  for (const charge of accounting?.charges || []) {
    lines.push(`${charge.label}: ${charge.amountPiastres === null ? 'Pending confirmation' : charge.pricing === 'free' ? 'Explicitly free' : money(charge.amountPiastres)} (${charge.state}; quotation version ${charge.quotationVersion || 0})`);
    if (charge.allowedPaymentMethods?.length) lines.push(`Available payment: ${charge.allowedPaymentMethods.map(method => method === 'cod' ? 'Cash on Delivery' : 'InstaPay').join(' / ')}`);
  }
  lines.push(`Original merchandise payment: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'InstaPay'}.`);
  if (accounting) lines.push(`Recorded collections: ${money(accounting.collectedPiastres)}. Recorded refunds: ${money(accounting.refundedPiastres)}. Agreed outstanding: ${money(accounting.outstandingPiastres)}.`);
  lines.push('Please confirm the quoted amounts and payment method in WhatsApp. Additional charges become agreed only after your acceptance is recorded. Do not pay an unconfirmed charge.', 'After acceptance, agreed InstaPay payments go to 01060673073. Include your order reference. Payments are verified against the actual receiving account.', 'Tap & Wrap will contact you within 12 hours about pending delivery or quotations.');
  const text = lines.join('\n');
  const phone = String(order.customer?.phone || '').replace(/\D/g, '');
  return { text, url: /^201[0125][0-9]{8}$/.test(phone) ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null, deliveryConfirmed: false };
}
