import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { Product } from '../src/models/Product.js';
import { ProductAddress } from '../src/models/ProductAddress.js';
import { Category } from '../src/models/Category.js';
import { Cart } from '../src/models/Cart.js';
import { cartResponse } from '../src/commerce/cart.js';
import { env } from '../src/config/env.js';
import { createProduct, updateProduct, getPublicProduct, listProducts } from '../src/catalog/service.js';
import { planProductAddresses } from '../../shared/product-paths.mjs';
import { aliasReview, applyAliasReview, readAliasIdentities, runProductAliases } from '../scripts/product-aliases.js';
import { startTestDatabase } from './helpers/database.js';

let database, root;
const actor = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'admin', active: true };
const create = input => createProduct(input, { actor });
const configuration = { nodeEnv: 'test', databaseTarget: 'local' };
before(async () => {
  database = await startTestDatabase({ models: [Product, Category, ProductAddress], transactions: true });
  await ProductAddress.createCollection(); await ProductAddress.createIndexes();
});
after(async () => { env.productAliasesEnabled = false; env.catalogBrowsePreviewEnabled = false; await database?.stop(); });
beforeEach(async () => {
  await ProductAddress.deleteMany({}); await Product.deleteMany({}); await Category.deleteMany({}); await Cart.deleteMany({});
  env.productAliasesEnabled = true; env.catalogBrowsePreviewEnabled = true;
  root = await Category.create({ name: 'Synthetic root', slug: 'synthetic-root' });
});
const draft = (slug, extra = {}) => ({ name: 'Baby Footprint Keepsake Gift Box', slug, categoryId: root._id, visibility: 'public', status: 'draft', ...extra });

test('reviewed backfill reserves legacy and canonical URLs without changing product records', async () => {
  const product = await Product.create(draft('baby-footprint-keepsake-gift-box-b6-box-095', { externalCatalogId: 'B6-BOX-095' }));
  const before = await Product.find({}).lean();
  const current = await readAliasIdentities(Product, ProductAddress);
  const review = aliasReview(current.products, current.addresses, Product.db.name);
  const report = await applyAliasReview(review, { Product, ProductAddress, configuration, writersStopped: true });
  assert.equal(report.status, 'verified'); assert.ok(report.journal.every(batch => batch.status === 'committed'));
  assert.deepEqual(await Product.find({}).lean(), before);
  for (const address of ['baby-footprint-keepsake-gift-box', product.slug]) {
    const result = await getPublicProduct(address);
    assert.equal(result._id, String(product._id)); assert.equal(result.slug, product.slug);
    assert.equal(result.publicPath, '/products/baby-footprint-keepsake-gift-box');
    assert.equal(result.pricePiastres, null); assert.equal(result.orderingAvailable, false);
  }
  const second = await readAliasIdentities(Product, ProductAddress);
  await applyAliasReview(aliasReview(second.products, second.addresses, Product.db.name), { Product, ProductAddress, configuration, writersStopped: true });
  assert.equal(await ProductAddress.countDocuments({}), 2);
});

test('planner reserves all legacy names first and never reallocates existing canonical names', () => {
  const first = { _id: '1', name: 'Same Gift', slug: 'same-gift-source-1', externalCatalogId: 'SOURCE-1' };
  const second = { _id: '2', name: 'Same Gift', slug: 'same-gift', externalCatalogId: 'SOURCE-2' };
  const planned = planProductAddresses([first, second]);
  assert.equal(planned.entries[0].canonicalSlug, 'same-gift-source-1');
  assert.equal(planned.entries[1].canonicalSlug, 'same-gift');
  const stable = planProductAddresses([first, second], [{ slug: 'already-reserved', productId: '1', canonical: true }]);
  assert.equal(stable.entries[0].canonicalSlug, 'already-reserved');
  assert.throws(() => planProductAddresses([first, second], [{ slug: 'same-gift', productId: '1', canonical: true }]), /reserved/);
  const unicode = planProductAddresses([{ _id: '3', name: 'هدية', slug: 'existing-manual-gift' }]);
  assert.equal(unicode.entries[0].canonicalSlug, 'product-3');
});

test('concurrent new products receive unique stable addresses and renames preserve every link', async () => {
  const roots = [root, ...await Category.create([{ name: 'Root two', slug: 'root-two' }, { name: 'Root three', slug: 'root-three' }])];
  const created = await Promise.all([1, 2, 3].map(index => create(draft(`legacy-gift-${index}`, { externalCatalogId: `SOURCE-${index}`, categoryId: roots[index - 1]._id }))));
  const addresses = await ProductAddress.find({ canonical: true }).lean();
  assert.equal(addresses.length, 3); assert.equal(new Set(addresses.map(a => a.slug)).size, 3);
  assert.equal(addresses.filter(a => a.slug === 'baby-footprint-keepsake-gift-box').length, 1);
  await assert.rejects(ProductAddress.create({ productId: created[0]._id, slug: 'second-canonical', canonical: true }), { code: 11000 });
  const first = created[0];
  const original = await getPublicProduct(first.slug);
  await updateProduct(first._id, { name: 'Renamed Forever', slug: 'new-stored-address', expectedRevision: first.revision }, { actor });
  assert.equal((await getPublicProduct(first.slug)).publicPath, original.publicPath);
  assert.equal((await getPublicProduct('new-stored-address')).publicPath, original.publicPath);
  assert.equal((await getPublicProduct(original.publicPath.split('/').at(-1)))._id, String(first._id));
});

