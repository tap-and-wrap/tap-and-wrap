import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Cart } from '../src/models/Cart.js';
import { cartItemInput, cartLineKind, MAX_GIFT_CONFIGURATION_BYTES } from '../src/commerce/cart-contract.js';
import { identifyGiftBoxConfiguration } from '../src/gift-box/commerce-contract.js';
import { createPricingContext } from '../src/commerce/pricing-context.js';
import { evaluatePromotions } from '../src/commerce/promotions.js';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION } from '../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION } from '../../shared/gift-box/commerce-contract.mjs';

const productId = '507f1f77bcf86cd799439011';
const operationKey = '10000000-0000-4000-8000-000000000001';
const configuration = () => ({ kind: 'gift_box_v2', contractVersion: 'gift-box-commerce-v1',
  catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
  draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION, coordinateSystem: 'normalized-scene',
  selection: { boxId: 'box-2', items: [], ribbonId: 'ribbon-navy', giftCard: null }, placements: [] });
const productLine = () => ({ id: randomUUID(), identity: 'legacy-product-identity', productId, name: 'Fixture product', quantity: 1 });
const giftLine = () => { const canonical = identifyGiftBoxConfiguration(configuration()); return { kind: 'gift_box_v2',
  id: randomUUID(), identity: canonical.configurationId, configurationId: canonical.configurationId,
  configuration: canonical.configuration, name: 'Build Your Gift Box', quantity: 1 }; };
const cart = item => new Cart({ owner: 'guest:fixture', expiresAt: new Date(Date.now() + 100000), items: [item] });

test('strict cart requests preserve historical product inputs and support an explicit product kind', () => {
  for (const value of [{ productId, quantity: 2 }, { kind: 'product', productId, quantity: 2 }]) {
    const parsed = cartItemInput.parse(value);
    assert.equal(parsed.kind, 'product'); assert.equal(parsed.productId, productId);
  }
  assert.equal(cartLineKind({}), 'product');
  for (const kind of [null, '', 'unknown', 'gift-box-v2']) {
    assert.throws(() => cartItemInput.parse({ productId, quantity: 1, kind }));
    assert.throws(() => cartLineKind({ kind }), { code: 'CART_LINE_KIND_INVALID' });
  }
});

test('strict gift add requests require their immutable operation key and reject prices or claimed identity', () => {
  const input = { kind: 'gift_box_v2', operationKey, configuration: configuration(), quantity: 1 };
  assert.equal(cartItemInput.parse(input).configuration.selection.boxId, 'box-2');
  for (const patch of [{ operationKey: undefined }, { operationKey: 'invalid' }, { productId }, { identity: 'forged' },
    { configurationId: 'forged' }, { unitPricePiastres: 1 }, { lineTotalPiastres: 1 }, { fulfillmentPolicy: { approved: true } }, { quantity: 1.5 }, { quantity: 100 }]) {
    assert.throws(() => cartItemInput.parse({ ...input, ...patch }));
  }
  assert.throws(() => cartItemInput.parse({ productId, quantity: 1, configuration: configuration() }));
  const invalid = configuration(); invalid.selection.stock = 100;
  assert.throws(() => cartItemInput.parse({ ...input, configuration: invalid }));
  assert.equal(MAX_GIFT_CONFIGURATION_BYTES, 65536);
});

test('Cart hydrates historical no-kind products and explicit product rows without a migration', async () => {
  for (const kind of [undefined, 'product']) {
    const document = cart({ ...productLine(), ...(kind ? { kind } : {}) });
    await document.validate();
    assert.equal(String(document.items[0].productId), productId);
    assert.equal(cartLineKind(document.items[0]), 'product');
    assert.equal(document.items[0].mainImageUrl, null);
  }
  const missing = productLine(); delete missing.productId;
  await assert.rejects(cart(missing).validate());
});

test('Cart gift discriminator persists canonical configuration without a fabricated Product', async () => {
  const document = cart(giftLine()); await document.validate();
  const line = document.items[0].toObject();
  assert.equal(line.kind, 'gift_box_v2'); assert.equal(line.identity, line.configurationId);
  for (const key of ['productId', 'slug', 'variantKey', 'personalization', 'customization', 'mainImageUrl']) assert.equal(key in line, false);
  assert.deepEqual(line.configuration, identifyGiftBoxConfiguration(configuration()).configuration);
});

test('Cart rejects unknown kinds, cross-kind fields, malformed configuration and forged stored identity', async () => {
  for (const patch of [{ kind: 'unknown' }, { configurationId: 'forged' }, { identity: 'forged' },
    { productId }, { slug: 'fake-product' }, { mainImageUrl: 'https://example.test/fake.webp' }, { variantKey: null },
    { personalization: {} }, { customization: null }, { pricePiastres: 1 }, { configuration: { approved: true } }]) {
    await assert.rejects(cart({ ...giftLine(), ...patch }).validate());
  }
  const noncanonical = giftLine(); noncanonical.configuration = { ...noncanonical.configuration,
    selection: { ribbonId: 'ribbon-navy', boxId: 'box-2', giftCard: null, items: [] } };
  await assert.rejects(cart(noncanonical).validate());
  await assert.rejects(cart({ ...productLine(), configuration: configuration() }).validate());
  await assert.rejects(cart({ ...productLine(), quantity: 1.5 }).validate());
});

