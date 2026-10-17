import test from 'node:test';
import assert from 'node:assert/strict';
import { Product } from '../src/models/Product.js';
import { createProductSchema, updateProductSchema } from '../src/catalog/validation.js';
import { displayProductFilter, publicProductFilter } from '../src/catalog/product-policy.js';
import { productCanOrder, publicProductDetail } from '../src/catalog/public-presentation.js';
import { displayReviewDigest, planDisplayTransition } from '../src/catalog/display-transition.js';
import { productHref } from '../../shared/product-paths.mjs';
import { productMetadata } from '../../client/src/seo/metadata.js';

const main = { _id: '111111111111111111111111', name: 'Fixture', slug: 'fixture', active: true, parentId: null };
const product = (patch = {}) => ({ _id: '222222222222222222222222', name: 'Fixture gift', slug: 'fixture-gift-123', publicPath: '/products/permanent-gift', visibility: 'public', status: 'ready', published: true, reviewRequired: false,
  categoryId: main, mainImageKey: 'fixture/gift.webp', galleryKeys: ['fixture/gift.webp'], pricePiastres: 12345, priceApproved: true,
  inventory: { approved: true, available: true, mode: 'tracked', quantity: 2 }, variants: [], ...patch });

test('display permission and purchase gates are separate and have no launch configuration dependency', () => {
  assert.deepEqual(displayProductFilter(), { visibility: 'public', status: { $in: ['draft', 'ready', 'hold'] } });
  assert.equal(publicProductFilter().visibility, 'public');
  assert.equal(publicProductFilter().priceApproved, true);
  assert.equal(publicProductFilter()['inventory.approved'], true);
  for (const patch of [{ visibility: 'hidden' }, { visibility: 'withdrawn' }, { visibility: undefined }, { status: 'draft' }, { status: 'hold' }, { reviewRequired: true }, { priceApproved: false }, { pricePiastres: 0 }, { inventory: { approved: false, available: true, mode: 'tracked', quantity: 10 } }]) {
    assert.equal(productCanOrder(product(patch)), false, JSON.stringify(patch));
  }
  assert.equal(productCanOrder(product()), true);
});

test('confirmed positive prices display independently of stock, review or Ready status', () => {
  for (const status of ['draft', 'hold', 'ready']) {
    const detail = publicProductDetail(product({ status, reviewRequired: true, inventory: { approved: false, available: true, mode: 'tracked', quantity: 10 } }));
    assert.equal(detail.pricePiastres, 12345); assert.equal(detail.priceApproved, true);
    assert.equal(detail.orderingAvailable, false); assert.equal(detail.inventory.quantity, null);
    assert.equal(productMetadata(detail, 'https://fixture.example', { checkoutEnabled: true }).structuredData.length, 0);
    assert.equal(productHref(detail), '/products/permanent-gift');
    assert.equal(detail.slug, 'fixture-gift-123');
  }
  for (const patch of [{ priceApproved: false }, { pricePiastres: 0 }, { pricePiastres: null }]) {
    const detail = publicProductDetail(product(patch));
    assert.equal(detail.pricePiastres, null); assert.equal(detail.compareAtPiastres, null); assert.equal(detail.orderingAvailable, false);
  }
});

test('zero stock, unavailable and Made by Request remain honest independent states', () => {
  for (const inventory of [{ approved: true, available: true, mode: 'tracked', quantity: 0 }, { approved: true, available: false, mode: 'made_to_order', quantity: null }]) {
    assert.equal(publicProductDetail(product({ inventory })).orderingAvailable, false);
  }
  const made = publicProductDetail(product({ inventory: { approved: true, available: true, mode: 'made_to_order', quantity: null } }));
  assert.equal(made.orderingAvailable, true); assert.equal(made.inventory.quantity, null);
});

test('variants disclose only confirmed prices and enforce selected availability with parent controls', () => {
  const variants = [0, 2].map((quantity, index) => ({ key: `v-${index}`, attributes: [], pricePiastres: null, priceApproved: false, inventory: { approved: true, available: true, mode: 'tracked', quantity } }));
  const detail = publicProductDetail(product({ variants }));
  assert.equal(detail.orderingAvailable, true);
  assert.deepEqual(detail.variants.map(v => v.orderingAvailable), [false, true]);
  assert.deepEqual(detail.variants.map(v => v.pricePiastres), [12345, 12345]);
  assert.equal(publicProductDetail(product({ variants, inventory: { approved: true, available: false } })).variants[1].orderingAvailable, false);
  const unapproved = publicProductDetail(product({ variants: [{ ...variants[1], pricePiastres: 999999, priceApproved: false }] }));
  assert.equal(unapproved.orderingAvailable, false); assert.equal(unapproved.variants[0].pricePiastres, null);
});

test('new model records default hidden, strict admin contracts accept only explicit valid display dispositions', async () => {
  const input = product({ categoryId: main._id });
  delete input._id; delete input.publicPath; delete input.visibility;
  const document = new Product(input);
  await document.validate();
  assert.equal(document.visibility, 'hidden');
  assert.equal(document.inventory.quantity, 2);
  assert.equal(createProductSchema.safeParse({ name: 'Gift', slug: 'gift', categoryId: main._id, visibility: 'public' }).success, true);
  assert.equal(updateProductSchema.safeParse({ visibility: 'public' }).success, false);
  assert.equal(updateProductSchema.safeParse({ visibility: 'anything', expectedRevision: 0 }).success, false);
});

test('offline grouped transition emits visibility-only revision-guarded proposals and rejects drift or omissions', () => {
  const products = [product({ categoryId: main._id, revision: 4, status: 'draft', priceApproved: false, inventory: { quantity: 10, approved: false } })];
  const categories = [main];
  const review = { version: 1, source: 'merchant-reviewed-product-display', snapshotHash: displayReviewDigest(products, categories), groups: [{ productIds: [products[0]._id], visibility: 'public' }] };
  const before = JSON.stringify(products);
  const plan = planDisplayTransition(products, categories, review);
  assert.deepEqual(plan.changes, [{ id: products[0]._id, patch: { expectedRevision: 4, visibility: 'public' } }]);
  assert.equal(JSON.stringify(products), before);
  assert.throws(() => planDisplayTransition([{ ...products[0], revision: 5 }], categories, review));
  assert.throws(() => planDisplayTransition(products, categories, { ...review, groups: [] }));
  assert.throws(() => planDisplayTransition(products, categories, { ...review, groups: [...review.groups, ...review.groups] }));
  const inactive = [{ ...main, active: false }];
  assert.throws(() => planDisplayTransition(products, inactive, { ...review, snapshotHash: displayReviewDigest(products, inactive) }));
});
