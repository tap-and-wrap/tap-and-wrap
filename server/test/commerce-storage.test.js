import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { startTestDatabase } from './helpers/database.js';
import { env } from '../src/config/env.js';
import { Upload } from '../src/models/Upload.js';
import { UploadQuota } from '../src/models/UploadQuota.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { CheckoutIntent } from '../src/models/CheckoutIntent.js';
import {
  createMemoryStorage, setStorageForTests, createR2Storage, imageDimensions,
  inspectStoredImage, privateObjectKey,
} from '../src/commerce/storage.js';
import {
  completeUpload, validateUploadReferences, deleteUpload, cleanupExpiredUploads,
  openPrivateUpload, serializeUpload, signUpload, retainUploads, transferUploadOwnership,
  attachUploadsToCart, detachUploadsFromCart, detachUnusedCartUploads,
} from '../src/commerce/uploads.js';
import {
  enqueueOrderEvent, runNotificationBatch, setNotificationProviderForTests,
  assertSafeNotificationRecipient, notificationSettings, retryDelayMs,
} from '../src/commerce/notifications.js';
import { recordAdminAudit } from '../src/commerce/audit.js';
import { parseJobArguments, runCommerceJobs } from '../scripts/run-commerce-jobs.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X8kQAAAAASUVORK5CYII=', 'base64');
const guest = `guest:${'a'.repeat(64)}`;
const otherGuest = `guest:${'b'.repeat(64)}`;
const account = `user:${new mongoose.Types.ObjectId()}`;
let fixture;
let storage;
const originalCheckout = env.checkoutEnabled;

before(async () => {
  fixture = await startTestDatabase({ models: [Upload, UploadQuota, AdminAudit, NotificationEvent, CheckoutIntent], transactions: true });
});
after(async () => {
  env.checkoutEnabled = originalCheckout;
  setStorageForTests();
  setNotificationProviderForTests();
  await fixture?.stop();
});
beforeEach(async () => {
  for (const model of [Upload, UploadQuota, AdminAudit, NotificationEvent, CheckoutIntent]) await model.deleteMany({});
  storage = createMemoryStorage();
  setStorageForTests(storage);
  setNotificationProviderForTests();
  env.checkoutEnabled = false;
});

async function pendingUpload(owner = guest, overrides = {}) {
  const upload = await Upload.create({
    owner, purpose: 'personalization', fieldKey: 'photo', mimeType: 'image/png', sizeBytes: PNG.length,
    temporaryKey: privateObjectKey(), signedExpiresAt: new Date(Date.now() + 300000),
    expiresAt: new Date(Date.now() + 86400000), ...overrides,
  });
  await UploadQuota.updateOne({ owner }, { $inc: { activeCount: 1, activeBytes: PNG.length }, $setOnInsert: { owner } }, { upsert: true });
  storage.put(upload.temporaryKey, PNG);
  return upload;
}

test('R2 stays unavailable without explicit complete configuration', () => {
  assert.throws(() => createR2Storage({ STORAGE_ENABLED: 'false' }), { code: 'STORAGE_UNAVAILABLE' });
  assert.throws(() => createR2Storage({ STORAGE_ENABLED: 'true', R2_ACCOUNT_ID: 'unsafe/endpoint' }), { code: 'STORAGE_UNAVAILABLE' });
  assert.deepEqual(imageDimensions(PNG, 'image/png'), { width: 1, height: 1 });
  assert.throws(() => imageDimensions(Buffer.from('<svg></svg>'), 'image/png'), { code: 'INVALID_IMAGE' });
});

test('actual file type, declared size and image dimensions are validated', async () => {
  storage.put('image', PNG);
  assert.deepEqual((await inspectStoredImage(storage, 'image', { mimeType: 'image/png', sizeBytes: PNG.length })).width, 1);
  await assert.rejects(inspectStoredImage(storage, 'image', { mimeType: 'image/jpeg', sizeBytes: PNG.length }), { code: 'INVALID_IMAGE' });
  await assert.rejects(inspectStoredImage(storage, 'image', { mimeType: 'image/png', sizeBytes: PNG.length + 1 }), { code: 'INVALID_IMAGE' });
  const bomb = Buffer.from(PNG);
  bomb.writeUInt32BE(12000, 16); bomb.writeUInt32BE(12000, 20);
  assert.throws(() => imageDimensions(bomb, 'image/png'), { code: 'INVALID_IMAGE' });
});