test('address conflicts roll back product creation and stale/deleted owners are never reassigned', async () => {
  const first = await create(draft('legacy-first'));
  const canonical = (await getPublicProduct(first.slug)).publicPath.split('/').at(-1);
  await assert.rejects(create(draft(canonical, { name: 'Different Name' })), { code: 'PRODUCT_ADDRESS_RESERVED' });
  assert.equal(await Product.countDocuments({}), 1);
  await Product.deleteOne({ _id: first._id });
  await assert.rejects(getPublicProduct(canonical), { status: 404 });
  await Product.create(draft(canonical, { name: 'Bypass writer' }));
  await assert.rejects(getPublicProduct(canonical), { code: 'PRODUCT_ADDRESS_CONFLICT' });
  await ProductAddress.collection.insertOne({ slug: 'corrupt-address', productId: { $ne: null }, canonical: false });
  await assert.rejects(getPublicProduct('corrupt-address'), { code: 'PRODUCT_ADDRESS_CONFLICT' });
});

test('visibility gates and registered ownership survive disabling new canonical allocation', async () => {
  const product = await create(draft('legacy-draft'));
  await updateProduct(product._id, { visibility: 'hidden', expectedRevision: product.revision }, { actor });
  await assert.rejects(getPublicProduct('baby-footprint-keepsake-gift-box'), { status: 404 });
  await updateProduct(product._id, { visibility: 'public', expectedRevision: product.revision + 1 }, { actor });
  env.productAliasesEnabled = false;
  assert.equal((await getPublicProduct(product.slug))._id, String(product._id));
  assert.equal((await getPublicProduct('baby-footprint-keepsake-gift-box'))._id, String(product._id));
  await assert.rejects(create(draft('baby-footprint-keepsake-gift-box', { name: 'Attempted reassignment with flag off' })), { code: 'PRODUCT_ADDRESS_RESERVED' });
  const renamed = await updateProduct(product._id, { expectedRevision: product.revision + 2, slug: 'renamed-while-allocation-off' }, { actor });
  assert.equal((await getPublicProduct(renamed.slug)).publicPath, '/products/baby-footprint-keepsake-gift-box');
  const unregistered = await create(draft('unregistered-legacy', { name: 'Unregistered legacy' }));
  assert.equal(await ProductAddress.countDocuments({ productId: unregistered._id }), 0);
});

test('public listing batches canonical reads and indexed resolver never scans product identities', async context => {
  const product = await create(draft('legacy-indexed'));
  const find = Product.find.bind(Product);
  const observed = context.mock.method(Product, 'find', (...args) => find(...args));
  const listing = await listProducts({ limit: 20, includePriceRange: false });
  assert.equal(listing.products[0].publicPath, '/products/baby-footprint-keepsake-gift-box');
  await getPublicProduct(product.slug);
  assert.ok(observed.mock.calls.every(call => Object.keys(call.arguments[0]).length > 0));
  const explain = await ProductAddress.findOne({ slug: product.slug }).explain('queryPlanner');
  assert.match(JSON.stringify(explain.queryPlanner.winningPlan), /product_address_unique/);
});

test('cart link presentation uses canonical addresses without changing snapshots, totals or retention', async () => {
  const product = await create(draft('legacy-cart-product'));
  const cart = await Cart.create({ owner: `guest:${'c'.repeat(64)}`, expiresAt: new Date(Date.now() + 60000),
    items: [{ id: 'fixture-line', identity: 'fixture-identity', productId: product._id, name: product.name, slug: product.slug, quantity: 1 }] });
  const before = await Cart.findById(cart._id).lean();
  const response = await cartResponse(cart.owner);
  assert.equal(response.cart.items[0].publicPath, '/products/baby-footprint-keepsake-gift-box');
  assert.equal(response.cart.items[0].slug, product.slug);
  assert.equal(response.cart.items[0].valid, false);
  assert.equal(response.cart.subtotalPiastres, 0);
  assert.deepEqual(await Cart.findById(cart._id).lean(), before);
});

test('stale or edited backfill reviews fail before writes; offline CLI refuses implicit database access', async () => {
  await Product.create(draft('legacy-review'));
  const { products, addresses } = await readAliasIdentities(Product, ProductAddress);
  const review = aliasReview(products, addresses, Product.db.name);
  review.entries[0].canonicalSlug = 'altered';
  await assert.rejects(applyAliasReview(review, { Product, ProductAddress, configuration, writersStopped: true }), /altered/);
  assert.equal(await ProductAddress.countDocuments({}), 0);
  await assert.rejects(runProductAliases(['--apply', '--target', 'production']), /authorization/);
  await assert.rejects(runProductAliases(['--dry-run', '--target', 'production']), /Offline/);
});
