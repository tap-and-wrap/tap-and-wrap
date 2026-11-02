import { emailError } from './settings.js';

const CONTENT = Object.freeze({
  owner_new: ['New customer contact required', 'A new order or custom request needs your initial WhatsApp contact within 12 hours. Open WhatsApp manually, then record Mark as Contacted in the dashboard.'],
  owner_contact_reminder: ['Customer contact: 9-hour reminder', 'This is the one reminder scheduled nine hours after submission, three hours before the original 12-hour deadline shown below. Contact the customer through WhatsApp and mark actual contact in the dashboard. No further initial-contact email is sent at 12 hours.'],
  owner_action: ['A customer workflow needs attention', 'Review the saved authoritative record in the admin dashboard. This alert never verifies payment or records customer acceptance.'],
  request_received: ['We received your custom request', 'No payment is due now. The owner will contact you through WhatsApp within 12 hours about product/work, add-ons and delivery.'],
  request_quotation: ['Your custom quotation copy', 'This supports the quotation shared manually through WhatsApp. Confirm the quotation version and payment method with the owner. Do not transfer until acceptance is recorded and an order reference is confirmed.'],
  request_accepted: ['Your custom quotation acceptance was recorded', 'The owner recorded your WhatsApp acceptance. Wait for confirmation of the actual order reference and inventory allocation before transferring. You do not need an account or a website proof upload.'],
  request_closed: ['Your custom request was closed', 'Contact the owner through WhatsApp about this request. This message does not confirm a payment or refund.'],
  order_updated: ['Order update: order updated', 'Review your secure order page for the latest amounts and status. This message does not request a duplicate payment.'],
  charge_quoted: ['Your delivery or additional-charge quotation', 'The owner has saved a quotation. Confirm the amount and collection method through WhatsApp before paying an additional charge.'],
  charge_accepted: ['Your additional-charge acceptance was recorded', 'Your acceptance of the saved delivery or add-on quotation is recorded. Your original merchandise payment remains separate.'],
  proof_submitted: ['Payment proof received for review', 'Your evidence is securely attached to the order and awaits independent receiving-account reconciliation. Your order is not marked Paid merely because proof was uploaded. Do not send another transfer.'],
  refund_recorded: ['A refund was recorded', 'The owner has recorded a reconciled refund. Recorded refund and outstanding balances are shown below. Contact us through WhatsApp if you need help matching the return transfer.'],
  cancellation_requested: ['Your cancellation request is being reviewed', 'The owner will review fulfillment, actual transfers and any applicable refund. This request alone does not confirm cancellation or refund.'],
  inventory_reconciled: ['Order update: inventory reconciled', 'Review your secure order page for the latest amounts and status. This message does not request a duplicate payment.'],
  discount_reversed: ['Order update: discount reversed', 'Review your secure order page for the latest amounts and status. This message does not request a duplicate payment.'],
  delivery_failed: ['Delivery needs your attention', 'Please contact the owner through WhatsApp to arrange the next step. A failed delivery does not automatically confirm a refund or return.'],
  returned: ['Your return is being reviewed', 'Returned items and applicable remedies are being reviewed. Refunds are confirmed separately after reconciliation.'],
  order_received: ['We received your order', 'Your order has been received. Payment and fulfillment updates will follow when confirmed.'],
  payment_confirmed: ['Reconciled funds were recorded', 'Tap & Wrap independently reconciled received funds. Review the recorded payment status and outstanding balance below; a partial payment is not a fully paid order.'],
  payment_rejected: ['Your payment needs attention', 'Your payment could not be confirmed. Please contact Tap & Wrap before sending a replacement transfer.'],
  order_confirmed: ['Your order is confirmed', 'Your order has been confirmed.'],
  preparing: ['We are preparing your order', 'Your order is now being prepared.'],
  out_for_delivery: ['Your order is out for delivery', 'Your order is out for delivery.'],
  delivered: ['Your order was delivered', 'Your order has been marked delivered.'],
  cancelled: ['Your order was cancelled', 'Your order has been cancelled. This notification does not confirm a refund.'],
  password_reset: ['Reset your password', 'Use the secure link below to choose a new password. This link expires shortly and can be used once. If you did not request it, you can ignore this email.'],
  password_changed: ['Your password was changed', 'Your Tap & Wrap password has been changed and previous sessions have been signed out. If you did not make this change, contact Tap & Wrap.'],
  email_verification: ['Verify your email address', 'Use the secure link below to verify your Tap & Wrap email address. This link can be used once.'],
  email_smoke_test: ['Tap & Wrap email connection test', 'This is one explicitly requested developer email test. No order, payment or customer action has been created.'],
});