test('JPEG frame and WebP dimensions use the actual encoded headers', () => {
  const jpegHeader = Buffer.from('ffd8ffe000040000ffc0000b080001000201011100ffd9', 'hex');
  assert.deepEqual(imageDimensions(jpegHeader, 'image/jpeg'), { width: 2, height: 1 });
  const webpHeader = Buffer.alloc(30);
  webpHeader.write('RIFF', 0, 'ascii'); webpHeader.writeUInt32LE(22, 4);
  webpHeader.write('WEBP', 8, 'ascii'); webpHeader.write('VP8X', 12, 'ascii');
  webpHeader.writeUInt32LE(10, 16); webpHeader.writeUIntLE(1, 24, 3);
  assert.deepEqual(imageDimensions(webpHeader, 'image/webp'), { width: 2, height: 1 });
  assert.throws(() => imageDimensions(PNG, 'image/jpeg'), { code: 'INVALID_IMAGE' });
});

test('completion verifies and copies away from an overwriteable signed key', async () => {
  const upload = await pendingUpload();
  const result = await completeUpload(String(upload._id), guest);
  assert.equal(result.state, 'complete');
  assert.equal(result.width, 1);
  assert.equal(JSON.stringify(result).includes('commerce/'), false);
  const saved = await Upload.findById(upload._id).select('+temporaryKey +objectKey');
  assert.notEqual(saved.objectKey, saved.temporaryKey);
  storage.put(saved.temporaryKey, Buffer.from('replacement'), 'image/png');
  assert.equal((await storage.head(saved.objectKey)).sizeBytes, PNG.length);
  assert.deepEqual(await completeUpload(String(upload._id), guest), result);
});

test('upload ownership, configured references and duplicate image IDs are enforced', async () => {
  const upload = await pendingUpload();
  await completeUpload(String(upload._id), guest);
  await assert.rejects(completeUpload(String(upload._id), otherGuest), { status: 404 });
  await assert.rejects(validateUploadReferences([String(upload._id)], otherGuest), { code: 'INVALID_UPLOAD_REFERENCES' });
  await assert.rejects(validateUploadReferences([String(upload._id), String(upload._id)], guest), { code: 'INVALID_UPLOAD_REFERENCES' });
  await assert.rejects(validateUploadReferences([String(upload._id)], guest, { purpose: 'payment_proof' }), { code: 'INVALID_UPLOAD_REFERENCES' });
  assert.equal((await validateUploadReferences([String(upload._id)], guest, { purpose: 'personalization', fieldKey: 'photo' })).length, 1);
});

test('failed verification queues cleanup and never declares a successful upload', async () => {
  const upload = await pendingUpload();
  storage.put(upload.temporaryKey, Buffer.alloc(PNG.length), 'image/png');
  await assert.rejects(completeUpload(String(upload._id), guest), { code: 'INVALID_IMAGE' });
  assert.equal((await Upload.findById(upload._id)).state, 'failed');
  const farFuture = new Date(Date.now() + 86400000);
  const cleanup = await cleanupExpiredUploads({ now: farFuture });
  assert.equal(cleanup.deleted, 1);
  assert.equal(storage.objects.size, 0);
  assert.equal((await UploadQuota.findOne({ owner: guest })).activeCount, 0);
});

test('deletion waits for signed URLs to expire and abandoned uploads are cleaned', async () => {
  const upload = await pendingUpload();
  assert.deepEqual(await deleteUpload(String(upload._id), guest), { cleanupQueued: true });
  assert.equal((await cleanupExpiredUploads()).deleted, 0);
  assert.equal(storage.objects.size, 1);
  assert.equal((await cleanupExpiredUploads({ now: new Date(Date.now() + 600000) })).deleted, 1);
  assert.equal(await Upload.countDocuments(), 0);
});

