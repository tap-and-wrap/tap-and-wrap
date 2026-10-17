import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { planVisibility, digest, main, parseArguments, operatorSettings, applyVisibility, rollbackVisibility } from '../scripts/restore-inherited-visibility.js';
import { startTestDatabase } from './helpers/database.js';
import { listProducts, getPublicProduct, updateProduct } from '../src/catalog/service.js';
import { Product } from '../src/models/Product.js';
import { ProductAddress } from '../src/models/ProductAddress.js';
import { Category } from '../src/models/Category.js';
import { env } from '../src/config/env.js';
import { loadEligibleProduct } from '../src/commerce/pricing.js';

function fixture() {
  const root = { _id: new mongoose.Types.ObjectId(), name: 'Synthetic gifts', slug: 'synthetic-gifts', active: true, parentId: null };
  const products = Array.from({ length: 1595 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(), name: `Synthetic gift ${index}`, slug: `legacy-gift-${index}`, categoryId: root._id,
    status: index < 1257 ? 'draft' : 'hold', reviewRequired: index >= 1257, published: false,
    priceApproved: false, pricePiastres: null, inventory: { mode: 'tracked', quantity: 10, available: true, approved: false },
    mainImageKey: 'fixtures/gift.webp', galleryKeys: ['fixtures/gift.webp'], variants: [], __v: 0,
  }));
  return { products, categories: [root], addresses: products.flatMap((p, i) => [{ _id: new mongoose.Types.ObjectId(), productId: p._id, slug: p.slug, canonical: false }, { _id: new mongoose.Types.ObjectId(), productId: p._id, slug: `permanent-gift-${i}`, canonical: true }]) };
}
const plan = f => planVisibility(f.products, f.categories, f.addresses);
const settings = { databaseTarget: 'local', nodeEnv: 'test' };
let db;
before(async () => { db = await startTestDatabase({ models: [Product, ProductAddress, Category], transactions: true }); });
after(async () => { await db?.stop(); });

