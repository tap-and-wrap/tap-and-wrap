import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { ServiceRequest } from '../src/models/ServiceRequest.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { Order } from '../src/models/Order.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { createServiceRequest, actOnServiceRequest, requestWhatsapp } from '../src/commerce/service-requests.js';
import { startTestDatabase } from './helpers/database.js';
import { giftBoxV2RequestInput } from '../src/gift-box/request-contract.js';
import { prepareGiftBoxV2Request } from '../src/gift-box/request-preparation.js';
import { persistGiftBoxV2RequestForDisposableTest as persist } from '../src/gift-box/request-persistence.js';
import { presentGiftBoxV2Snapshot } from '../src/gift-box/request-presentation.js';
import { assertGiftBoxV2ProductionAcceptance, assertGiftBoxV2SubmissionClosed, assertLegacyRequestAction } from '../src/gift-box/request-gates.js';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION } from '../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_REQUEST_CONTRACT_VERSION, GIFT_BOX_REQUEST_KIND } from '../../shared/gift-box/request-contract.mjs';

const guestToken = 'a'.repeat(64), otherToken = 'b'.repeat(64);
const owner = `guest:${createHash('sha256').update(guestToken).digest('hex')}`, stranger = `guest:${createHash('sha256').update(otherToken).digest('hex')}`;
let database, server, base, admin, headers;
const flags = { checkout: env.checkoutEnabled, intake: env.customRequestsEnabled, builder: env.giftBoxBuilderBackendEnabled };
const names = { 'box-2': 'Synthetic saved box', 'rose-red': 'Synthetic individual rose', 'plush-1': 'Synthetic plush', 'chocolate-1': 'Synthetic retail chocolate', 'ribbon-red': 'Synthetic ribbon', 'gift-card-1': 'Synthetic card' };
const setting = (componentId, pricePiastres, extra = {}) => ({ componentId, displayName: names[componentId], displayOrder: 1, pricePiastres,
  enabled: true, available: true, inventoryMode: componentId.startsWith('ribbon-') ? 'status_only' : 'tracked', inventoryQuantity: componentId.startsWith('ribbon-') ? null : 10,
  priceApproval: pricePiastres === 0 ? 'complimentary' : 'paid', priceApprovedBy: admin?._id || '507f1f77bcf86cd799439011', priceApprovedAt: new Date('2026-10-28T00:00:00Z'),
  createdBy: admin?._id || '507f1f77bcf86cd799439011', updatedBy: admin?._id || '507f1f77bcf86cd799439011', __v: 5, ...extra });
