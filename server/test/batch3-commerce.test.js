import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { startTestDatabase } from './helpers/database.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import BundleRule from '../src/models/BundleRule.js';
import ShippingConfig from '../src/models/ShippingConfig.js';
import { Cart } from '../src/models/Cart.js';
import { Upload } from '../src/models/Upload.js';
import { UploadQuota } from '../src/models/UploadQuota.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Order } from '../src/models/Order.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { CommerceControl } from '../src/models/CommerceControl.js';
import { CommerceJobRun } from '../src/models/CommerceJobRun.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { quoteCart, addCartItem, cartResponse } from '../src/commerce/cart.js';
import { quoteCartLine } from '../src/commerce/pricing.js';
import { createPricingContext } from '../src/commerce/pricing-context.js';
import { createWorkBudget, shouldStop, remainingBudgetMs, boundedOperation } from '../src/commerce/work-budget.js';
import { cleanupExpiredUploads, validateUploadReferences } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests, boundPrivateBody } from '../src/commerce/storage.js';
import { runNotificationBatch, setNotificationProviderForTests, enqueueOrderEvent } from '../src/commerce/notifications.js';
import { validateOrderTransition, prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { presentOrder } from '../src/commerce/order-presentation.js';
import { consumeInventory } from '../src/commerce/inventory.js';
import { getShippingQuote, lockShippingQuote } from '../src/commerce/promotions.js';
import { executeCommerceBatch, parseJobArguments, runCommerceJobs, validateWorkerTarget } from '../scripts/run-commerce-jobs.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { resetCommerceLimitsForTests } from '../src/commerce/routes.js';

let fixture, server, origin, main, child, product, storage;
const owner = `guest:${'a'.repeat(64)}`;
const otherOwner = `guest:${'b'.repeat(64)}`;
const oldCheckout = env.checkoutEnabled;
const customer = { name: 'Synthetic customer', email: 'customer@example.test', phone: '01012345678', governorate: 'cairo', address: '10 Synthetic Street, Cairo' };

test('checkout UI scope survives a refresh but changes on guest rotation without exposing an owner credential', async () => {
  const first = await cartResponse(owner);
  assert.match(first.checkoutOwnerKey, /^[a-f0-9]{64}$/);
  assert.equal(first.checkoutOwnerKey, (await cartResponse(owner)).checkoutOwnerKey);
  assert.notEqual(first.checkoutOwnerKey, (await cartResponse(otherOwner)).checkoutOwnerKey);
  assert.notEqual(first.checkoutOwnerKey, owner.split(':')[1]);
  assert.equal(JSON.stringify(first).includes(owner), false);
});

before(async () => {
  fixture = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  mongoose.set('debug', false); env.checkoutEnabled = oldCheckout; setStorageForTests(); setNotificationProviderForTests();
  if (server) await new Promise(resolve => server.close(resolve)); await fixture?.stop();
});
beforeEach(async () => {
  mongoose.set('debug', false); resetCommerceLimitsForTests();
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  env.checkoutEnabled = false; storage = createMemoryStorage(); setStorageForTests(storage); setNotificationProviderForTests();
  main = await Category.create({ name: 'Synthetic main', slug: 'synthetic-main' });
  child = await Category.create({ name: 'Synthetic child', slug: 'synthetic-child', parentId: main._id });
  product = await makeProduct();
});
async function makeProduct(overrides = {}) {
  return Product.create({ name: 'Synthetic approved product', slug: `fixture-${randomUUID()}`, categoryId: main._id, subcategoryId: child._id,
    mainImageKey: 'fixtures/synthetic.webp', galleryKeys: ['fixtures/synthetic.webp'], status: 'ready', reviewRequired: false, pricePiastres: 12345, priceApproved: true,
    inventory: { mode: 'tracked', quantity: 30, approved: true, available: true }, ...overrides });
}
async function auth(role = 'customer') {
  const user = await User.create({ name: 'Synthetic role', email: `${randomUUID()}@example.test`, passwordHash: 'synthetic-unused-password-hash', role });
  const token = newSessionToken(); await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  const csrf = makeCsrfToken(env.sessionSecret);
  return { user, headers: { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf } };
}
async function request(path, actor, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { ...actor?.headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function customizedLines(count = 3) {
  const component = await ComponentOption.create({ name: 'Synthetic extra', slug: 'synthetic-extra', catalogRole: 'Customization Option', categoryId: main._id,
    mainImageKey: 'fixtures/extra.webp', galleryKeys: ['fixtures/extra.webp'], pricePiastres: 255, priceApproved: true,
    inventory: { mode: 'tracked', quantity: 30, approved: true, available: true }, enabledForCustomization: true, configurationApproved: true, reviewRequired: false });
  const template = await CustomizationTemplate.create({ key: 'synthetic-template', name: 'Synthetic template', kind: 'generic', active: true, status: 'approved',
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }], groups: [{ key: 'extras', label: 'Extras', minChoices: 1, maxChoices: 1,
      options: [{ key: 'extra', label: 'Extra', componentId: component._id, minQuantity: 1, maxQuantity: 2, priceAdjustmentPiastres: 17 }] }] });
  product.customization = { enabled: true, templateId: template._id, serviceKind: 'generic' }; await product.save();
  return Array.from({ length: count }, (_, index) => ({ id: randomUUID(), productId: String(product._id), quantity: 1, personalization: {},
    customization: { templateId: String(template._id), version: 1, fields: { name: `Synthetic ${index}` }, selections: [{ groupKey: 'extras', optionKey: 'extra', quantity: 1 }] } }));
}
async function upload(overrides = {}) {
  const value = await Upload.create({ owner, purpose: 'personalization', productId: product._id, fieldKey: 'photo', state: 'complete', mimeType: 'image/png', sizeBytes: 100,
    temporaryKey: `temporary/${randomUUID()}`, objectKey: `verified/${randomUUID()}`, signedExpiresAt: new Date(Date.now() - 600000), expiresAt: new Date(Date.now() + 86400000), ...overrides });
  await UploadQuota.updateOne({ owner: value.owner }, { $inc: { activeCount: 1, activeBytes: value.sizeBytes }, $setOnInsert: { owner: value.owner } }, { upsert: true });
  return value;
}

test('F28 batched real catalog dependencies preserve every quote and reduce 3-line reads from 15 to 4', async t => {
  const lines = await customizedLines();
  let reads = 0; mongoose.set('debug', (collection, method) => { if (['find', 'findOne'].includes(method)) reads += 1; });
  const baseline = [];
  try {
    for (const line of lines) baseline.push(await quoteCartLine(line, owner));
    const baselineQueries = reads; reads = 0;
    const context = await createPricingContext(lines, owner);
    const batched = [];
    for (const line of lines) batched.push(await quoteCartLine(line, owner, { context }));
    assert.deepEqual(batched, baseline); assert.equal(baselineQueries, 15); assert.equal(reads, 4); assert.equal(context.queryCount, 4);
    t.diagnostic(`Measured real Mongoose dependency reads: unbatched=${baselineQueries}; batched=${reads}; lines=3; unit=12617 piastres.`);
  } finally { mongoose.set('debug', false); }
});
test('F28 quote contexts expire at request boundaries and reflect price/category/template changes', async () => {
  const lines = await customizedLines();
  const first = await createPricingContext(lines, owner); assert.equal((await quoteCartLine(lines[0], owner, { context: first })).unitPricePiastres, 12617);
  await Product.updateOne({ _id: product._id }, { $set: { pricePiastres: 20000 } });
  const second = await createPricingContext(lines, owner); assert.equal((await quoteCartLine(lines[0], owner, { context: second })).unitPricePiastres, 20272);
  await Category.updateOne({ _id: child._id }, { $set: { active: false } });
  const third = await createPricingContext(lines, owner); await assert.rejects(quoteCartLine(lines[0], owner, { context: third }), { code: 'PRODUCT_UNAVAILABLE' });
});
test('F28 batched upload references retain owner, purpose and field privacy', async () => {
  const file = await upload(); const line = { productId: String(product._id), quantity: 1, personalization: { photo: [String(file._id)] } };
  const context = await createPricingContext([line], owner);
  assert.equal((await validateUploadReferences([String(file._id)], owner, { context, purpose: 'personalization' })).length, 1);
  await assert.rejects(validateUploadReferences([String(file._id)], otherOwner, { context }), { code: 'INVALID_UPLOAD_REFERENCES' });
  await assert.rejects(validateUploadReferences([String(file._id)], owner, { context, purpose: 'artwork' }), { code: 'INVALID_UPLOAD_REFERENCES' });
});
test('F28 current component claims avoid a redundant inventory read while conditional writes reject mode changes', async () => {
  const lines = await customizedLines(1);
  const context = await createPricingContext(lines, owner);
  const quote = await quoteCartLine(lines[0], owner, { context });
  assert.equal(quote.inventoryClaims.find(claim => claim.kind === 'component').mode, 'tracked');
  let componentReads = 0;
  mongoose.set('debug', (collection, method) => { if (collection === ComponentOption.collection.name && ['find', 'findOne'].includes(method)) componentReads += 1; });
  try { await mongoose.connection.transaction(session => consumeInventory([quote], [], session)); }
  finally { mongoose.set('debug', false); }
  assert.equal(componentReads, 0);
  assert.equal((await ComponentOption.findOne()).inventory.quantity, 29);
  await ComponentOption.updateOne({}, { $set: { 'inventory.mode': 'made_to_order', 'inventory.quantity': null } });
  await assert.rejects(mongoose.connection.transaction(session => consumeInventory([quote], [], session)), { code: 'INSUFFICIENT_STOCK' });
  assert.equal((await Product.findById(product._id)).inventory.quantity, 29);
});
test('F30 cart reports the existing temporary lifetime and expired attachments require replacement without retaining them', async () => {
  product.personalization = { fields: [{ key: 'photo', label: 'Photo', type: 'image', required: true, minFiles: 1, maxFiles: 1, acceptedMimeTypes: ['image/png'] }] }; await product.save();
  const file = await upload();
  await addCartItem(owner, { productId: String(product._id), quantity: 1, personalization: { photo: [String(file._id)] } });
  const first = await quoteCart(owner); assert.equal(first.items[0].attachments.status, 'temporary'); assert.equal(first.items[0].attachments.expiresAt.getTime(), file.expiresAt.getTime());
  await Upload.updateOne({ _id: file._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  const expired = await quoteCart(owner); assert.equal(expired.items[0].valid, false); assert.equal(expired.items[0].attachments.replacementRequired, true);
  assert.deepEqual(expired.items[0].attachments.fieldKeys, ['photo']); assert.equal(expired.items[0].slug, product.slug); assert.equal(expired.subtotalPiastres, 0);
  assert.equal(JSON.stringify(expired.items).includes(file.objectKey), false); assert.equal((await Upload.findById(file._id)).state, 'complete');
});
test('F13 rejected proof presents only an explicit public explanation and never enables replacement or paid fulfillment', () => {
  const value = { _id: new mongoose.Types.ObjectId(), customer: {}, lines: [], totals: {}, revision: 1, paymentMethod: 'instapay', paymentState: 'rejected', fulfillmentState: 'received',
    history: [{ event: 'state_changed', to: { paymentState: 'rejected' }, publicReason: 'Please contact the store.', internalNote: 'Sensitive operational detail' }] };
  const dto = presentOrder(value); assert.equal(dto.paymentAttention.publicReason, 'Please contact the store.'); assert.equal(dto.paymentAttention.receiptReplacementEnabled, false);
  assert.equal(JSON.stringify(dto).includes('Sensitive operational detail'), false); assert.equal(dto.canCancel, true);
  assert.throws(() => validateOrderTransition(value, { revision: 1, paymentState: 'paid' }, { admin: true }), { code: 'INVALID_PAYMENT_TRANSITION' });
  assert.throws(() => validateOrderTransition(value, { revision: 1, fulfillmentState: 'confirmed' }, { admin: true }), { code: 'PAYMENT_VERIFICATION_REQUIRED' });
  assert.equal(validateOrderTransition(value, { revision: 1, fulfillmentState: 'cancelled' }, { admin: true }).fulfillmentState, 'cancelled');
});
test('F13 legacy private reasons are never inferred to be customer rejection explanations', () => {
  const value = { _id: new mongoose.Types.ObjectId(), paymentMethod: 'instapay', paymentState: 'rejected', history: [{ reason: 'legacy secret', to: { paymentState: 'rejected' } }] };
  assert.equal(presentOrder(value).paymentAttention.publicReason, null); assert.equal(JSON.stringify(presentOrder(value)).includes('legacy secret'), false);
});
test('F14 deadline and cancellation stop claims without resetting durable records', async () => {
  let clock = 0; const controller = new AbortController(); const budget = createWorkBudget({ maxDurationMs: 100, signal: controller.signal, clock: () => clock });
  assert.equal(remainingBudgetMs(budget), 100); clock = 50; assert.equal(shouldStop(budget), false); controller.abort(); assert.equal(shouldStop(budget), true);
  const result = await runNotificationBatch({ budget }); assert.equal(result.claimed, 0); assert.equal(result.sent, 0);
  assert.throws(() => createWorkBudget({ maxDurationMs: 99 }), /duration/);
});
test('F14 a hung non-idempotent SMTP mock is uncertain, does not replay, and clears its secret', async () => {
  await enqueueOrderEvent({ _id: new mongoose.Types.ObjectId(), customer, orderNumber: '123456', totals: { totalPiastres: 10000 } }, 'order_received');
  setNotificationProviderForTests({ supportsIdempotency: false, send: () => new Promise(() => {}) });
  const result = await runNotificationBatch({ budget: createWorkBudget({ maxDurationMs: 100 }) });
  assert.equal(result.uncertain, 1); const record = await NotificationEvent.findOne().select('+sealedActionToken'); assert.equal(record.state, 'uncertain'); assert.equal(record.sealedActionToken, undefined);
  let sends = 0; setNotificationProviderForTests({ supportsIdempotency: false, send: async () => { sends += 1; return { id: 'never' }; } });
  await runNotificationBatch(); assert.equal(sends, 0);
});
test('F14 worker journal bounds counters, recovers interrupted runs, and continues independent stages on failure', async () => {
  const old = await CommerceJobRun.create({ runId: randomUUID(), state: 'running', startedAt: new Date(Date.now() - 600000), leaseUntil: new Date(Date.now() - 1) });
  let cleanup = false;
  const result = await executeCommerceBatch({ maxDurationMs: 1000 }, {
    notificationBatch: async () => { throw new Error('PRIVATE SMTP credential-like detail'); },
    trackingBatch: async () => ({ sent: 0, secret: 'not allowed', payload: { customer } }),
    uploadCleanup: async () => { cleanup = true; return { deleted: 1 }; }, storageEnabled: true,
  });
  assert.equal(result.state, 'partial'); assert.equal(cleanup, true); assert.equal((await CommerceJobRun.findById(old._id)).state, 'interrupted');
  const record = await CommerceJobRun.findOne({ runId: result.runId }).lean(); assert.equal(JSON.stringify(record).includes('PRIVATE'), false); assert.equal(record.stages.tracking.secret, undefined); assert.equal(record.stages.tracking.payload, undefined);
});
test('F14 stopped execution leaves remaining stage records explicitly stopped', async () => {
  const controller = new AbortController();
  const result = await executeCommerceBatch({ maxDurationMs: 1000, signal: controller.signal }, {
    notificationBatch: async () => { controller.abort(); return { claimed: 0, stopped: true }; },
    trackingBatch: async () => { throw new Error('Must not run'); }, storageEnabled: true,
  });
  assert.equal(result.state, 'stopped'); assert.equal(result.tracking.stopped, true); assert.equal(result.uploads.stopped, true);
});
test('F14 job CLI stays offline by default and validates duration and forbidden production targets', async () => {
  const result = await runCommerceJobs(parseJobArguments([])); assert.equal(result.databaseConnected, false); assert.equal(result.dotenvLoaded, false); assert.equal(result.writes, false);
  assert.throws(() => parseJobArguments(['--max-duration-ms', '0']), /duration/);
  assert.throws(() => parseJobArguments(['--once', '--target', 'production', '--confirm-writes']), /Only exact/);
});
test('F14 command-finalized residual handle shutdown is bounded in a synthetic offline child process', () => {
  // Loading Mongoose under a concurrent full-suite run is setup, not part of
  // the finalized-command shutdown budget. Measure the latter in the child.
  const script = `import { armResidualProcessExit } from './scripts/run-commerce-jobs.js';
    import { performance } from 'node:perf_hooks';
    import { writeSync } from 'node:fs';
    console.log('synthetic-ledger-finalized-and-disconnected');
    setInterval(() => {}, 1000);
    const finalizedAt = performance.now();
    process.once('exit', code => writeSync(1, 'synthetic-residual-exit:' + JSON.stringify({ elapsedMs: performance.now() - finalizedAt, code }) + '\\n'));
    armResidualProcessExit({ graceMs: 20 });`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'test', MONGODB_URI: '', CATALOG_IMPORT_STAGING_URI: '', TAP_WRAP_SKIP_DOTENV: 'true', STORAGE_ENABLED: 'false', EMAIL_ENABLED: 'false', META_ENABLED: 'false' } });
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.match(result.stdout, /synthetic-ledger-finalized-and-disconnected/);
  assert.match(result.stderr, /RESIDUAL_HANDLE_TIMEOUT/); assert.equal(result.stderr.includes('recipient'), false);
  const measured = result.stdout.split(/\r?\n/).find(line => line.startsWith('synthetic-residual-exit:'));
  assert.ok(measured, 'The child must record its actual finalized-command exit phase.');
  const phase = JSON.parse(measured.slice('synthetic-residual-exit:'.length));
  assert.equal(phase.code, 0);
  assert.ok(phase.elapsedMs >= 15 && phase.elapsedMs < 1000, `A 20ms residual timer must terminate the finalized synthetic command within 1s; measured ${phase.elapsedMs}ms.`);
});
test('F14 production worker preparation requires every independent approval and exact target without connecting', async () => {
  const options = parseJobArguments(['--once', '--target', 'production', '--confirm-writes', '--confirm-production-writes']);
  const approved = { NODE_ENV: 'production', DATABASE_TARGET: 'production', MONGODB_URI: 'mongodb+srv://synthetic:synthetic-password@cluster.example.invalid/tapandwrap_production',
    PRODUCTION_DATABASE_AUTHORIZED: 'true', PRODUCTION_DATABASE_HOST: 'cluster.example.invalid', PRODUCTION_WORKER_AUTHORIZED: 'true' };
  assert.deepEqual(validateWorkerTarget(options, approved), { dbName: 'tapandwrap_production', target: 'production', disposableTest: false });
  for (const changed of [
    { PRODUCTION_WORKER_AUTHORIZED: 'false' }, { PRODUCTION_DATABASE_AUTHORIZED: 'false' }, { NODE_ENV: 'development' },
    { DATABASE_TARGET: 'staging' }, { PRODUCTION_DATABASE_HOST: 'wrong.example.invalid' }, { MONGODB_URI: approved.MONGODB_URI.replace('tapandwrap_production', 'tapandwrap_staging') },
    { MONGODB_URI: '' }, { MONGODB_URI: `${approved.MONGODB_URI}?tls=false` },
  ]) assert.throws(() => validateWorkerTarget(options, { ...approved, ...changed }));
  assert.throws(() => validateWorkerTarget({ ...options, confirmProductionWrites: false }, approved));
  assert.equal((await runCommerceJobs({ ...options, apply: false })).databaseConnected, false);
  assert.equal(mongoose.connection.name, 'tap_wrap_catalog_test');
});
test('F14 offline worker matrix keeps local and staging URI target boundaries independent of production approval', () => {
  const options = target => ({ apply: true, confirmWrites: true, target });
  assert.equal(validateWorkerTarget(options('local'), { NODE_ENV: 'development', DATABASE_TARGET: 'local', MONGODB_URI: 'mongodb://127.0.0.1:27017/tapandwrap_dev' }).target, 'local');
  assert.equal(validateWorkerTarget(options('staging'), { NODE_ENV: 'production', DATABASE_TARGET: 'staging', MONGODB_URI: 'mongodb+srv://synthetic:synthetic@cluster.example.invalid/tapandwrap_staging' }).target, 'staging');
  assert.throws(() => validateWorkerTarget(options('local'), { NODE_ENV: 'production', DATABASE_TARGET: 'local', MONGODB_URI: 'mongodb://127.0.0.1:27017/tapandwrap_dev' }));
  assert.throws(() => validateWorkerTarget(options('staging'), { NODE_ENV: 'development', DATABASE_TARGET: 'staging', MONGODB_URI: 'mongodb+srv://synthetic:synthetic@cluster.example.invalid/tapandwrap_production' }));
});
test('F14 job diagnostics are admin-only, paginated at twenty and omit private notification snapshots', async () => {
  await CommerceJobRun.insertMany(Array.from({ length: 21 }, () => ({ runId: randomUUID(), state: 'completed', startedAt: new Date(), leaseUntil: new Date(), stages: { notifications: { sent: 0 } } })));
  await enqueueOrderEvent({ _id: new mongoose.Types.ObjectId(), customer, orderNumber: '123456' }, 'order_received');
  await NotificationEvent.updateOne({}, { $set: { state: 'uncertain' } });
  assert.equal((await request('/admin/commerce/jobs', await auth())).status, 403);
  const admin = await auth('admin'); const result = await request('/admin/commerce/jobs', admin);
  assert.equal(result.status, 200); assert.equal(result.body.data.runs.length, 20); assert.equal(result.body.data.pagination.total, 21);
  assert.equal(result.body.data.attention.notificationUncertain, 1); assert.equal(JSON.stringify(result.body).includes(customer.email), false);
  assert.equal((await request('/admin/commerce/jobs?limit=21', admin)).status, 400); assert.equal(result.headers.get('cache-control'), 'private, no-store');
});
test('F14 expired temporary-file cleanup backs off, stops at six attempts, and never deletes retained evidence', async () => {
  const file = await upload({ expiresAt: new Date(Date.now() - 1) });
  storage.remove = async () => { throw new Error('Synthetic unavailable object store'); };
  let now = new Date();
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = await cleanupExpiredUploads({ now }); assert.equal(result.failed, 1);
    const record = await Upload.findById(file._id); assert.equal(record.cleanupAttempts, attempt);
    assert.equal((await cleanupExpiredUploads({ now })).processed, 0);
    now = new Date(record.cleanupNextAttemptAt.getTime() + 1);
  }
  assert.equal((await Upload.findById(file._id)).cleanupReviewRequired, true); assert.equal((await cleanupExpiredUploads({ now })).processed, 0);
  assert.equal((await UploadQuota.findOne({ owner })).activeCount, 1);
});
test('F49 cleanup provider timeout remains recoverable and never marks undeleted objects successful', async () => {
  const file = await upload({ expiresAt: new Date(Date.now() - 1) }); storage.remove = () => new Promise(() => {});
  const result = await cleanupExpiredUploads({ budget: createWorkBudget({ maxDurationMs: 100 }) });
  assert.equal(result.failed, 1); assert.equal(result.deleted, 0); assert.equal(result.stopped, true); assert.ok(await Upload.findById(file._id));
});
test('F14 cleanup crash after its sixth claim becomes manual review without a seventh delete attempt', async () => {
  const file = await upload({ state: 'deleting', expiresAt: new Date(Date.now() - 1), cleanupAttempts: 6, cleanupLeaseUntil: new Date(Date.now() - 1), cleanupLeaseToken: 'synthetic-interrupted-lease' });
  let removes = 0; storage.remove = async () => { removes += 1; };
  const result = await cleanupExpiredUploads(); assert.equal(result.reviewRequired, 1); assert.equal(removes, 0);
  const saved = await Upload.findById(file._id); assert.equal(saved.cleanupAttempts, 6); assert.equal(saved.cleanupReviewRequired, true); assert.equal(saved.quotaReleased, false);
});
test('F49 cancelled private-file streams are destroyed and stalled bodies have a bounded deadline', async () => {
  const controller = new AbortController(); const body = new Readable({ read() {} });
  const closed = once(body, 'close'); boundPrivateBody(body, { signal: controller.signal }); controller.abort(); await closed.catch(() => {}); assert.equal(body.destroyed, true);
  const stalled = new Readable({ read() {} }); const done = once(stalled, 'close'); boundPrivateBody(stalled, { timeoutMs: 20 });
  await done.catch(() => {}); assert.equal(stalled.destroyed, true);
});
test('F49 timed-out adapter receives cancellation and cannot return a fake successful result', async () => {
  let aborted = false;
  await assert.rejects(boundedOperation(signal => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); }), { timeoutMs: 20, code: 'SYNTHETIC_TIMEOUT' }), { code: 'SYNTHETIC_TIMEOUT' });
  assert.equal(aborted, true);
});
test('F31 concurrent active-bundle creations at 99 cannot exceed the 100-rule contract or create unaudited winners', async () => {
  const admin = await auth('admin'), another = await makeProduct();
  const body = { name: 'Synthetic concurrent bundle', active: true, published: false, items: [{ productId: String(product._id), quantity: 1 }, { productId: String(another._id), quantity: 1 }], discountKind: 'fixed', discountValue: 100 };
  await BundleRule.insertMany(Array.from({ length: 99 }, (_, i) => ({ ...body, name: `Seed ${i}` })));
  await CommerceControl.create({ _id: 'bundle-activation', revision: 0 });
  const results = await Promise.all([request('/admin/commerce/bundles', admin, body), request('/admin/commerce/bundles', admin, { ...body, name: 'Second candidate' })]);
  assert.deepEqual(results.map(value => value.status).sort(), [201, 409]); assert.equal(await BundleRule.countDocuments({ active: true }), 100);
  assert.equal(await AdminAudit.countDocuments({ action: 'promotion.bundle.created' }), 1);
});
test('F31 first-use activation fence initialization fails safely or commits without duplicates', async () => {
  const admin = await auth('admin'), another = await makeProduct();
  const body = { name: 'First fence', active: true, items: [{ productId: String(product._id), quantity: 1 }, { productId: String(another._id), quantity: 1 }], discountKind: 'fixed', discountValue: 100 };
  const results = await Promise.all([request('/admin/commerce/bundles', admin, body), request('/admin/commerce/bundles', admin, { ...body, name: 'Second fence' })]);
  assert.ok(results.every(value => [201, 409].includes(value.status))); assert.equal(await CommerceControl.countDocuments(), 1);
  assert.equal(await BundleRule.countDocuments(), results.filter(value => value.status === 201).length);
});
test('F31 concurrent captured-revision activations of different draft bundles enforce the shared capacity boundary', async () => {
  const admin = await auth('admin'), another = await makeProduct();
  const body = { name: 'Synthetic activation', active: true, items: [{ productId: product._id, quantity: 1 }, { productId: another._id, quantity: 1 }], discountKind: 'fixed', discountValue: 100 };
  await BundleRule.insertMany(Array.from({ length: 99 }, (_, i) => ({ ...body, name: `Active ${i}` })));
  const drafts = await BundleRule.create([{ ...body, active: false, name: 'Draft A' }, { ...body, active: false, name: 'Draft B' }]);
  await CommerceControl.create({ _id: 'bundle-activation' });
  const results = await Promise.all(drafts.map(draft => request(`/admin/commerce/bundles/${draft._id}`, admin, { expectedRevision: 0, active: true }, 'PATCH')));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]); assert.equal(await BundleRule.countDocuments({ active: true }), 100);
  assert.equal(await AdminAudit.countDocuments({ action: 'promotion.bundle.updated' }), 1);
});
test('F29 isolated shared checkout-fence contention is measured without removing any correctness fences', async t => {
  const products = [product]; for (let i = 1; i < 6; i += 1) products.push(await makeProduct());
  await ShippingConfig.create({ key: 'egypt-v1', approved: true });
  let callbacks = 0; const elapsed = [];
  const perform = async item => {
    const started = performance.now();
    await mongoose.connection.transaction(async session => {
      callbacks += 1; const line = await quoteCartLine({ productId: String(item._id), quantity: 1 }, owner, { session });
      const shipping = await getShippingQuote('cairo', { session }); await lockShippingQuote(shipping, { session }); await consumeInventory([line], [], session);
    }); elapsed.push(Math.round(performance.now() - started));
  };
  await Promise.all(products.map(perform));
  assert.equal((await Product.find().lean()).reduce((sum, value) => sum + value.inventory.quantity, 0), 174);
  assert.equal((await ShippingConfig.findOne()).__v, 6); assert.equal((await Category.findById(main._id)).__v, 6); assert.ok(callbacks >= 6);
  elapsed.sort((a, b) => a - b); t.diagnostic(`Synthetic local replica-set contention: orders=6; transaction callbacks=${callbacks}; retries=${callbacks - 6}; median=${elapsed[3]}ms; max=${elapsed[5]}ms. Existing shipping/category fences retained.`);
});
test('F49 owned submission recovery confirms an immutable accepted order after a simulated lost response without creating another', async () => {
  const account = await auth(); const accountOwner = `user:${account.user._id}`;
  env.checkoutEnabled = true; await addCartItem(accountOwner, { productId: String(product._id), quantity: 1 });
  const checkoutKey = randomUUID(); await prepareCheckout(accountOwner, { checkoutKey, governorate: 'cairo', paymentMethod: 'cod' }, account.user._id);
  const accepted = await placeOrder(accountOwner, { checkoutKey, paymentMethod: 'cod', customer }, account.user._id); env.checkoutEnabled = false;
  const result = await request(`/commerce/checkout/submissions/${checkoutKey}`, account);
  assert.equal(result.status, 200); assert.equal(result.body.data.order.id, accepted.id); assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(await Order.countDocuments(), 1); assert.equal((await Product.findById(product._id)).inventory.quantity, 29);
  assert.equal((await request(`/commerce/checkout/submissions/${checkoutKey}`, await auth())).body.data.order, null);
  assert.equal((await request(`/commerce/checkout/submissions/${randomUUID()}`, account)).body.data.order, null);
});
test('F49 checkout-status lookup rejects malformed keys and injected owner parameters while checkout remains disabled', async () => {
  const account = await auth();
  assert.equal((await request('/commerce/checkout/submissions/not-a-key', account)).status, 400);
  assert.equal((await request(`/commerce/checkout/submissions/${randomUUID()}?owner=another`, account)).status, 400);
  const result = await request('/commerce/checkout/quote', account, { checkoutKey: randomUUID(), governorate: 'cairo', paymentMethod: 'cod' });
  assert.equal(result.status, 403); assert.equal(result.body.error.code, 'CHECKOUT_DISABLED'); assert.equal(await Order.countDocuments(), 0);
});
test('F49 guest confirmation requires the exact cryptographic cart cookie and never attaches an order to a matching phone account', async () => {
  const token = 'c'.repeat(64), guestOwner = `guest:${createHash('sha256').update(token).digest('hex')}`, checkoutKey = randomUUID();
  const order = await Order.create({ owner: guestOwner, checkoutKey, requestHash: 'synthetic-hash', orderNumber: '654321', customer, lines: [], totals: { totalPiastres: 10000 }, paymentMethod: 'cod', paymentState: 'unpaid' });
  const guest = { headers: { Cookie: `tw_cart=${token}` } };
  const confirmed = await request(`/commerce/checkout/submissions/${checkoutKey}`, guest); assert.equal(confirmed.body.data.order.id, String(order._id));
  assert.equal((await request(`/commerce/checkout/submissions/${checkoutKey}`, { headers: { Cookie: `tw_cart=${'d'.repeat(64)}` } })).body.data.order, null);
  assert.equal((await request(`/commerce/checkout/submissions/${checkoutKey}`, await auth())).body.data.order, null);
  assert.equal((await Order.findById(order._id)).userId, null);
});
test('F49 abandoning an authenticated proof response stops its private storage stream', async () => {
  const admin = await auth('admin');
  const evidence = await upload({ purpose: 'payment_proof', fieldKey: 'payment_proof', state: 'retained', quotaReleased: true });
  const order = await Order.create({ owner, checkoutKey: randomUUID(), requestHash: 'synthetic-hash', orderNumber: '654321', customer, lines: [], totals: { totalPiastres: 10000 },
    paymentMethod: 'instapay', paymentState: 'awaiting_verification', paymentProofId: evidence._id, uploadIds: [evidence._id] });
  await Upload.updateOne({ _id: evidence._id }, { $set: { orderId: order._id } });
  const stream = new Readable({ read() {} }); storage.open = async () => ({ body: stream, sizeBytes: evidence.sizeBytes, mimeType: 'image/png' });
  const controller = new AbortController();
  setTimeout(() => stream.push(Buffer.from([0])), 25);
  const response = await fetch(`${origin}/api/v1/admin/commerce/orders/${order._id}/proof`, { headers: admin.headers, signal: controller.signal });
  assert.equal(response.status, 200); controller.abort();
  for (let i = 0; i < 50 && !stream.destroyed; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(stream.destroyed, true); assert.equal((await Order.findById(order._id)).paymentState, 'awaiting_verification');
  assert.equal(await AdminAudit.countDocuments({ action: 'private_file_viewed' }), 1);
});