test('private file viewing requires ownership or an audited active admin', async () => {
  const upload = await pendingUpload();
  await completeUpload(String(upload._id), guest);
  await assert.rejects(openPrivateUpload(String(upload._id), otherGuest), { status: 404 });
  await assert.rejects(openPrivateUpload(String(upload._id), otherGuest, { adminUser: { _id: new mongoose.Types.ObjectId(), role: 'customer' } }), { status: 404 });
  const viewed = await openPrivateUpload(String(upload._id), otherGuest, { adminUser: { _id: new mongoose.Types.ObjectId(), role: 'admin', active: true } });
  assert.ok(viewed.body instanceof Readable);
  assert.equal(viewed.sizeBytes, PNG.length);
  viewed.body.destroy();
  assert.equal(await AdminAudit.countDocuments({ action: 'private_file_viewed' }), 1);
});

test('order retention and guest-to-account ownership transfer are atomic and release quotas', async () => {
  const upload = await pendingUpload();
  await completeUpload(String(upload._id), guest);
  await assert.rejects(retainUploads([String(upload._id)], guest, new mongoose.Types.ObjectId()), { code: 'UPLOAD_TRANSACTION_REQUIRED' });
  await mongoose.connection.transaction(async (session) => {
    await transferUploadOwnership([String(upload._id)], guest, account, { session });
    await retainUploads([String(upload._id)], account, new mongoose.Types.ObjectId(), { session });
  });
  assert.equal((await Upload.findById(upload._id)).state, 'retained');
  assert.equal((await UploadQuota.findOne({ owner: guest })).activeCount, 0);
  assert.equal((await UploadQuota.findOne({ owner: account })).activeCount, 0);
  await assert.rejects(deleteUpload(String(upload._id), account), { code: 'ORDER_FILE_RETAINED' });
  const cleanup = await cleanupExpiredUploads({ now: new Date(Date.now() + 86400000) });
  assert.equal(cleanup.temporarySourcesDeleted, 1);
  assert.equal(storage.objects.size, 1);
});

test('accepted cart attachments cannot be deleted after an ambiguous add response', async () => {
  const upload = await pendingUpload();
  await completeUpload(String(upload._id), guest);
  const cartId = new mongoose.Types.ObjectId();
  await mongoose.connection.transaction(async (session) => attachUploadsToCart([String(upload._id)], guest, cartId, { session }));
  await assert.rejects(deleteUpload(String(upload._id), guest), { code: 'CART_FILE_ATTACHED' });
  await mongoose.connection.transaction(async (session) => detachUploadsFromCart([String(upload._id)], guest, cartId, { session }));
  assert.deepEqual(await deleteUpload(String(upload._id), guest), { cleanupQueued: true });
});

test('concurrent cart attachment and cleanup never accept and delete the same image', async () => {
  const upload = await pendingUpload();
  await completeUpload(String(upload._id), guest);
  const cartId = new mongoose.Types.ObjectId();
  const [attachment, deletion] = await Promise.allSettled([
    mongoose.connection.transaction(async (session) => attachUploadsToCart([String(upload._id)], guest, cartId, { session })),
    deleteUpload(String(upload._id), guest),
  ]);
  const saved = await Upload.findById(upload._id);
  if (saved.cartId) {
    assert.equal(attachment.status, 'fulfilled');
    assert.equal(deletion.status, 'rejected');
    assert.equal(saved.state, 'complete');
    await mongoose.connection.transaction(async (session) => detachUnusedCartUploads(cartId, [String(upload._id)], guest, { session }));
    assert.equal(String((await Upload.findById(upload._id)).cartId), String(cartId));
  } else {
    assert.equal(attachment.status, 'rejected');
    assert.equal(deletion.status, 'fulfilled');
    assert.equal(saved.state, 'deleting');
  }
});

test('payment proof cannot sign while checkout is disabled or without an owned active InstaPay intent', async () => {
  const checkoutKey = 'ec1a5c50-9a99-4b1b-8aa5-1f5e45a57c81';
  const request = { purpose: 'payment_proof', mimeType: 'image/png', sizeBytes: PNG.length, checkoutKey };
  await assert.rejects(signUpload(guest, request), { code: 'CHECKOUT_DISABLED' });
  env.checkoutEnabled = true;
  await assert.rejects(signUpload(guest, request), { code: 'CHECKOUT_REVIEW_REQUIRED' });
});

