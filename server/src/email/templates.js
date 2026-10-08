import { emailError } from './settings.js';

const CONTENT = Object.freeze({
  order_received: ['We received your order', 'Your order has been received. Payment and fulfillment updates will follow when confirmed.'],
  payment_confirmed: ['Your payment was confirmed', 'Tap & Wrap has manually confirmed your payment.'],
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
  if (orderNumber) lines.push(`Order ${orderNumber}.`);
  if (Number.isSafeInteger(snapshot.totalPiastres) && snapshot.totalPiastres >= 0) {
    const whole = Math.floor(snapshot.totalPiastres / 100);
    const fraction = String(snapshot.totalPiastres % 100).padStart(2, '0');
    lines.push(`Order total: EGP ${whole}.${fraction}.`);
  }
  if (event.event === 'order_received' && snapshot.paymentMethod === 'cod') lines.push('Cash on Delivery payment remains unpaid until collection is confirmed.');
  if (event.event === 'order_received' && snapshot.paymentMethod === 'instapay') lines.push('Your InstaPay transfer is awaiting manual verification. An uploaded proof does not confirm payment.');
  const text = `${title}\n\n${lines.join('\n\n')}\n\n${linkText}: ${link}\n\nTap & Wrap`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#FFFCFB;color:#62483F;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#FFFFFF;border:1px solid #EADAD5;border-radius:12px"><tr><td style="padding:28px 24px;border-bottom:1px solid #EADAD5;color:#915B50;font-family:Georgia,serif;font-size:28px">Tap &amp; Wrap</td></tr><tr><td style="padding:28px 24px"><h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:28px;font-weight:500">${escapeHtml(title)}</h1>${lines.map(line => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(line)}</p>`).join('')}<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#795045;color:#FFFFFF;padding:14px 22px;border-radius:6px;text-decoration:none">${escapeHtml(linkText)}</a></p><p style="font-size:13px;line-height:1.5;color:#915B50">${accountAction ? 'Keep this link private.' : 'Private uploaded files and payment proofs are never attached to this email.'}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: `${title}${orderNumber ? ` · ${orderNumber}` : ''}`, text, html };
}
