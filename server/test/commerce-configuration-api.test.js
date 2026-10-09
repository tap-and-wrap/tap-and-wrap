import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { DiscountRedemption } from '../src/models/DiscountRedemption.js';
import { Order } from '../src/models/Order.js';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import DiscountCode from '../src/models/DiscountCode.js';
import BundleRule from '../src/models/BundleRule.js';
import ShippingConfig from '../src/models/ShippingConfig.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { calculatePromotions, claimDiscountRedemption, getShippingQuote, lockShippingQuote } from '../src/commerce/promotions.js';
import { startTestDatabase } from './helpers/database.js';
import { addCartItem } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { resetCommerceLimitsForTests } from '../src/commerce/routes.js';

const models = [...new Set([User, Session, Product, Category, ComponentOption, CustomizationTemplate, DiscountCode, BundleRule, ShippingConfig, AdminAudit, DiscountRedemption, ...Object.values(mongoose.models)])];
let stopDatabase;
let server;
let base;
let admin;
let customer;
let main;
let child;

async function account(role) {
  const user = await User.create({ name: `${role} fixture`, email: `${role}@example.test`, passwordHash: 'isolated-test-password-hash', role, active: true });
  const token = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  const csrf = makeCsrfToken(env.sessionSecret);
  return { user, headers: { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf } };
}
async function request(path, { method = 'GET', body, headers = admin?.headers || {}, autoRevision = true } = {}) {
  // Existing workflow fixtures explicitly read the editable revision before a
  // mutation. Conflict tests below send captured revisions or disable this helper.
  if (autoRevision && body && body.expectedRevision === undefined && (method === 'PATCH' || path.endsWith('/revisions'))) {
    const match = path.match(/\/admin\/commerce\/(templates|components|bundles|discounts|products)\/([a-f\d]{24})/i);
    const Model = match && { templates: CustomizationTemplate, components: ComponentOption, bundles: BundleRule, discounts: DiscountCode, products: Product }[match[1]];
    const record = Model ? await Model.findById(match[2]).select('__v').lean() : path.endsWith('/admin/commerce/shipping') ? await ShippingConfig.findOne({ key: 'egypt-v1' }).select('__v').lean() : null;
    if (Model || path.endsWith('/admin/commerce/shipping')) body = { ...body, expectedRevision: record?.__v ?? 0 };
  }
  const response = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  return { status: response.status, data: payload.data, error: payload.error, headers: response.headers, payload };
}
async function product(slug, overrides = {}) {
  return Product.create({ name: `Isolated ${slug}`, slug, description: 'Isolated fixture', categoryId: main._id, subcategoryId: child._id, mainImageKey: `products/${slug}.webp`, galleryKeys: [`products/${slug}.webp`], pricePiastres: 12000, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, status: 'ready', reviewRequired: false, ...overrides });
}
async function template(key, overrides = {}) {
  return CustomizationTemplate.create({ key, name: `Isolated ${key}`, kind: 'generic', status: 'approved', active: true, groups: [], fields: [], ...overrides });
}

before(async () => {
  stopDatabase = await startTestDatabase({ models, transactions: true });
  admin = await account('admin');
  customer = await account('customer');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  resetCommerceLimitsForTests();
  await Promise.all(models.filter((model) => ![User, Session].includes(model)).map((model) => model.deleteMany({})));
  main = await Category.create({ name: 'Isolated gifts', slug: 'isolated-gifts', active: true });
  child = await Category.create({ name: 'Isolated boxes', slug: 'isolated-boxes', parentId: main._id, active: true });
});

test('configuration edits require captured revisions and stale sequential forms never overwrite records', async () => {
  const records = [
    ['templates', await template('revision-draft', { status: 'draft', active: false }), { name: 'First template edit' }],
    ['components', await ComponentOption.create({ name: 'Revision component', slug: 'revision-component', catalogRole: 'Customization Option', categoryId: main._id, mainImageKey: 'fixtures/component.webp', galleryKeys: ['fixtures/component.webp'] }), { name: 'First component edit' }],
    ['discounts', await DiscountCode.create({ code: 'REVISION', name: 'Revision discount', kind: 'fixed', value: 100 }), { name: 'First discount edit' }],
  ];
  const first = await product('revision-bundle-first'), second = await product('revision-bundle-second');
  records.push(['bundles', await BundleRule.create({ name: 'Revision bundle', items: [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 1 }], discountKind: 'fixed', discountValue: 100 }), { name: 'First bundle edit' }]);
  for (const [section, record, patch] of records) {
    const path = `/api/v1/admin/commerce/${section}/${record._id}`;
    const loaded = (await request(path)).data[section.slice(0, -1)];
    assert.equal(loaded.revision, 0);
    assert.equal(loaded.__v, undefined);
    assert.equal((await request(path, { method: 'PATCH', body: patch, autoRevision: false })).status, 400);
    const saved = await request(path, { method: 'PATCH', body: { ...patch, expectedRevision: loaded.revision } });
    assert.equal(saved.status, 200, JSON.stringify(saved.error));
    assert.equal(saved.data[section.slice(0, -1)].revision, 1);
    const stale = await request(path, { method: 'PATCH', body: { name: 'Unsafe stale overwrite', expectedRevision: loaded.revision } });
    assert.equal(stale.status, 409);
    assert.equal(stale.error.code, 'EDIT_CONFLICT');
    assert.equal((await request(path)).data[section.slice(0, -1)].name, patch.name);
  }
  assert.equal(await AdminAudit.countDocuments(), 4);
});