test('payment-proof signing enforces atomic quotas and leaves the payment intent unpaid', async () => {
  env.checkoutEnabled = true;
  const checkoutKey = 'dc1a5c50-9a99-4b1b-8aa5-1f5e45a57c81';
  await CheckoutIntent.create({ owner: guest, checkoutKey, paymentMethod: 'instapay', state: 'open',
    expiresAt: new Date(Date.now() + 600000), fingerprint: 'a'.repeat(64), quote: { totalPiastres: 9000 } });
  const request = { purpose: 'payment_proof', mimeType: 'image/png', sizeBytes: PNG.length, checkoutKey };
  for (let index = 0; index < 20; index += 1) {
    const signed = await signUpload(guest, request);
    assert.ok(signed.uploadUrl.startsWith('https://storage.invalid/'));
    assert.equal(signed.upload.state, 'pending');
  }
  await assert.rejects(signUpload(guest, request), { code: 'UPLOAD_QUOTA_EXCEEDED' });
  assert.equal((await UploadQuota.findOne({ owner: guest })).activeCount, 20);
  assert.equal((await CheckoutIntent.findOne()).state, 'open');
  await assert.rejects(signUpload(otherGuest, request), { code: 'CHECKOUT_REVIEW_REQUIRED' });
});

test('presigning failures release their quota and never create a successful upload', async () => {
  env.checkoutEnabled = true;
  const checkoutKey = 'bc1a5c50-9a99-4b1b-8aa5-1f5e45a57c81';
  await CheckoutIntent.create({ owner: guest, checkoutKey, paymentMethod: 'instapay', state: 'open',
    expiresAt: new Date(Date.now() + 600000), fingerprint: 'a'.repeat(64), quote: { totalPiastres: 9000 } });
  storage.signPut = async () => { throw new Error('Isolated unavailable signer.'); };
  await assert.rejects(signUpload(guest, { purpose: 'payment_proof', mimeType: 'image/png', sizeBytes: PNG.length, checkoutKey }), { code: 'STORAGE_UNAVAILABLE' });
  assert.equal(await Upload.countDocuments(), 0);
  assert.equal((await UploadQuota.findOne({ owner: guest })).activeCount, 0);
});

test('failed object cleanup retains its record and retries instead of orphaning storage', async () => {
  const upload = await pendingUpload();
  await deleteUpload(String(upload._id), guest);
  const originalRemove = storage.remove;
  storage.remove = async () => { throw new Error('Isolated storage outage.'); };
  const future = new Date(Date.now() + 600000);
  assert.equal((await cleanupExpiredUploads({ now: future })).failed, 1);
  assert.equal(await Upload.countDocuments(), 1);
  assert.equal((await UploadQuota.findOne({ owner: guest })).activeCount, 1);
  storage.remove = originalRemove;
  assert.equal((await cleanupExpiredUploads({ now: new Date(future.getTime() + 120000) })).deleted, 1);
});

test('active verification leases prevent cleanup races and stale verifications expire', async () => {
  const upload = await pendingUpload(guest, { state: 'verifying', expiresAt: new Date(Date.now() - 1000),
    signedExpiresAt: new Date(Date.now() - 600000), verificationLeaseUntil: new Date(Date.now() + 300000) });
  await assert.rejects(deleteUpload(String(upload._id), guest), { code: 'UPLOAD_PROCESSING' });
  assert.equal((await cleanupExpiredUploads()).deleted, 0);
  await Upload.updateOne({ _id: upload._id }, { $set: { verificationLeaseUntil: new Date(Date.now() - 1000) } });
  assert.equal((await cleanupExpiredUploads()).deleted, 1);
});

test('durable order events are idempotent and remain queued while delivery is disabled', async () => {
  const order = { _id: new mongoose.Types.ObjectId(), orderNumber: '234567', customer: { email: 'customer@example.test' }, statusHistory: [{}] };
  await enqueueOrderEvent(order, 'order_received');
  await enqueueOrderEvent(order, 'order_received');
  assert.equal(await NotificationEvent.countDocuments(), 1);
  assert.equal((await runNotificationBatch()).enabled, false);
  assert.equal((await NotificationEvent.findOne()).state, 'queued');
});