export const EMAIL_TEMPLATE_EVENTS = Object.freeze(Object.keys(CONTENT));
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function safeClientOrigin(value) {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) throw new Error();
    return url.origin;
  } catch { throw emailError('INVALID_EMAIL_SITE_ORIGIN', { terminal: true }); }
}

export function renderEmailTemplate(event, { clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173', actionUrl } = {}) {
  const content = CONTENT[event?.event];
  if (!content) throw emailError('INVALID_EMAIL_TEMPLATE', { terminal: true });
  const [title, introduction] = content;
  const snapshot = event.snapshot || {};
  const orderNumber = /^\d{6}$/.test(String(snapshot.orderNumber || '')) ? String(snapshot.orderNumber) : null;
  const origin = safeClientOrigin(clientOrigin);
  const accountAction = ['password_reset', 'email_verification'].includes(event.event);
  let link = new URL(orderNumber ? '/track-order' : '/login', origin).href;
  let linkText = orderNumber ? 'Track your order' : 'Visit Tap & Wrap';
  if (accountAction) {
    try {
      const candidate = new URL(actionUrl);
      const expectedPath = event.event === 'password_reset' ? '/reset-password' : '/verify-email';
      if (candidate.origin !== origin || candidate.pathname !== expectedPath || candidate.search || !/^#token=[A-Za-z0-9_-]{43}$/.test(candidate.hash)) throw new Error();
      link = candidate.href;
    } catch { throw emailError('INVALID_EMAIL_ACTION_LINK', { terminal: true }); }
    linkText = event.event === 'password_reset' ? 'Reset password' : 'Verify email';
  }
  const lines = [introduction];
  for (const item of (Array.isArray(snapshot.items) ? snapshot.items : []).slice(0, 20)) {
    if (typeof item.name !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    lines.push(`${item.name.slice(0, 160)} x ${item.quantity}.`);
    if (item.kind === 'gift_box_v2') {
      const components = (Array.isArray(item.giftBox?.components) ? item.giftBox.components : []).slice(0, 40)
        .filter(component => typeof component.name === 'string' && Number.isSafeInteger(component.quantity) && component.quantity > 0);
      for (const component of components) lines.push(`Per completed gift box: ${component.name.slice(0, 120)} x ${component.quantity}.`);
      lines.push(`Gift card: ${item.giftBox?.giftCardSelected === true ? 'selected; personal message remains on the secure order page' : 'not selected'}.`);
    }
  }
  let ownerWhatsapp = null;
  if (/^TW-[A-F0-9]{12}$/.test(snapshot.requestReference || '')) {
    lines.push(`Request ${snapshot.requestReference}.`); link = new URL('/contact', origin).href; linkText = 'Contact Tap & Wrap';
    if (Number.isSafeInteger(snapshot.quotationTotalPiastres)) {
      lines.push(`Quotation v${snapshot.quotationVersion}: EGP ${(snapshot.quotationTotalPiastres / 100).toFixed(2)}.`, `Product/work: EGP ${(snapshot.baseUnitPiastres / 100).toFixed(2)} × ${snapshot.quantity}. Discount: EGP ${(snapshot.discountPiastres / 100).toFixed(2)}.`, `Delivery: EGP ${(snapshot.shippingPiastres / 100).toFixed(2)} (confirmed in this quotation).`);
      for (const charge of (snapshot.charges || []).slice(0, 25)) if (typeof charge.label === 'string' && Number.isSafeInteger(charge.unitPricePiastres) && Number.isSafeInteger(charge.quantity)) lines.push(`${charge.label}: EGP ${(charge.unitPricePiastres * charge.quantity / 100).toFixed(2)}.`);
      lines.push(`Available payment methods: ${(snapshot.allowedPaymentMethods || []).filter(method => ['cod', 'instapay'].includes(method)).join(' / ')}.`);
    }
  }
  if (orderNumber) lines.push(`Order ${orderNumber}.`);
  if (snapshot.orderChannel === 'owner_quotation') {
    link = new URL('/contact', origin).href; linkText = 'Contact Tap & Wrap';
    if (Number.isSafeInteger(snapshot.acceptedQuotationTotalPiastres)) lines.push(`Accepted quotation total: EGP ${(snapshot.acceptedQuotationTotalPiastres / 100).toFixed(2)}.`);
    lines.push('WhatsApp remains your primary channel. No website return visit is required.');
  }
  if (Number.isSafeInteger(snapshot.totalPiastres) && snapshot.totalPiastres >= 0) {
    const whole = Math.floor(snapshot.totalPiastres / 100);
    const fraction = String(snapshot.totalPiastres % 100).padStart(2, '0');
    lines.push(`${snapshot.accountingVersion === 1 ? 'Original merchandise amount' : 'Order total'}: EGP ${whole}.${fraction}.`);
  }
  if (event.event === 'order_received' && snapshot.paymentMethod === 'cod') lines.push('Cash on Delivery payment remains unpaid until collection is confirmed.');
  if (event.event === 'order_received' && snapshot.paymentMethod === 'instapay') lines.push(snapshot.orderChannel === 'owner_quotation' ? 'Your accepted quotation is recorded. Use the agreed payment method. For InstaPay, transfer to 01060673073 and send the screenshot to the owner through WhatsApp. You do not need a website account or website proof upload; the owner independently reconciles the receiving account.' : snapshot.accountingVersion === 1 ? 'Your order has been created. Transfer the merchandise amount only to InstaPay 01060673073 using your order reference, then submit proof on your secure order page. Payment awaits manual reconciliation.' : 'Your InstaPay transfer is awaiting manual verification. An uploaded proof does not confirm payment.');
  if (snapshot.accountingVersion === 1) {
    if (['unpaid', 'awaiting_transfer', 'awaiting_verification', 'partially_paid', 'paid', 'rejected', 'refunded'].includes(snapshot.paymentState)) lines.push(`${snapshot.orderChannel === 'owner_quotation' ? 'Accepted quotation payment status' : 'Merchandise payment status'}: ${snapshot.paymentState.replaceAll('_', ' ')}.`);
    for (const [key, label] of [['collectedPiastres', 'Recorded collections'], ['refundedPiastres', 'Recorded refunds'], ['outstandingPiastres', 'Agreed outstanding balance']]) {
      const amount = snapshot.financial?.[key];
      if (Number.isSafeInteger(amount) && amount >= 0) lines.push(`${label}: EGP ${(amount / 100).toFixed(2)}.`);
    }
    if (snapshot.shippingState !== 'accepted') lines.push('Delivery is separate. The owner will contact you within 12 hours to review delivery arrangements; the fee is agreed separately. Pending delivery is not free shipping.');
    if (snapshot.shippingState === 'accepted') lines.push(snapshot.orderChannel === 'owner_quotation' ? 'Delivery was accepted as a separate charge in your WhatsApp quotation; its amount and collection method are listed below.' : 'An additional delivery fee has been accepted. Review the secure order page for its separate amount and collection method.');
    for (const charge of (Array.isArray(snapshot.charges) ? snapshot.charges : []).slice(0, 30)) {
      if (typeof charge.label !== 'string' || charge.label.length > 120) continue;
      const amount = charge.amountPiastres === null ? 'Pending Confirmation' : charge.pricing === 'free' ? 'Explicitly free' : Number.isSafeInteger(charge.amountPiastres) && charge.amountPiastres >= 0 ? `EGP ${(charge.amountPiastres / 100).toFixed(2)}` : 'Pending Confirmation';
      lines.push(`${charge.label}: ${amount}. ${['pending', 'offered', 'accepted', 'declined'].includes(charge.state) ? charge.state : 'Pending Confirmation'}${['cod', 'instapay'].includes(charge.collectionMethod) ? `; ${charge.collectionMethod === 'cod' ? 'Cash on Delivery' : 'InstaPay'}` : ''}.`);
    }
  }
  if (event.audience === 'owner') {
    const reference = String(snapshot.reference || '');
    if (/^(?:[1-9][0-9]{5}|TW-[A-F0-9]{12})$/.test(reference)) {
      lines.push(`Reference: ${reference}. Service: ${snapshot.service === 'gift_box' ? 'Build Your Gift Box' : snapshot.service === 'laser_engraving' ? 'Laser Engraving' : 'Regular order'}.`);
      if (Number.isSafeInteger(snapshot.merchandisePiastres)) lines.push(`Approved merchandise: EGP ${(snapshot.merchandisePiastres / 100).toFixed(2)}. Delivery is separately confirmed.`);
      const localDate = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : null;
      if (localDate(snapshot.submittedAt)) lines.push(`Submitted (Cairo): ${localDate(snapshot.submittedAt)}.${event.event === 'owner_action' || !localDate(snapshot.dueAt) ? '' : ` Initial contact due (Cairo): ${localDate(snapshot.dueAt)}.`}`);
      const actionLabels = { payment_exception: 'Partial, excess or exceptional payment needs reconciliation', proof_submitted: 'Payment proof awaits reconciliation', request_accepted: 'Quotation acceptance recorded', charge_accepted: 'Additional charge acceptance recorded', payment_rejected: 'Payment requires follow-up', cancellation_requested: 'Cancellation requires review', delivery_failed: 'Delivery exception', returned: 'Return requires review' };
      if (actionLabels[snapshot.action]) lines.push(actionLabels[snapshot.action]);
      const phone = String(snapshot.phone || '').replace(/\D/g, '').replace(/^0(?=1)/, '20');
      if (/^201[0125][0-9]{8}$/.test(phone)) ownerWhatsapp = `https://wa.me/${phone}?text=${encodeURIComponent('Tap & Wrap | Reference ' + reference + '\nThank you for contacting us. We are reviewing your details.')}`;
      if (ownerWhatsapp) lines.push(`Customer WhatsApp: +${phone}.`);
    }
    link = new URL('/admin/attention', origin).href; linkText = 'Review attention dashboard';
  }
  const text = `${title}\n\n${lines.join('\n\n')}\n\n${ownerWhatsapp ? `Contact on WhatsApp: ${ownerWhatsapp}\n\n` : ''}${linkText}: ${link}\n\nTap & Wrap\nUnlock the Magic of Giving\nThoughtful gifts, made personal`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#FFFCFB;color:#62483F;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#FFFFFF;border:1px solid #EADAD5;border-radius:12px"><tr><td style="padding:28px 24px;border-bottom:1px solid #EADAD5;color:#915B50;font-family:Georgia,serif;font-size:28px">Tap &amp; Wrap<br><span style="font-family:Arial,sans-serif;font-size:13px;color:#795045">Unlock the Magic of Giving</span></td></tr><tr><td style="padding:28px 24px"><h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:28px;font-weight:500">${escapeHtml(title)}</h1>${ownerWhatsapp ? `<p><a href="${escapeHtml(ownerWhatsapp)}" style="display:inline-block;background:#795045;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none">Contact on WhatsApp</a></p>` : ''}${lines.map(line => `<p style="margin:0 0 16px;line-height:1.6;overflow-wrap:anywhere">${escapeHtml(line)}</p>`).join('')}<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#795045;color:#FFFFFF;padding:14px 22px;border-radius:6px;text-decoration:none">${escapeHtml(linkText)}</a></p><p style="font-size:13px;line-height:1.5;color:#915B50">${accountAction ? 'Keep this link private.' : 'Private uploaded files and payment proofs are never attached to this email.'}</p><p style="border-top:1px solid #EADAD5;padding-top:20px;font-size:13px;color:#915B50">Thoughtful gifts, made personal<br>Tap &amp; Wrap</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: `${title}${orderNumber ? ` · ${orderNumber}` : ''}`, text, html };
}
