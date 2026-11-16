import test from 'node:test';
import assert from 'node:assert/strict';
import { presentTrackingOrder } from '../src/commerce/tracking-presentation.js';
import { renderEmailTemplate, EMAIL_TEMPLATE_EVENTS } from '../src/email/templates.js';
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { createGmailProvider } from '../src/email/gmail.js';
import sharp from 'sharp';
import { prepareSelectedImages } from '../../client/src/components/selected-images.mjs';
import { verifyImageIntegrity } from '../src/media/image-integrity.js';

test('phone/reference tracking allowlist excludes every owned/private field', () => {
  const result = presentTrackingOrder({ orderNumber: '123456', fulfillmentState: 'preparing', paymentState: 'unpaid', accountingVersion: 2, createdAt: '2026-11-15T10:00:00Z', totals: { totalPiastres: 12300 }, customer: { address: 'PRIVATE' }, checkoutKey: 'PRIVATE', paymentProofId: 'PRIVATE', history: [{ internalNote: 'PRIVATE' }], lines: [{ kind: 'gift_box_v2', name: 'PRIVATE', quantity: 1, personalization: 'PRIVATE' }, { kind: 'product', name: 'A gift', quantity: 2, mainImageUrl: 'PRIVATE' }] });
  assert.deepEqual(result.items, [{ name: 'Gift Box', quantity: 1 }, { name: 'A gift', quantity: 2 }]);
  assert.equal(result.totalPiastres, 12300);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.deepEqual(Object.keys(result).sort(), ['orderNumber', 'fulfillmentState', 'paymentState', 'createdAt', 'updatedAt', 'shippingStatus', 'items', 'totalPiastres'].sort());
});
test('every email family shares the original logo, escaped content, one primary CTA and plain text', () => {
  for (const event of EMAIL_TEMPLATE_EVENTS) {
    const message = renderEmailTemplate({ event, audience: 'owner', snapshot: { reference: '123456', items: [{ name: '<script>bad</script>', quantity: 1 }] } }, { clientOrigin: 'https://tapandwrap.net', actionUrl: `https://tapandwrap.net/${event === 'password_reset' ? 'reset-password' : 'verify-email'}#token=${'a'.repeat(43)}` });
    assert.match(message.html, /https:\/\/tapandwrap.net\/tap-wrap-email-logo.png/);
    assert.match(message.html, /role="presentation"/);
    assert.doesNotMatch(message.html, /<script>/);
    assert.ok(message.text.length > 100);
    assert.equal((message.html.match(/font-weight:bold">/g) || []).length, 1);
  }
  const asset = readFileSync(new URL('../src/email/assets/tap-wrap-email-logo.png', import.meta.url));
  assert.deepEqual(asset, readFileSync(new URL('../../client/public/tap-wrap-email-logo.png', import.meta.url)));
});

test('bundled logo serializes as a small inline CID image without a network request', async () => {
  let mime;
  const offline = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const provider = createGmailProvider({ EMAIL_PROVIDER:'gmail', EMAIL_ENABLED:'true', EMAIL_USER:'sender@example.test', EMAIL_APP_PASSWORD:'abcdefghijklmnop', EMAIL_FROM_NAME:'Tap & Wrap', NOTIFICATION_SAFE_RECIPIENTS:'safe@example.test', CLIENT_ORIGIN:'https://tapandwrap.net', NODE_ENV:'development', DATABASE_TARGET:'local' }, { createTransport: () => ({ sendMail: async message => { const result = await offline.sendMail(message); mime = result.message.toString(); return { accepted:[message.to], rejected:[] }; } }) });
  await provider.send({ event:'email_smoke_test', eventKey:'offline-cid-test', recipient:'safe@example.test', snapshot:{} });
  assert.match(mime, /Content-ID: <tapwrap-brand-logo>/i);
  assert.match(mime, /Content-Type: image\/png/i);
  assert.match(mime, /Content-Disposition: inline/i);
  assert.match(mime, /cid:tapwrap-brand-logo/);
  assert.ok(Buffer.byteLength(mime) < 400000);
  offline.close();
});

test('canonical JPEG/JPG, PNG and WebP selections satisfy the real private-upload decoder', async () => {
  for (const [format, declared, expected] of [['jpeg','image/pjpeg','image/jpeg'], ['png','image/png','image/png'], ['webp','image/webp','image/webp']]) {
    const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#915B50' } }).toFormat(format).toBuffer();
    const [file] = await prepareSelectedImages([new File([bytes], `camera.${format === 'jpeg' ? 'jpg' : format}`, { type:declared })], { maxBytes:8*1024*1024, inspect:async image=>{const metadata=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(metadata.width,8);} });
    assert.equal(file.type, expected);
    assert.deepEqual(await verifyImageIntegrity(Buffer.from(await file.arrayBuffer()), file.type), { width:8, height:6 });
  }
});