test('concurrent promotion/template edits allow one winner and a clear revision conflict', async () => {
  const records = [
    ['templates', await template('concurrent-draft', { status: 'draft', active: false })],
    ['discounts', await DiscountCode.create({ code: 'CONCURRENT', name: 'Concurrent discount', kind: 'fixed', value: 100 })],
  ];
  for (const [section, record] of records) {
    const path = `/api/v1/admin/commerce/${section}/${record._id}`;
    const results = await Promise.all(['Editor A', 'Editor B'].map((name) => request(path, { method: 'PATCH', body: { expectedRevision: 0, name } })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(results.find((result) => result.status === 409).error.code, 'EDIT_CONFLICT');
    assert.equal((await request(path)).data[section.slice(0, -1)].revision, 1);
  }
});

test('creating a revision fences its source so stale approved-template editors cannot create extra versions', async () => {
  const approved = await template('approved-revision-fence');
  const path = `/api/v1/admin/commerce/templates/${approved._id}`;
  const first = await request(`${path}/revisions`, { method: 'POST', body: { expectedRevision: 0 } });
  assert.equal(first.status, 201, JSON.stringify(first.error));
  assert.equal(first.data.template.version, 2);
  const stale = await request(path, { method: 'PATCH', body: { expectedRevision: 0, name: 'Stale rules' } });
  assert.equal(stale.status, 409);
  assert.equal(await CustomizationTemplate.countDocuments({ key: approved.key }), 2);
  assert.equal((await CustomizationTemplate.findById(approved._id)).name, approved.name);
});

test('product configuration and first shipping edits cannot reuse a stale form revision', async () => {
  const ready = await product('configured-revision');
  const path = `/api/v1/admin/commerce/products/${ready._id}/configuration`;
  const fields = [{ key: 'gift-message', label: 'Gift message', type: 'short_text', maxLength: 5000, required: false }];
  const saved = await request(path, { method: 'PATCH', body: { expectedRevision: 0, personalization: { fields } } });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal(saved.data.product.revision, 1);
  assert.equal((await request(path, { method: 'PATCH', body: { expectedRevision: 0, personalization: { fields: [] } } })).status, 409);
  assert.equal((await Product.findById(ready._id)).personalization.fields[0].key, 'gift-message');
  const shippingPath = '/api/v1/admin/commerce/shipping';
  const initial = (await request(shippingPath)).data.configuration;
  assert.equal(initial.revision, 0);
  const shipping = await request(shippingPath, { method: 'PATCH', body: { expectedRevision: 0, cairoGizaPiastres: 9500 } });
  assert.equal(shipping.status, 200, JSON.stringify(shipping.error));
  assert.equal(shipping.data.configuration.revision, 1);
  assert.equal((await request(shippingPath, { method: 'PATCH', body: { expectedRevision: 0, cairoGizaPiastres: 1 } })).status, 409);
  assert.equal((await ShippingConfig.findOne()).cairoGizaPiastres, 9500);
});

test('real template CRUD rejects unsupported option availability and enforces configured limits', async () => {
  const base = { key: 'strict-options', name: 'Strict option fixture', kind: 'generic', groups: [{ key: 'extras', label: 'Extras', options: [{ key: 'gift-card', label: 'Card', minQuantity: 1, maxQuantity: 20, defaultQuantity: 0 }] }], fields: [{ key: 'gift-message', label: 'Message', type: 'text', maxChars: 2000 }] };
  const invalid = structuredClone(base); invalid.groups[0].options[0].available = true;
  assert.equal((await request('/api/v1/admin/commerce/templates', { method: 'POST', body: invalid })).status, 400);
  assert.equal(await CustomizationTemplate.countDocuments(), 0);
  const created = await request('/api/v1/admin/commerce/templates', { method: 'POST', body: base });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const path = `/api/v1/admin/commerce/templates/${created.data.template._id}`;
  const tooMany = structuredClone(base.groups); tooMany[0].options[0].maxQuantity = 21;
  assert.equal((await request(path, { method: 'PATCH', body: { expectedRevision: 0, groups: tooMany } })).status, 400);
  const saved = await request(path, { method: 'PATCH', body: { expectedRevision: 0, name: 'Edited strict fixture' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.template.groups[0].options[0].available, undefined);
});

test('actual engraving DTO has unique fields and hyphenated fields flow through quote and cart validation', async () => {
  const laser = await template('serialized-laser', { kind: 'laser_engraving', fields: [{ key: 'gift-message', label: 'Message', type: 'text', maxChars: 2000 }], engraving: { materials: [{ key: 'steel', label: 'Approved steel' }], fonts: [{ key: 'script', label: 'Approved script' }], placements: [{ key: 'front', label: 'Front' }], maxChars: 500, maxCharsPerLine: 500, artworkAllowed: true, artworkMaxFiles: 5 } });
  const ready = await product('serialized-engraving', { customization: { enabled: true, serviceKind: 'laser_engraving', templateId: laser._id, serviceEntryEligible: true } });
  const response = await request(`/api/v1/commerce/customization/products/${ready.slug}`);
  assert.equal(response.status, 200, JSON.stringify(response.error));
  const definitions = response.data.template.fields;
  assert.equal(new Set(definitions.map((field) => field.key)).size, definitions.length);
  for (const key of ['engraving_text', 'engraving_material', 'engraving_font', 'engraving_placement', 'engraving_artwork']) assert.equal(definitions.filter((field) => field.key === key).length, 1);
  assert.deepEqual(definitions.find((field) => field.key === 'engraving_material').options, [{ key: 'steel', label: 'Approved steel' }]);
  const customization = { templateId: String(laser._id), version: 1, selections: [], fields: { 'gift-message': 'A real-contract fixture', engraving_text: 'Approved message', engraving_material: 'steel', engraving_font: 'script', engraving_placement: 'front' } };
  const quote = await request('/api/v1/commerce/customization/quote', { method: 'POST', body: { productId: String(ready._id), customization } });
  assert.equal(quote.status, 200, JSON.stringify(quote.error));
  const cart = await request('/api/v1/commerce/cart/items', { method: 'POST', body: { productId: String(ready._id), quantity: 1, customization } });
  assert.equal(cart.status, 201, JSON.stringify(cart.error));
  assert.equal(cart.data.cart.items[0].customization.fields['gift-message'], 'A real-contract fixture');
  const invalid = structuredClone(customization); invalid.fields['gift-message'] = 'x'.repeat(2001);
  assert.equal((await request('/api/v1/commerce/customization/quote', { method: 'POST', body: { productId: String(ready._id), customization: invalid } })).status, 400);
});

test('configured personalization character limits count Unicode characters consistently with the commerce request contract', async () => {
  const ready = await product('unicode-personalization', { personalization: { fields: [{ key: 'gift-message', label: 'Message', type: 'long_text', maxLength: 5000, required: true }] } });
  const path = '/api/v1/commerce/cart/items';
  const valid = { productId: String(ready._id), quantity: 1, personalization: { 'gift-message': '🎁'.repeat(5000) } };
  const added = await request(path, { method: 'POST', body: valid });
  assert.equal(added.status, 201, JSON.stringify(added.error));
  assert.equal(Array.from(added.data.cart.items[0].personalization['gift-message']).length, 5000);
  assert.equal((await request(path, { method: 'POST', body: { ...valid, personalization: { 'gift-message': '🎁'.repeat(5001) } } })).status, 400);
});

test('component creation and concurrent category reparenting cannot commit an invalid catalog relationship', async () => {
  for (let index = 0; index < 6; index += 1) {
    const category = await Category.create({ name: `Race category ${index}`, slug: `race-category-${index}`, parentId: null });
    const [component, reparent] = await Promise.all([
      request('/api/v1/admin/commerce/components', { method: 'POST', body: { name: `Race component ${index}`, slug: `race-component-${index}`, categoryId: String(category._id), mainImageKey: 'fixtures/race.webp', galleryKeys: ['fixtures/race.webp'] } }),
      request(`/api/v1/admin/categories/${category._id}`, { method: 'PATCH', body: { expectedRevision: 0, parentId: String(main._id) } }),
    ]);
    assert.ok([201, 400, 409].includes(component.status), JSON.stringify(component));
    assert.ok([200, 409].includes(reparent.status), JSON.stringify(reparent));
    assert.equal(component.status === 201 && reparent.status === 200, false, 'both conflicting relationship changes must not commit');
    const current = await Category.findById(category._id).lean();
    if (component.status === 201) {
      assert.equal(current.parentId, null);
      assert.equal(await ComponentOption.countDocuments({ categoryId: category._id }), 1);
    } else {
      assert.equal(String(current.parentId), String(main._id));
      assert.equal(await ComponentOption.countDocuments({ categoryId: category._id }), 0);
    }
  }
});

test('legacy imported component revisions initialize only within an authorized edit and then reject stale writes', async () => {
  const component = await ComponentOption.create({ name: 'Legacy revision component', slug: 'legacy-revision-component', catalogRole: 'Customization Option', categoryId: main._id, mainImageKey: 'fixtures/legacy.webp', galleryKeys: ['fixtures/legacy.webp'] });
  await ComponentOption.collection.updateOne({ _id: component._id }, { $unset: { __v: '' } });
  const path = `/api/v1/admin/commerce/components/${component._id}`;
  const loaded = await request(path);
  assert.equal(loaded.data.component.revision, 0);
  assert.equal((await ComponentOption.collection.findOne({ _id: component._id })).__v, undefined, 'GET must not normalize or write imported data');
  const saved = await request(path, { method: 'PATCH', body: { expectedRevision: 0, name: 'Authorized legacy component edit' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal(saved.data.component.revision, 1);
  assert.equal((await request(path, { method: 'PATCH', body: { expectedRevision: 0, name: 'Stale imported edit' } })).status, 409);
  const current = await ComponentOption.findById(component._id).lean();
  assert.equal(current.name, 'Authorized legacy component edit');
  assert.equal(current.status, 'draft');
  assert.equal(current.priceApproved, false);
  assert.equal(current.inventory.approved, false);
  assert.equal(current.inventory.quantity, 10);
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopDatabase?.stop();
});

test('commerce configuration admin APIs reject anonymous customers and missing CSRF without writes', async () => {
  assert.equal((await request('/api/v1/admin/commerce/templates', { headers: {} })).status, 401);
  assert.equal((await request('/api/v1/admin/commerce/templates', { headers: customer.headers })).status, 403);
  const noCsrf = { ...admin.headers };
  delete noCsrf['x-csrf-token'];
  assert.equal((await request('/api/v1/admin/commerce/templates', { method: 'POST', body: { key: 'blocked', name: 'Blocked', kind: 'generic' }, headers: noCsrf })).status, 403);
  assert.equal(await CustomizationTemplate.countDocuments(), 0);
  assert.equal(await AdminAudit.countDocuments(), 0);
});

test('template lists paginate at twenty and exclude full group configuration', async () => {
  await Promise.all(Array.from({ length: 23 }, (_, index) => template(`fixture-${index}`, { status: 'draft', active: false, groups: [{ key: 'extra', label: 'Extra', options: [{ key: 'card', label: 'Card', priceAdjustmentPiastres: 100 }] }] })));
  const first = await request('/api/v1/admin/commerce/templates?limit=20&page=1');
  assert.equal(first.status, 200);
  assert.equal(first.data.templates.length, 20);
  assert.equal(first.data.pagination.total, 23);
  assert.equal(first.data.templates[0].groups, undefined);
  assert.equal((await request('/api/v1/admin/commerce/templates?limit=20&page=2')).data.templates.length, 3);
  assert.equal((await request('/api/v1/admin/commerce/templates?limit=21')).status, 400);
  const specific = await request('/api/v1/admin/commerce/templates?search=fixture-22');
  assert.equal(specific.data.pagination.total, 1);
  const detail = await request(`/api/v1/admin/commerce/templates/${specific.data.templates[0]._id}`);
  assert.equal(detail.data.template.groups[0].options[0].priceAdjustmentPiastres, 100);
});

test('approved template edits create a draft immutable revision and record authenticated audits', async () => {
  const created = await request('/api/v1/admin/commerce/templates', { method: 'POST', body: { key: 'configured', name: 'Isolated configured', kind: 'generic', status: 'approved', active: true, baseAdjustmentPiastres: 100 } });
  assert.equal(created.status, 201);
  const originalId = created.data.template._id;
  const revision = await request(`/api/v1/admin/commerce/templates/${originalId}`, { method: 'PATCH', body: { baseAdjustmentPiastres: 200 } });
  assert.equal(revision.status, 200);
  assert.equal(revision.data.revisionCreated, true);
  assert.equal(revision.data.template.version, 2);
  assert.equal(revision.data.template.status, 'draft');
  assert.equal(revision.data.template.active, false);
  assert.equal(String(revision.data.template.supersedes), originalId);
  assert.equal((await CustomizationTemplate.findById(originalId)).baseAdjustmentPiastres, 100);
  const approved = await request(`/api/v1/admin/commerce/templates/${revision.data.template._id}`, { method: 'PATCH', body: { status: 'approved', active: true } });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.revisionCreated, false);
  assert.equal(await AdminAudit.countDocuments({ actorId: admin.user._id }), 3);
});

test('components require explicit review resolution and merchant approval while preserving packaging classification', async () => {
  const created = await request('/api/v1/admin/commerce/components', { method: 'POST', body: { name: 'Isolated packaging', slug: 'isolated-packaging', categoryId: String(main._id), subcategoryId: String(child._id), catalogRole: 'Gift Packaging', mainImageKey: 'fixtures/packaging.webp', galleryKeys: ['fixtures/packaging.webp'], pricePiastres: 500, reviewRequired: true } });
  assert.equal(created.status, 201);
  const componentId = created.data.component._id;
  assert.equal(created.data.component.inventory.quantity, 10);
  assert.equal(created.data.component.inventory.approved, false);
  const configuration = { enabledForCustomization: true, configurationApproved: true, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true } };
  assert.equal((await request(`/api/v1/admin/commerce/components/${componentId}`, { method: 'PATCH', body: configuration })).status, 400);
  const approved = await request(`/api/v1/admin/commerce/components/${componentId}`, { method: 'PATCH', body: { ...configuration, reviewRequired: false, merchantReviewNotes: 'Merchant reviewed isolated fixture' } });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.component.catalogRole, 'Gift Packaging');
  assert.equal(approved.data.component.status, 'draft');
  assert.equal(approved.data.component.reviewRequired, false);
  assert.equal((await request(`/api/v1/admin/commerce/components/${componentId}`, { method: 'PATCH', body: { catalogRole: 'Customization Option' } })).status, 400);
  const made = await request(`/api/v1/admin/commerce/components/${componentId}`, { method: 'PATCH', body: { inventory: { mode: 'made_to_order', quantity: null, approved: true, available: true } } });
  assert.equal(made.status, 200);
  assert.equal(made.data.component.inventory.quantity, null);
});

test('customization service listing includes only approved eligible products with active related categories', async () => {
  const box = await template('gift-box', { kind: 'gift_box' });
  const customization = { enabled: true, serviceEntryEligible: true, serviceKind: 'gift_box', templateId: box._id };
  await product('ready-box', { customization });
  await product('draft-box', { customization, status: 'draft', priceApproved: false });
  const wrongParent = await Category.create({ name: 'Other main', slug: 'other-main', active: true });
  const otherChild = await Category.create({ name: 'Other child', slug: 'other-child', parentId: wrongParent._id, active: true });
  await product('inactive-box', { customization, subcategoryId: otherChild._id });
  await product('unavailable-box', { customization, inventory: { mode: 'tracked', quantity: 0, approved: true, available: false } });
  const result = await request('/api/v1/commerce/customization/services/gift_box/products?limit=20');
  assert.equal(result.status, 200);
  assert.equal(result.data.pagination.total, 1);
  assert.equal(result.data.products[0].slug, 'ready-box');
  assert.equal(result.data.products[0].category.name, main.name);
  assert.equal(JSON.stringify(result.data).includes('mainImageKey'), false);
  assert.equal((await request('/api/v1/commerce/customization/services/gift_box/products?limit=21')).status, 400);
  assert.equal((await request('/api/v1/commerce/customization/services/tray/products')).status, 404);
  assert.equal((await request('/api/v1/commerce/customization/products/draft-box')).status, 404);
});

test('public customization quote is authoritative and rejects stale configurations or private field injection', async () => {
  const box = await template('box-quote', { kind: 'gift_box', groups: [{ key: 'extra', label: 'Extra', minChoices: 1, maxChoices: 1, options: [{ key: 'card', label: 'Card', priceAdjustmentPiastres: 500 }] }] });
  const ready = await product('quote-box', { customization: { enabled: true, serviceEntryEligible: true, serviceKind: 'gift_box', templateId: box._id } });
  const selection = { templateId: String(box._id), version: box.version, selections: [{ groupKey: 'extra', optionKey: 'card', quantity: 1 }], fields: {} };
  const quote = await request('/api/v1/commerce/customization/quote', { method: 'POST', body: { productId: String(ready._id), customization: selection } });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.unitPricePiastres, 12500);
  assert.equal((await request('/api/v1/commerce/customization/quote', { method: 'POST', body: { productId: String(ready._id), unitPricePiastres: 1, customization: selection } })).status, 400);
  assert.equal((await request('/api/v1/commerce/customization/quote', { method: 'POST', body: { productId: String(ready._id), customization: { ...selection, version: 999 } } })).status, 409);
  const detail = await request('/api/v1/commerce/customization/products/quote-box');
  assert.equal(detail.data.template.groups[0].options[0].priceAdjustmentPiastres, 500);
  assert.equal(JSON.stringify(detail.data).includes('products/quote-box.webp'), false);
});

test('admin product configuration preserves price and images while requiring an approved matching template', async () => {
  const ready = await product('configured-product');
  const draft = await template('draft-config', { status: 'draft', active: false });
  const body = { personalization: { fields: [{ key: 'name', label: 'Name', type: 'short_text', required: true, maxLength: 20 }] }, customization: { enabled: true, templateId: String(draft._id), serviceKind: 'generic', serviceEntryEligible: false } };
  assert.equal((await request(`/api/v1/admin/commerce/products/${ready._id}/configuration`, { method: 'PATCH', body })).status, 400);
  const approved = await template('approved-config');
  const changed = await request(`/api/v1/admin/commerce/products/${ready._id}/configuration`, { method: 'PATCH', body: { ...body, customization: { ...body.customization, templateId: String(approved._id) } } });
  assert.equal(changed.status, 200, JSON.stringify(changed.payload));
  assert.equal(changed.data.product.personalization.fields[0].key, 'name');
  const stored = await Product.findById(ready._id).lean();
  assert.equal(stored.pricePiastres, 12000);
  assert.equal(stored.mainImageKey, ready.mainImageKey);
  assert.deepEqual(stored.galleryKeys, [...ready.galleryKeys]);
});

test('shipping configuration is explicitly approved and public rates use all governorates', async () => {
  const initial = await request('/api/v1/commerce/shipping');
  assert.equal(initial.status, 200);
  assert.equal(initial.data.governorates.length, 27);
  assert.deepEqual(initial.data.rates, { cairoGizaPiastres: 9000, otherGovernoratesPiastres: 12000 });
  const changed = await request('/api/v1/admin/commerce/shipping', { method: 'PATCH', body: { cairoGizaPiastres: 10000, otherGovernoratesPiastres: 14000, approved: false } });
  assert.equal(changed.status, 200);
  assert.equal((await request('/api/v1/commerce/shipping')).status, 409);
  assert.equal((await request('/api/v1/admin/commerce/shipping', { method: 'PATCH', body: { approved: true } })).status, 200);
  assert.equal((await request('/api/v1/commerce/shipping')).data.rates.cairoGizaPiastres, 10000);
});

test('admin promotion mutations validate configured references and cannot reset redemption counts', async () => {
  const first = await product('bundle-one');
  const second = await product('bundle-two');
  const bundleBody = { name: 'Isolated bundle', active: true, items: [{ productId: String(first._id), quantity: 1 }, { productId: String(second._id), quantity: 1 }], discountKind: 'percentage', discountValue: 1000 };
  const bundle = await request('/api/v1/admin/commerce/bundles', { method: 'POST', body: bundleBody });
  assert.equal(bundle.status, 201);
  assert.equal((await request(`/api/v1/admin/commerce/bundles/${bundle.data.bundle._id}`)).data.bundle.items.length, 2);
  const code = await request('/api/v1/admin/commerce/discounts', { method: 'POST', body: { code: 'ISOLATED', name: 'Isolated code', active: true, kind: 'fixed', value: 500, usageLimit: 10 } });
  assert.equal(code.status, 201);
  assert.equal((await request(`/api/v1/admin/commerce/discounts/${code.data.discount._id}`, { method: 'PATCH', body: { usedCount: 0 } })).status, 400);
  assert.equal((await request('/api/v1/admin/commerce/discounts', { method: 'POST', body: { code: 'INVALID', name: 'Bad percentage', active: true, kind: 'percentage', value: 10001 } })).status, 400);
});

test('discount quotes enforce actual authenticated redemption counts before order submission', async () => {
  const code = await DiscountCode.create({ code: 'ONCE', name: 'Isolated once', active: true, kind: 'fixed', value: 500, authenticatedOnly: true, perCustomerLimit: 1 });
  // Only the count fields are needed; this is a disposable fixture, not an order.
  await DiscountRedemption.collection.insertOne({ discountId: code._id, userId: customer.user._id, orderId: new Product.base.Types.ObjectId(), amountPiastres: 500 });
  await assert.rejects(calculatePromotions([{ productId: String(new Product.base.Types.ObjectId()), quantity: 1, unitPricePiastres: 2000 }], { code: 'ONCE', userId: customer.user._id }), (error) => error.code === 'DISCOUNT_UNAVAILABLE');
});

test('simultaneous discount claims cannot exceed a configured global usage limit', async () => {
  const code = await DiscountCode.create({ code: 'ONEUSE', name: 'Isolated limited', active: true, kind: 'fixed', value: 500, usageLimit: 1 });
  const claim = async () => {
    const session = await DiscountCode.startSession();
    try {
      await session.withTransaction(() => claimDiscountRedemption(code._id, { session }));
    } finally {
      await session.endSession();
    }
  };
  const attempts = await Promise.allSettled([claim(), claim()]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await DiscountCode.findById(code._id)).usedCount, 1);
});

test('shipping quotes lock an approved configuration version and reject merchant changes', async () => {
  const configuration = await ShippingConfig.create({ key: 'egypt-v1', cairoGizaPiastres: 9000, otherGovernoratesPiastres: 12000, approved: true });
  const quote = await getShippingQuote('cairo');
  assert.equal(quote.configurationId, String(configuration._id));
  assert.equal(quote.configurationVersion, 0);
  const session = await ShippingConfig.startSession();
  try {
    await session.withTransaction(async () => {
      const locked = await lockShippingQuote(quote, { session });
      assert.equal(locked.configurationVersion, 1);
    });
    const edited = await ShippingConfig.findById(configuration._id);
    edited.cairoGizaPiastres = 10000;
    await edited.save();
    await assert.rejects(session.withTransaction(() => lockShippingQuote(quote, { session })), (error) => error.code === 'SHIPPING_CHANGED');
    assert.equal((await ShippingConfig.findById(configuration._id)).cairoGizaPiastres, 10000);
  } finally {
    await session.endSession();
  }
});

test('first shipping-default initialization requires enabled checkout and never approves an existing draft', async () => {
  const originalCheckout = env.checkoutEnabled;
  const session = await ShippingConfig.startSession();
  try {
    const quote = await getShippingQuote('giza');
    assert.equal(quote.configurationId, null);
    env.checkoutEnabled = false;
    await assert.rejects(session.withTransaction(() => lockShippingQuote(quote, { session })), (error) => error.code === 'CHECKOUT_DISABLED');
    assert.equal(await ShippingConfig.countDocuments(), 0);
    env.checkoutEnabled = true;
    await session.withTransaction(() => lockShippingQuote(quote, { session }));
    const initialized = await ShippingConfig.findOne({ key: 'egypt-v1' });
    assert.equal(initialized.approved, true);
    assert.equal(initialized.cairoGizaPiastres, 9000);
    assert.equal(initialized.otherGovernoratesPiastres, 12000);
    await ShippingConfig.deleteMany({});
    const draft = await ShippingConfig.create({ key: 'egypt-v1', approved: false });
    await assert.rejects(session.withTransaction(() => lockShippingQuote(quote, { session })), (error) => error.code === 'SHIPPING_CHANGED');
    assert.equal((await ShippingConfig.findById(draft._id)).approved, false);
  } finally {
    env.checkoutEnabled = originalCheckout;
    await session.endSession();
  }
});

test('gift-box cart and checkout atomically price and consume configured component quantities with immutable order snapshots', async () => {
  const originalCheckout = env.checkoutEnabled;
  env.checkoutEnabled = true;
  try {
    const chocolate = await ComponentOption.create({ name: 'Isolated gift chocolate', slug: 'gift-chocolate', catalogRole: 'Customization Option', categoryId: main._id, subcategoryId: child._id, mainImageKey: 'fixtures/gift-chocolate.webp', galleryKeys: ['fixtures/gift-chocolate.webp'], pricePiastres: 1500, priceApproved: true, enabledForCustomization: true, configurationApproved: true, reviewRequired: false, inventory: { mode: 'tracked', quantity: 10, available: true, approved: true } });
    const boxTemplate = await template('composed-box', { kind: 'gift_box', groups: [{ key: 'extras', label: 'Gift extras', minChoices: 1, maxChoices: 1, options: [{ key: 'chocolate', label: 'Chocolate selection', componentId: chocolate._id, minQuantity: 1, maxQuantity: 3, priceAdjustmentPiastres: 100 }] }] });
    const baseProduct = await product('composed-gift-box', { customization: { enabled: true, serviceEntryEligible: true, serviceKind: 'gift_box', templateId: boxTemplate._id } });
    const owner = `user:${customer.user._id}`;
    const configuration = { templateId: String(boxTemplate._id), version: boxTemplate.version, selections: [{ groupKey: 'extras', optionKey: 'chocolate', quantity: 2 }], fields: {} };
    const cartInput = { productId: String(baseProduct._id), quantity: 2, personalization: {}, customization: configuration };
    const cartBefore = await mongoose.models.Cart.countDocuments();
    await assert.rejects(addCartItem(owner, { ...cartInput, customization: { ...configuration, selections: [{ groupKey: 'extras', optionKey: 'unconfigured', quantity: 1 }] } }), /option/i);
    assert.equal(await mongoose.models.Cart.countDocuments(), cartBefore);
    await addCartItem(owner, cartInput);
    assert.equal((await Product.findById(baseProduct._id)).inventory.quantity, 10);
    assert.equal((await ComponentOption.findById(chocolate._id)).inventory.quantity, 10);
    const checkoutKey = randomUUID();
    await prepareCheckout(owner, { checkoutKey, paymentMethod: 'cod', governorate: 'cairo' }, customer.user._id);
    const order = await placeOrder(owner, { checkoutKey, paymentMethod: 'cod', customer: { name: 'Isolated Customer', email: 'customer@example.test', phone: '01012345678', governorate: 'cairo', address: '10 isolated example street Cairo' } }, customer.user._id);
    assert.equal(order.paymentState, 'unpaid');
    assert.equal(order.lines.length, 1);
    assert.equal(order.lines[0].quantity, 2);
    assert.equal(order.lines[0].unitPricePiastres, 15200);
    assert.equal(order.lines[0].lineTotalPiastres, 30400);
    assert.equal(order.totals.subtotalPiastres, 30400);
    assert.equal(order.totals.shippingPiastres, 9000);
    assert.equal(order.totals.totalPiastres, 39400);
    assert.equal((await Product.findById(baseProduct._id)).inventory.quantity, 8);
    assert.equal((await ComponentOption.findById(chocolate._id)).inventory.quantity, 6);
    const snapshot = order.lines[0].customization;
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.selections[0].quantity, 2);
    assert.equal(snapshot.selections[0].unitAdjustmentPiastres, 1600);
    assert.equal(snapshot.selections[0].componentName, chocolate.name);
    const storedBefore = await Order.findById(order.id).lean();
    const componentEdit = await request(`/api/v1/admin/commerce/components/${chocolate._id}`, { method: 'PATCH', body: { pricePiastres: 4000, priceApproved: true } });
    assert.equal(componentEdit.status, 200, JSON.stringify(componentEdit.payload));
    const templateEdit = await request(`/api/v1/admin/commerce/templates/${boxTemplate._id}`, { method: 'PATCH', body: { name: 'Revised future gift box', baseAdjustmentPiastres: 500 } });
    assert.equal(templateEdit.status, 200, JSON.stringify(templateEdit.payload));
    assert.equal(templateEdit.data.revisionCreated, true);
    assert.equal(templateEdit.data.template.version, 2);
    const storedAfter = await Order.findById(order.id).lean();
    assert.equal(JSON.stringify(storedAfter.lines), JSON.stringify(storedBefore.lines));
    assert.deepEqual(storedAfter.totals, storedBefore.totals);
  } finally {
    env.checkoutEnabled = originalCheckout;
  }
});

test('laser cart and checkout use configured flat option prices and retain engraving choices while rejecting stale or unapproved templates', async () => {
  const originalCheckout = env.checkoutEnabled;
  env.checkoutEnabled = true;
  try {
    const engravingTemplate = await template('composed-laser', { kind: 'laser_engraving', engraving: { materials: [{ key: 'wood', label: 'Approved wood', adjustmentPiastres: 300 }], fonts: [{ key: 'classic', label: 'Classic engraving', adjustmentPiastres: 100 }], placements: [{ key: 'front', label: 'Front face', adjustmentPiastres: 200 }], baseAdjustmentPiastres: 1000, maxChars: 40, allowedTextLines: 1, maxCharsPerLine: 40, textRequired: true, artworkAllowed: false } });
    const baseProduct = await product('composed-laser-product', { customization: { enabled: true, serviceEntryEligible: true, serviceKind: 'laser_engraving', templateId: engravingTemplate._id } });
    const owner = `user:${customer.user._id}`;
    const configuration = { templateId: String(engravingTemplate._id), version: engravingTemplate.version, selections: [], fields: { engraving_text: 'For you ❤️', engraving_material: 'wood', engraving_font: 'classic', engraving_placement: 'front' } };
    const cartInput = { productId: String(baseProduct._id), quantity: 1, personalization: {}, customization: configuration };
    await assert.rejects(addCartItem(owner, { ...cartInput, customization: { ...configuration, version: engravingTemplate.version + 1 } }), (error) => error.code === 'CUSTOMIZATION_VERSION_CHANGED');
    const unavailableTemplate = await template('unapproved-laser', { kind: 'laser_engraving', status: 'draft', active: false, engraving: { materials: [{ key: 'wood', label: 'Wood' }], fonts: [{ key: 'classic', label: 'Classic' }] } });
    const unavailableProduct = await product('unapproved-laser-product', { customization: { enabled: true, serviceEntryEligible: true, serviceKind: 'laser_engraving', templateId: unavailableTemplate._id } });
    await assert.rejects(addCartItem(owner, { ...cartInput, productId: String(unavailableProduct._id), customization: { ...configuration, templateId: String(unavailableTemplate._id), version: unavailableTemplate.version } }), (error) => error.code === 'CUSTOMIZATION_UNAVAILABLE');
    assert.equal(await mongoose.models.Cart.countDocuments(), 0);
    await addCartItem(owner, cartInput);
    const checkoutKey = randomUUID();
    await prepareCheckout(owner, { checkoutKey, paymentMethod: 'cod', governorate: 'cairo' }, customer.user._id);
    const order = await placeOrder(owner, { checkoutKey, paymentMethod: 'cod', customer: { name: 'Isolated Customer', email: 'customer@example.test', phone: '01012345678', governorate: 'cairo', address: '10 isolated example street Cairo' } }, customer.user._id);
    assert.equal(order.lines[0].unitPricePiastres, 13600);
    assert.equal(order.totals.subtotalPiastres, 13600);
    assert.equal(order.totals.totalPiastres, 22600);
    const customization = order.lines[0].customization;
    assert.equal(customization.adjustmentPiastres, 1600);
    assert.equal(customization.fields.engraving_text, 'For you ❤️');
    assert.equal(customization.engraving.text, 'For you ❤️');
    assert.equal(customization.engraving.engraving_material.label, 'Approved wood');
    assert.equal(customization.engraving.engraving_font.label, 'Classic engraving');
    assert.equal(customization.engraving.engraving_placement.label, 'Front face');
    assert.equal(customization.engraving.adjustmentPiastres, 1600);
    assert.equal((await Product.findById(baseProduct._id)).inventory.quantity, 9);
    assert.equal(order.paymentState, 'unpaid');
  } finally {
    env.checkoutEnabled = originalCheckout;
  }
});

test('partial component price and stock edits require renewed approvals while retaining catalog classification and merged inventory', async () => {
  const component = await ComponentOption.create({ name: 'Reviewed packaging fixture', slug: 'reviewed-packaging', catalogRole: 'Gift Packaging', categoryId: main._id, subcategoryId: child._id, mainImageKey: 'fixtures/reviewed-packaging.webp', galleryKeys: ['fixtures/reviewed-packaging.webp'], pricePiastres: 500, compareAtPiastres: 800, priceApproved: true, enabledForCustomization: true, configurationApproved: true, reviewRequired: false, merchantReviewNotes: 'Merchant reviewed this isolated packaging fixture.', inventory: { mode: 'tracked', quantity: 10, available: true, approved: true } });
  const path = `/api/v1/admin/commerce/components/${component._id}`;
  const changedPrice = await request(path, { method: 'PATCH', body: { pricePiastres: 600 } });
  assert.equal(changedPrice.status, 200, JSON.stringify(changedPrice.payload));
  assert.equal(changedPrice.data.component.priceApproved, false);
  assert.equal(changedPrice.data.component.configurationApproved, false);
  assert.equal(changedPrice.data.component.inventory.approved, true);
  assert.equal(changedPrice.data.component.catalogRole, 'Gift Packaging');
  assert.equal(changedPrice.data.component.status, 'draft');
  assert.equal(changedPrice.data.component.reviewRequired, false);
  assert.equal(changedPrice.data.component.merchantReviewNotes, component.merchantReviewNotes);
  assert.deepEqual(changedPrice.data.component.galleryKeys, [...component.galleryKeys]);
  assert.equal((await request(path, { method: 'PATCH', body: { priceApproved: true, configurationApproved: true } })).status, 200);
  const changedStock = await request(path, { method: 'PATCH', body: { inventory: { quantity: 7 } } });
  assert.equal(changedStock.status, 200, JSON.stringify(changedStock.payload));
  assert.equal(changedStock.data.component.inventory.mode, 'tracked');
  assert.equal(changedStock.data.component.inventory.quantity, 7);
  assert.equal(changedStock.data.component.inventory.available, true);
  assert.equal(changedStock.data.component.inventory.approved, false);
  assert.equal(changedStock.data.component.configurationApproved, false);
  assert.equal(changedStock.data.component.priceApproved, true);
  const stockApproval = await request(path, { method: 'PATCH', body: { inventory: { approved: true }, configurationApproved: true } });
  assert.equal(stockApproval.status, 200, JSON.stringify(stockApproval.payload));
  assert.equal(stockApproval.data.component.inventory.quantity, 7);
  const made = await request(path, { method: 'PATCH', body: { inventory: { mode: 'made_to_order' } } });
  assert.equal(made.status, 200, JSON.stringify(made.payload));
  assert.equal(made.data.component.inventory.quantity, null);
  assert.equal(made.data.component.inventory.approved, false);
  assert.equal(made.data.component.configurationApproved, false);
  assert.equal((await request(path, { method: 'PATCH', body: { inventory: { approved: true }, configurationApproved: true } })).status, 200);
  const changedCompare = await request(path, { method: 'PATCH', body: { compareAtPiastres: 900 } });
  assert.equal(changedCompare.status, 200, JSON.stringify(changedCompare.payload));
  assert.equal(changedCompare.data.component.priceApproved, false);
  assert.equal(changedCompare.data.component.configurationApproved, false);
  const explicitlyApproved = await request(path, { method: 'PATCH', body: { pricePiastres: 800, compareAtPiastres: 1000, priceApproved: true, configurationApproved: true } });
  assert.equal(explicitlyApproved.status, 200, JSON.stringify(explicitlyApproved.payload));
  assert.equal(explicitlyApproved.data.component.configurationApproved, true);
  assert.equal((await request(path, { method: 'PATCH', body: { inventory: [] } })).status, 400);
});

test('partial shipping-rate changes clear approval unless approval is explicitly renewed', async () => {
  await ShippingConfig.create({ key: 'egypt-v1', cairoGizaPiastres: 9000, otherGovernoratesPiastres: 12000, approved: true });
  const changed = await request('/api/v1/admin/commerce/shipping', { method: 'PATCH', body: { cairoGizaPiastres: 9500 } });
  assert.equal(changed.status, 200, JSON.stringify(changed.payload));
  assert.equal(changed.data.configuration.approved, false);
  assert.equal(changed.data.configuration.otherGovernoratesPiastres, 12000);
  assert.equal((await request('/api/v1/commerce/shipping')).status, 409);
  const approved = await request('/api/v1/admin/commerce/shipping', { method: 'PATCH', body: { otherGovernoratesPiastres: 13000, approved: true } });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));
  assert.equal(approved.data.configuration.approved, true);
  assert.deepEqual((await request('/api/v1/commerce/shipping')).data.rates, { cairoGizaPiastres: 9500, otherGovernoratesPiastres: 13000 });
});