test('offline default never connects; production context and apply require explicit independent safeguards', async () => {
  assert.deepEqual(await main([]), { mode: 'offline-dry-run', connected: false, writes: false, requiredProducts: 1595, update: { visibility: 'public' } });
  for (const args of [['--apply'], ['--apply', '--plan', 'x'], ['--inspect'], ['--apply', '--rollback'], ['--unexpected']]) assert.throws(() => parseArguments(args));
  assert.throws(() => operatorSettings({}), /PRODUCTION_CONTEXT_REJECTED/);
  const config = { NODE_ENV: 'production', DATABASE_TARGET: 'production', PRODUCTION_DATABASE_AUTHORIZED: 'true', PRODUCTION_DATABASE_HOST: 'taw-production.oialf4z.mongodb.net', CHECKOUT_ENABLED: 'false', COMMERCE_LAUNCH_AUTHORIZED: 'false', MONGODB_URI: 'mongodb+srv://synthetic:fixture@taw-production.oialf4z.mongodb.net/tapandwrap_production' };
  assert.equal(operatorSettings(config).databaseTarget, 'production');
  for (const change of [{ CHECKOUT_ENABLED: 'true' }, { COMMERCE_LAUNCH_AUTHORIZED: 'true' }, { PRODUCTION_DATABASE_HOST: 'wrong.example' }, { PRODUCTION_DATABASE_AUTHORIZED: 'false' }, { DATABASE_TARGET: 'staging' }]) assert.throws(() => operatorSettings({ ...config, ...change }));
});
test('full 1595/3190 synthetic dry-run validates references without mutating any field', () => {
  const f = fixture(), before = digest(f), p = plan(f);
  assert.equal(p.entries.length, 1595); assert.equal(digest(f), before);
  console.log(JSON.stringify({ syntheticDryRun: { total: 1595, draft: 1257, hold: 338, reservations: 3190, modified: 0 } }));
});
test('preflight rejects drift, hidden/withdrawn records, invalid images, categories, stolen aliases and approvals', () => {
  const edits = [f => f.products.pop(), f => f.addresses.pop(), f => { f.products[0].visibility = 'hidden'; }, f => { f.products[0].visibility = 'withdrawn'; }, f => { f.products[0].inventory.quantity = 9; }, f => { f.products[0].inventory.approved = true; }, f => { f.products[0].priceApproved = true; }, f => { f.products[0].reviewRequired = true; }, f => { f.categories[0].active = false; }, f => { f.products[0].subcategoryId = new mongoose.Types.ObjectId(); }, f => { f.products[0].mainImageKey = '../unsafe.png'; }, f => { f.addresses[0].productId = f.products[1]._id; }, f => { f.addresses[1].canonical = false; }];
  for (const edit of edits) { const f = fixture(); edit(f); assert.throws(() => plan(f)); }
});
test('transactional apply changes visibility only; full catalog browses, canonical links persist, unapproved prices cannot order; rollback skips merchant edits', async () => {
  const f = fixture(), p = plan(f), c = mongoose.connection;
  await c.collection('categories').insertMany(f.categories); await c.collection('products').insertMany(f.products); await c.collection('productaddresses').insertMany(f.addresses);
  assert.equal((await listProducts({})).pagination.total, 0);
  assert.deepEqual(await applyVisibility(c, settings, p), { matched: 1595, modified: 1595 });
  assert.deepEqual(await applyVisibility(c, settings, p), { matched: 1595, modified: 0 });
  const all = await c.collection('products').find({}).toArray();
  for (const product of all) { assert.equal(product.visibility, 'public'); const { visibility: _visibility, ...rest } = product; assert.equal(digest(rest), p.entries.find(e => e.id === String(product._id)).before); }
  for (const checkout of [false, true]) {
    env.checkoutEnabled = checkout;
    assert.equal((await listProducts({})).pagination.total, 1595);
    assert.equal((await listProducts({ category: 'synthetic-gifts' })).pagination.total, 1595);
    assert.equal((await listProducts({ sort: 'newest', limit: 8 })).products.length, 8);
    for (const index of [0, 1594]) {
      const detail = await getPublicProduct(f.products[index].slug);
      assert.equal(detail.publicPath, `/products/permanent-gift-${index}`); assert.equal(detail.pricePiastres, null); assert.equal(detail.orderingAvailable, false); assert.equal(detail.inventory.quantity, null);
      await assert.rejects(loadEligibleProduct(f.products[index]._id), { code: 'PRODUCT_UNAVAILABLE' });
    }
  }
  env.checkoutEnabled = false;
  // Normal owner edits remain available, with loaded revision and no inferred approval.
  const actor = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'admin', active: true };
  await updateProduct(f.products[0]._id, { expectedRevision: 0, name: 'Merchant edited gift' }, { actor });
  assert.equal((await getPublicProduct(f.products[0].slug)).name, 'Merchant edited gift');
  assert.deepEqual(await rollbackVisibility(c, settings, p), { reverted: 1594, skipped: 1 });
  assert.deepEqual(await rollbackVisibility(c, settings, p), { reverted: 0, skipped: 1595 });
  assert.equal((await c.collection('products').findOne({ _id: f.products[0]._id })).visibility, 'public');
  assert.equal((await listProducts({})).pagination.total, 1);
});
test('reviewed preflight mismatch aborts before updating any document', async () => {
  const c = mongoose.connection;
  await c.collection('products').deleteMany({}); await c.collection('categories').deleteMany({}); await c.collection('productaddresses').deleteMany({});
  const f = fixture(), p = plan(f);
  await c.collection('categories').insertMany(f.categories); await c.collection('products').insertMany(f.products); await c.collection('productaddresses').insertMany(f.addresses);
  await c.collection('products').updateOne({ _id: f.products[0]._id }, { $set: { priceApproved: true } });
  await assert.rejects(applyVisibility(c, settings, p));
  assert.equal(await c.collection('products').countDocuments({ visibility: { $exists: true } }), 0);
});

test('concurrent operators cannot partially publish or silently replay a failed transaction', async () => {
  const c = mongoose.connection;
  await c.collection('products').deleteMany({}); await c.collection('categories').deleteMany({}); await c.collection('productaddresses').deleteMany({});
  const f = fixture(), p = plan(f);
  await c.collection('categories').insertMany(f.categories); await c.collection('products').insertMany(f.products); await c.collection('productaddresses').insertMany(f.addresses);
  const results = await Promise.allSettled([applyVisibility(c, settings, p), applyVisibility(c, settings, p)]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.modified === 1595).length, 1);
  assert.equal(await c.collection('products').countDocuments({ visibility: 'public' }), 1595);
  const unchanged = await c.collection('products').find({}).toArray();
  assert.ok(unchanged.every(product => p.entries.find(e => e.id === String(product._id)).after === digest(product)));
});