const settings = () => [setting('box-2', 12000), setting('rose-red', 300), setting('plush-1', 10000), setting('chocolate-1', 500), setting('ribbon-red', 0), setting('gift-card-1', 100)];
function input() {
  const items = [{ componentId: 'rose-red', quantity: 2 }, { componentId: 'plush-1', quantity: 1 }, { componentId: 'chocolate-1', quantity: 1 }];
  return { kind: GIFT_BOX_REQUEST_KIND, contractVersion: GIFT_BOX_REQUEST_CONTRACT_VERSION, requestKey: randomUUID(), catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
    draftGeometryVersion: 'gift-box-photo-study-2026-10-28.1', coordinateSystem: 'normalized-scene',
    selection: { boxId: 'box-2', items, ribbonId: 'ribbon-red', giftCard: { componentId: 'gift-card-1', message: 'For you\nهدية جميلة 💐' } },
    placements: items.flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({ instanceId: randomUUID(), componentId: item.componentId, x: .3 + index * .05, y: .4, zone: item.componentId.startsWith('plush') ? 'beside' : 'inside', regionId: item.componentId.startsWith('plush') ? 'beside-proposal' : 'heart-floor', layer: 20 + index }))),
    customer: { name: 'Synthetic Request Customer', phone: '01012345678', email: '' } };
}
const prepare = value => prepareGiftBoxV2Request(value, settings());
const action = (record, action, extra = {}) => actOnServiceRequest(String(record._id), { revision: record.revision, action, reason: 'Synthetic owner review evidence', ...extra }, admin);
async function http(path, { method = 'GET', body, requestHeaders = headers } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...requestHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, headers: response.headers, ...(await response.json()) };
}
before(async () => {
  database = await startTestDatabase({ transactions: true });
  await GiftBoxComponentSetting.createCollection(); await GiftBoxComponentSetting.createIndexes();
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
beforeEach(async () => {
  for (const Model of [ServiceRequest, GiftBoxComponentSetting, Order, User, Session, NotificationEvent]) await Model.deleteMany({});
  env.checkoutEnabled = true; env.customRequestsEnabled = true; env.giftBoxBuilderBackendEnabled = true;
  admin = await User.create({ name: 'Synthetic admin', email: 'request-admin@example.test', role: 'admin', active: true, passwordHash: 'isolated-fixture' });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: admin._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  headers = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
  await GiftBoxComponentSetting.create(settings());
});
after(async () => {
  env.checkoutEnabled = flags.checkout; env.customRequestsEnabled = flags.intake; env.giftBoxBuilderBackendEnabled = flags.builder;
  await new Promise(resolve => server.close(resolve)); await database.stop();
});

test('V2 preparation snapshots server prices, quantities, units, revisions, stock and ribbon color once', () => {
  const value = input(), prepared = prepare(value), snapshot = prepared.snapshot;
  assert.equal(prepared.customer.phone, '+201012345678'); assert.equal(prepared.customer.email, null);
  assert.equal(snapshot.estimate.componentSubtotalPiastres, 23200);
  const rose = snapshot.estimate.items.find(item => item.componentId === 'rose-red');
  assert.equal(rose.displayName, names['rose-red']); assert.equal(rose.unit, 'individual-rose'); assert.equal(rose.quantity, 2); assert.equal(rose.unitPricePiastres, 300); assert.equal(rose.lineSubtotalPiastres, 600);
  assert.equal(rose.inventoryQuantity, 10); assert.equal(rose.inventoryMode, 'tracked'); assert.equal(rose.available, true); assert.equal(rose.settingsRevision, 5);
  const ribbon = snapshot.estimate.items.find(item => item.componentId === 'ribbon-red'); assert.equal(ribbon.colorHex, '#C92D39'); assert.equal(ribbon.inventoryQuantity, null); assert.equal(ribbon.unitPricePiastres, 0);
  assert.equal(snapshot.estimate.items.find(item => item.componentId === 'chocolate-1').unit, 'complete-pictured-retail-unit');
  assert.equal(snapshot.selection.giftCard.componentId, 'gift-card-1'); assert.equal(snapshot.physicalFitReviewRequired, true); assert.equal(snapshot.arrangementApproved, false); assert.equal(snapshot.inventoryReserved, false);
  assert.equal(snapshot.geometryReviewStatus, 'unreviewed'); assert.equal(snapshot.submissionAllowed, false); assert.equal(snapshot.orderConversionAllowed, false);
  assert.deepEqual(snapshot.physicalFitReview, { required: true, authoritativeGeometryStatus: 'unreviewed', draftVersionVerified: false, regionIdsVerified: false, placementTraceStatus: 'unverified-customer-proposal' });
  assert.equal(Object.isFrozen(snapshot.estimate.items[0]), true); assert.match(prepared.requestHash, /^[a-f0-9]{64}$/);
});
test('V2 strict input rejects client prices, totals, availability, fake media and approval fields', () => {
  const value = input();
  for (const patch of [{ pricePiastres: 0 }, { estimate: { componentSubtotalPiastres: 1 } }, { arrangementApproved: true }, { previewUrl: 'https://invalid.example/fake' }, { owner: stranger }, { giftBoxV2Snapshot: {} }]) assert.equal(giftBoxV2RequestInput.safeParse({ ...value, ...patch }).success, false);
  assert.throws(() => prepare({ ...value, selection: { ...value.selection, items: [{ componentId: 'rose-red', quantity: 2, unitPricePiastres: 0 }] } }));
  assert.throws(() => prepare({ ...value, placements: value.placements.map(item => ({ ...item, available: true })) }));
});
test('blank optional card message and 500 Unicode code points work, malformed or longer messages fail', () => {
  for (const message of ['', '💐'.repeat(500), 'رسالة\nMessage\t💐']) { const value = input(); value.selection.giftCard.message = message; assert.equal(prepare(value).snapshot.selection.giftCard.message, message); }
  for (const message of ['💐'.repeat(501), '\ud800', 'unsafe\u0000text']) { const value = input(); value.selection.giftCard.message = message; assert.throws(() => prepare(value)); }
  const value = input(); value.selection.giftCard = null; const snapshot = prepare(value).snapshot; assert.equal(snapshot.selection.giftCard, null); assert.equal(snapshot.estimate.items.some(item => item.category === 'gift_card'), false);
});
test('whole requested quantity, manual availability and each inventory mode are rechecked without stock mutation', () => {
  const value = input(), saved = settings();
  for (const patch of [{ inventoryQuantity: 1 }, { available: false }, { inventoryMode: null }, { pricePiastres: null }, { priceApprovedBy: null }]) assert.throws(() => prepareGiftBoxV2Request(value, saved.map(item => item.componentId === 'rose-red' ? { ...item, ...patch } : item)));
  const made = prepareGiftBoxV2Request(value, saved.map(item => item.componentId === 'rose-red' ? { ...item, inventoryMode: 'made_to_order', inventoryQuantity: 0 } : item)); assert.equal(made.snapshot.estimate.items.find(item => item.componentId === 'rose-red').inventoryMode, 'made_to_order');
  assert.throws(() => prepareGiftBoxV2Request(value, saved.map(item => item.componentId === 'ribbon-red' ? { ...item, inventoryMode: 'tracked', inventoryQuantity: 10 } : item)));
  assert.equal(saved.find(item => item.componentId === 'rose-red').inventoryQuantity, 10);
});
test('one distinct placement UUID per selected instance and bounded coordinates/region labels are mandatory', () => {
  const value = input();
  for (const placements of [value.placements.slice(1), [...value.placements, value.placements[0]], value.placements.map(item => ({ ...item, instanceId: value.placements[0].instanceId })), value.placements.map(item => ({ ...item, x: 1.01 })), value.placements.map(item => ({ ...item, regionId: '<script>' })), value.placements.map(item => ({ ...item, componentId: 'box-2' }))]) assert.throws(() => prepare({ ...value, placements }));
  assert.throws(() => prepare({ ...value, placements: value.placements.map(item => item.componentId === 'rose-red' ? { ...item, zone: 'beside' } : item) }), { code: 'GIFT_BOX_PLACEMENT_ZONE' });
});
test('configuration/assets/authority versions and contact are validated; ordering does not change immutable identity', () => {
  const value = input();
  for (const key of ['contractVersion', 'catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion', 'coordinateSystem']) assert.throws(() => prepare({ ...value, [key]: 'obsolete' }));
  assert.throws(() => prepare({ ...value, customer: { ...value.customer, phone: 'not a phone' } }));
  assert.equal(prepare(value).requestHash, prepare({ ...value, selection: { ...value.selection, items: [...value.selection.items].reverse() }, placements: [...value.placements].reverse(), customer: { ...value.customer, phone: '+201012345678' } }).requestHash);
});
test('flags and forged arrangement approvals cannot open production acceptance or the legacy quotation/conversion path', () => {
  assert.throws(assertGiftBoxV2SubmissionClosed, { code: 'GIFT_BOX_V2_SUBMISSION_DISABLED' });
  assert.throws(() => assertGiftBoxV2ProductionAcceptance({ ...prepare(input()).snapshot, arrangementApproved: true, physicalFitReviewRequired: false }), { code: 'GIFT_BOX_GEOMETRY_REVIEW_REQUIRED' });
  for (const action of ['prepare', 'share', 'accept', 'convert']) assert.throws(() => assertLegacyRequestAction({ giftBoxV2Snapshot: {} }, action), { code: action === 'convert' ? 'GIFT_BOX_V2_CONVERSION_DISABLED' : 'GIFT_BOX_V2_QUOTATION_DISABLED' });
  for (const action of ['review', 'decline', 'cancel']) assert.doesNotThrow(() => assertLegacyRequestAction({ giftBoxV2Snapshot: {} }, action));
  assert.doesNotThrow(() => assertLegacyRequestAction({ service: 'gift_box' }, 'prepare'));
});
test('disposable transaction persistence is owner/key bound, concurrent retries recover one immutable reference and allocate no stock', async () => {
  const value = input(), results = await Promise.all([persist(owner, value), persist(owner, value)]);
  assert.equal(results[0].reference, results[1].reference); assert.equal(await ServiceRequest.countDocuments(), 1);
  assert.match(results[0].reference, /^TW-[A-F0-9]{12}$/); assert.equal(results[0].history[0].event, 'submitted'); assert.deepEqual(results[0].components, []);
  assert.equal(await Order.countDocuments(), 0); assert.equal(await NotificationEvent.countDocuments(), 0); assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' })).inventoryQuantity, 10);
  await assert.rejects(persist(owner, { ...value, customer: { ...value.customer, name: 'Different submission' } }), { code: 'GIFT_BOX_REQUEST_KEY_CONFLICT' });
  const other = await persist(stranger, value); assert.notEqual(other.reference, results[0].reference); assert.equal(other.owner, stranger);
});
test('an immutable retry recovers the saved snapshot after current stock/prices become unavailable', async () => {
  const value = input(), record = await persist(owner, value);
  await GiftBoxComponentSetting.deleteMany({});
  const recovered = await persist(owner, value); assert.equal(recovered.reference, record.reference); assert.equal(recovered.giftBoxV2Snapshot.estimate.componentSubtotalPiastres, 23200);
  await assert.rejects(persist(stranger, value), { code: 'GIFT_BOX_COMPONENT_UNAVAILABLE' });
});
test('test persistence refuses runtime, staging or configured merchant URI even on a disposable connection', async () => {
  for (const [key, value] of [['nodeEnv', 'development'], ['databaseTarget', 'staging'], ['mongoUri', 'mongodb://127.0.0.1:1/never-connect']]) {
    const previous = env[key]; env[key] = value;
    try { await assert.rejects(persist(owner, input()), { code: 'GIFT_BOX_TEST_PERSISTENCE_ONLY' }); } finally { env[key] = previous; }
  }
  assert.equal(await ServiceRequest.countDocuments(), 0);
});
test('V2 HTTP submissions stay closed with valid CSRF and every existing flag enabled; invalid Origin/CSRF still fail', async () => {
  const value = input();
  const response = await http('/gift-box/requests', { method: 'POST', body: value }); assert.equal(response.status, 503); assert.equal(response.error.code, 'GIFT_BOX_V2_SUBMISSION_DISABLED');
  assert.equal((await http('/gift-box/requests', { method: 'POST', body: value, requestHeaders: { ...headers, Origin: 'https://foreign.example' } })).status, 403);
  assert.equal((await http('/gift-box/requests', { method: 'POST', body: value, requestHeaders: { ...headers, 'x-csrf-token': '' } })).status, 403);
  assert.equal((await http('/commerce/service-requests', { method: 'POST', body: value })).status, 400); assert.equal(await ServiceRequest.countDocuments(), 0);
});
test('existing opaque submission lookup keeps current owner isolation and returns receipts without private snapshot/contact details', async () => {
  const value = input(), record = await persist(owner, value);
  const own = await http(`/commerce/service-requests/submissions/${value.requestKey}`, { requestHeaders: { Cookie: `tw_cart=${guestToken}` } });
  assert.equal(own.status, 200); assert.equal(own.data.request.reference, record.reference); assert.equal(own.data.request.customer, undefined); assert.equal(own.data.request.giftBoxV2Snapshot, undefined);
  const foreign = await http(`/commerce/service-requests/submissions/${value.requestKey}`, { requestHeaders: { Cookie: `tw_cart=${otherToken}` } }); assert.equal(foreign.data.request, null);
  const rotated = await http(`/commerce/service-requests/submissions/${value.requestKey}`, { requestHeaders: {} }); assert.equal(rotated.data.request, null);
});
test('admin snapshot serializer is allowlisted and V2 review/close preserve history while quote/conversion are blocked', async () => {
  const record = await persist(owner, input()), snapshot = record.giftBoxV2Snapshot;
  const presentation = presentGiftBoxV2Snapshot({ ...snapshot, privateStorageKey: 'must-not-serialize', estimate: { ...snapshot.estimate, items: snapshot.estimate.items.map(item => ({ ...item, secret: 'must-not-serialize' })) } });
  assert.equal(JSON.stringify(presentation).includes('must-not-serialize'), false);
  assert.equal((await http(`/admin/commerce/service-requests/${record._id}`, { requestHeaders: {} })).status, 401);
  const detail = await http(`/admin/commerce/service-requests/${record._id}`); assert.equal(detail.status, 200); assert.equal(detail.data.request.giftBoxV2Snapshot.estimate.componentSubtotalPiastres, 23200); assert.match(detail.headers.get('cache-control'), /no-store/);
  for (const name of ['prepare', 'share', 'accept', 'convert']) await assert.rejects(action(record, name), { code: name === 'convert' ? 'GIFT_BOX_V2_CONVERSION_DISABLED' : 'GIFT_BOX_V2_QUOTATION_DISABLED' });
  assert.equal(requestWhatsapp({ ...record, quotations: [{ version: 1 }] }), null);
  const reviewed = await action(record, 'review'); assert.equal(reviewed.state, 'needs_review'); assert.equal(reviewed.history.at(-1).event, 'review');
  const closed = await action(reviewed, 'cancel'); assert.equal(closed.state, 'cancelled'); assert.equal(closed.history.at(-1).event, 'cancel'); assert.equal(await Order.countDocuments(), 0);
});
test('legacy gift-box requests still prepare normal quotation totals without a V2 snapshot', async () => {
  const record = await createServiceRequest(owner, { requestKey: randomUUID(), service: 'gift_box', customer: { name: 'Synthetic Legacy Customer', phone: '01012345678' }, details: { occasion: 'Synthetic occasion', contents: 'Synthetic custom contents', quantity: 1 }, components: [], uploadIds: [] });
  const prepared = await action(record, 'prepare', { quote: { baseUnitPiastres: 10000, discountPiastres: 0, charges: [], shippingPiastres: 1000, shippingFree: false, allowedPaymentMethods: ['instapay'], codAuthorized: false } });
  assert.equal(prepared.giftBoxV2Snapshot, null); assert.equal(prepared.quotations[0].totalPiastres, 11000); assert.equal(prepared.state, 'quote_prepared');
});
test('malformed or unknown snapshots retain a truthy review-only DTO and remain financially blocked', async () => {
  const original = prepare(input()).snapshot;
  const replaceItem = patch => ({ ...original, estimate: { ...original.estimate, items: original.estimate.items.map((item, index) => index === 0 ? { ...item, ...patch } : item) } });
  const malformed = [false, 0, '', true, [], {}, 'obsolete snapshot', { ...original, contractVersion: 'gift-box-request-v2.99' },
    { ...original, selection: null }, { ...original, selection: { ...original.selection, items: {} } },
    { ...original, placements: {} }, { ...original, placements: [null] },
    { ...original, placements: original.placements.map(item => ({ ...item, x: '0.5' })) },
    { ...original, estimate: { ...original.estimate, items: {} } }, { ...original, estimate: { ...original.estimate, items: [null] } },
    replaceItem({ unit: undefined }), replaceItem({ unit: 'unknown-unit' }), replaceItem({ category: undefined, unit: undefined }), replaceItem({ category: { toString: 'not callable' } }),
    replaceItem({ unitPricePiastres: undefined }), replaceItem({ displayName: {} }),
    { ...original, selection: { ...original.selection, giftCard: { componentId: 'gift-card-1', message: { unsafe: 'not text' } } } }];
  for (const snapshot of malformed) {
    const dto = presentGiftBoxV2Snapshot(snapshot);
    assert.equal(dto.kind, GIFT_BOX_REQUEST_KIND); assert.equal(dto.presentationStatus, 'specialist_review_required');
    assert.equal(dto.physicalFitReviewRequired, true); assert.equal(dto.orderConversionAllowed, false); assert.equal(dto.estimate, undefined); assert.equal(dto.selection, undefined);
    assert.throws(() => assertLegacyRequestAction({ giftBoxV2Snapshot: snapshot }, 'prepare'), { code: 'GIFT_BOX_V2_QUOTATION_DISABLED' });
    assert.throws(() => assertLegacyRequestAction({ giftBoxV2Snapshot: snapshot }, 'convert'), { code: 'GIFT_BOX_V2_CONVERSION_DISABLED' });
  }
  for (const snapshot of [null, undefined]) { assert.equal(presentGiftBoxV2Snapshot(snapshot), null); assert.doesNotThrow(() => assertLegacyRequestAction({ giftBoxV2Snapshot: snapshot }, 'prepare')); }
  const saved = await persist(owner, input());
  const record = await ServiceRequest.create({ ...saved, _id: undefined, requestKey: randomUUID(), reference: `TW-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`, giftBoxV2Snapshot: replaceItem({ unit: undefined }) });
  const response = await http(`/admin/commerce/service-requests/${record._id}`); assert.equal(response.status, 200);
  assert.equal(response.data.request.giftBoxV2Snapshot.presentationStatus, 'specialist_review_required');
  await assert.rejects(action(record, 'prepare'), { code: 'GIFT_BOX_V2_QUOTATION_DISABLED' });
});