test('notification retries preserve an idempotency key and concurrent workers claim once', async () => {
  const order = { _id: new mongoose.Types.ObjectId(), orderNumber: '345678', customer: { email: 'safe@example.test' } };
  await enqueueOrderEvent(order, 'order_confirmed');
  const deliveredKeys = [];
  let failOnce = true;
  setNotificationProviderForTests({ async send(event) {
    deliveredKeys.push(event.eventKey);
    if (failOnce) { failOnce = false; throw new Error('Simulated provider failure, not a live email.'); }
    return { id: 'mock-delivery-id' };
  } });
  const now = new Date();
  assert.equal((await runNotificationBatch({ now })).failed, 1);
  const saved = await NotificationEvent.findOne();
  assert.equal(saved.state, 'failed');
  assert.equal(saved.attempts, 1);
  const outcomes = await Promise.all([runNotificationBatch({ now: new Date(now.getTime() + retryDelayMs(1) + 1) }), runNotificationBatch({ now: new Date(now.getTime() + retryDelayMs(1) + 1) })]);
  assert.equal(outcomes.reduce((count, outcome) => count + outcome.sent, 0), 1);
  assert.equal(new Set(deliveredKeys).size, 1);
  assert.equal((await NotificationEvent.findOne()).state, 'sent');
});

test('development notifications require an explicit safe-recipient allowlist', () => {
  const config = notificationSettings({ NOTIFICATIONS_ENABLED: 'true', RESEND_API_KEY: 'test-only', NOTIFICATION_FROM: 'sender@example.test', NOTIFICATION_SAFE_RECIPIENTS: 'safe@example.test', NODE_ENV: 'development' });
  assert.doesNotThrow(() => assertSafeNotificationRecipient('safe@example.test', config));
  assert.throws(() => assertSafeNotificationRecipient('customer@real.example', config), { code: 'UNSAFE_DEVELOPMENT_RECIPIENT' });
  const hostedStaging = notificationSettings({ NODE_ENV: 'production', DATABASE_TARGET: 'staging', NOTIFICATIONS_ENABLED: 'true',
    RESEND_API_KEY: 'test-only', NOTIFICATION_FROM: 'sender@example.test', NOTIFICATION_SAFE_RECIPIENTS: 'safe@example.test' });
  assert.equal(hostedStaging.production, false);
  assert.throws(() => assertSafeNotificationRecipient('customer@real.example', hostedStaging), { code: 'UNSAFE_DEVELOPMENT_RECIPIENT' });
});

test('notification delivery failures retry to a terminal durable dead state', async () => {
  const order = { _id: new mongoose.Types.ObjectId(), orderNumber: '456789', customer: { email: 'safe@example.test' } };
  await enqueueOrderEvent(order, 'preparing');
  setNotificationProviderForTests({ async send() { throw new Error('Isolated provider failure.'); } });
  let now = new Date();
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await runNotificationBatch({ now });
    now = new Date(now.getTime() + retryDelayMs(attempt) + 1);
  }
  const event = await NotificationEvent.findOne();
  assert.equal(event.state, 'dead');
  assert.equal(event.attempts, 6);
  assert.equal((await runNotificationBatch({ now })).claimed, 0);
});

test('admin audit rejects customer access and private fields', async () => {
  await assert.rejects(recordAdminAudit({ _id: new mongoose.Types.ObjectId(), role: 'customer' }, { action: 'test', resourceType: 'order', resourceId: '123456' }), { status: 403 });
  await assert.rejects(recordAdminAudit({ _id: new mongoose.Types.ObjectId(), role: 'admin' }, { action: 'test', resourceType: 'order', resourceId: '123456', details: { receipt: 'private' } }), /Private fields/);
});

test('commerce jobs default to offline dry-run and reject accidental writes', async () => {
  assert.equal((await runCommerceJobs(parseJobArguments([]))).writes, false);
  assert.throws(() => parseJobArguments(['--once']), /Writes require/);
  assert.throws(() => parseJobArguments(['--once', '--target', 'production', '--confirm-writes']), /Only exact/);
  assert.throws(() => parseJobArguments(['--batch-size', '101']), /Batch size/);
  assert.equal(JSON.stringify(serializeUpload({ _id: new mongoose.Types.ObjectId(), objectKey: 'private', temporaryKey: 'secret', state: 'complete' })).includes('private'), false);
});