test('Product pricing context never queries builder-shaped records and rejects unknown kinds', async () => {
  const context = await createPricingContext([{ kind: 'gift_box_v2', productId: new mongoose.Types.ObjectId(),
    customization: { templateId: new mongoose.Types.ObjectId() } }], 'guest:fixture');
  assert.equal(context.queryCount, 0); assert.equal(context.products.size, 0);
  await assert.rejects(createPricingContext([{ kind: 'unknown' }], 'guest:fixture'), { code: 'CART_LINE_KIND_INVALID' });
});

test('an unchanged persisted stale gift does not trap removal of another cart line', async () => {
  const stale = giftLine(); stale.configuration = { ...stale.configuration, catalogVersion: 'unsupported-historical-version' };
  const ordinary = productLine();
  const document = Cart.hydrate({ _id: new mongoose.Types.ObjectId(), owner: 'guest:fixture',
    expiresAt: new Date(Date.now() + 100000), items: [stale, ordinary] });
  document.items = document.items.filter(item => item.id !== ordinary.id);
  await document.validate();
  assert.equal(document.items.length, 1);
  assert.equal(document.items[0].configuration.catalogVersion, 'unsupported-historical-version');
  // Replacing the stale payload remains a strict configuration editing boundary.
  document.items[0].set('configuration', { ...document.items[0].configuration, catalogVersion: 'another-unsupported-version' });
  await assert.rejects(document.validate());
});

test('a marked nested persisted configuration edit must revalidate the canonical identity', async () => {
  for (const markOnParent of [false, true]) {
    const input = configuration(); input.selection.giftCard = { componentId: 'gift-card-1', message: 'Original private card' };
    const canonical = identifyGiftBoxConfiguration(input);
    const gift = { ...giftLine(), identity: canonical.configurationId, configurationId: canonical.configurationId,
      configuration: structuredClone(canonical.configuration) };
    const document = Cart.hydrate({ _id: new mongoose.Types.ObjectId(), owner: 'guest:fixture',
      expiresAt: new Date(Date.now() + 100000), items: [gift] });
    await document.validate();
    const persisted = document.items[0];
    persisted.configuration.selection.giftCard.message = 'Changed private card';
    if (markOnParent) document.markModified('items.0.configuration.selection.giftCard.message');
    else persisted.markModified('configuration.selection.giftCard.message');
    assert.equal(persisted.isDirectModified('configuration'), false);
    await assert.rejects(document.validate(), error => Boolean(error.errors['items.0.configuration']));
  }
});

const product = { productId, quantity: 2, unitPricePiastres: 1000, lineTotalPiastres: 2000 };
const gift = { kind: 'gift_box_v2', quantity: 1, unitPricePiastres: 10000, lineTotalPiastres: 10000 };
const discount = patch => ({ _id: '507f1f77bcf86cd799439012', code: 'FIXTURE', name: 'Fixture code', active: true,
  kind: 'percentage', value: 5000, minimumSubtotalPiastres: 0, maximumDiscountPiastres: null,
  authenticatedOnly: false, stackWithBundles: true, productIds: [], categoryIds: [], ...patch });

test('mixed merchandise counts every line once but discounts only ordinary Product merchandise', () => {
  const total = evaluatePromotions([product, gift], [], discount());
  assert.deepEqual([total.subtotalPiastres, total.discountPiastres, total.totalPiastres], [12000, 1000, 11000]);
  assert.equal(evaluatePromotions([gift]).totalPiastres, 10000);
  assert.throws(() => evaluatePromotions([gift], [], discount()), { code: 'DISCOUNT_INELIGIBLE' });
  assert.throws(() => evaluatePromotions([product, gift], [], discount({ minimumSubtotalPiastres: 3000 })), { code: 'DISCOUNT_MINIMUM' });
  assert.equal(evaluatePromotions([product, gift], [], discount({ kind: 'fixed', value: 100000 })).totalPiastres, 10000);
});

test('gift rows cannot qualify for bundles even with a misleading Product field', () => {
  const rule = { _id: '507f1f77bcf86cd799439013', name: 'Fixture bundle', active: true, priority: 1,
    maxApplications: 3, items: [{ productId, variantKey: null, quantity: 3 }], discountKind: 'percentage', discountValue: 5000 };
  assert.equal(evaluatePromotions([product, { ...gift, productId }], [rule]).discountPiastres, 0);
  assert.equal(evaluatePromotions([product, { ...product, quantity: 1, lineTotalPiastres: 1000 }], [rule]).discountPiastres, 1500);
  assert.throws(() => evaluatePromotions([{ ...gift, kind: 'unknown' }]), { code: 'CART_LINE_KIND_INVALID' });
});
