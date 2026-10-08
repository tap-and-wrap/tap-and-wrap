import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { isStagingPreviewEnabled } from '../src/catalog/staging-preview.js';
import { newSessionToken, hashSession } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';

describe('authenticated staging draft preview', { concurrency: false }, () => {
  let database, server, baseUrl, product, adminCookie, customerCookie;
  const original = { databaseTarget: env.databaseTarget, stagingPreviewEnabled: env.stagingPreviewEnabled, media: process.env.CATALOG_MEDIA_BASE_URL };
  async function request(path, cookie) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, { headers: cookie ? { Cookie: cookie } : {} });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function sessionFor(role) {
    const user = await User.create({ name: 'Isolated preview fixture', email: `${role}@preview.example.test`, passwordHash: 'isolated-unused-hash', role });
    const token = newSessionToken();
    await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
    return `tw_session=${token}`;
  }
  before(async () => {
    database = await startTestDatabase({ models: [User, Session] });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(async () => {
    env.databaseTarget = 'staging';
    env.stagingPreviewEnabled = true;
    process.env.CATALOG_MEDIA_BASE_URL = '';
    await Promise.all([Product.deleteMany({}), Category.deleteMany({}), User.deleteMany({}), Session.deleteMany({})]);
    const main = await Category.create({ name: 'Preview fixture main', slug: 'preview-main' });
    const child = await Category.create({ name: 'Preview fixture child', slug: 'preview-child', parentId: main._id });
    product = await Product.create({
      externalCatalogId: 'PREVIEW-FIXTURE-001', name: 'Isolated draft product', slug: 'isolated-draft', description: 'Original fixture description.',
      categoryId: main._id, subcategoryId: child._id, status: 'draft', pricePiastres: 1234, priceApproved: false,
      mainImageKey: 'fixtures/selected-02.webp', galleryKeys: ['fixtures/selected-02.webp', 'fixtures/secondary-01.webp'],
      variants: [{ key: 'fixture-small', attributes: [{ name: 'Size', value: 'Small' }], pricePiastres: 2345, priceApproved: false }],
      personalization: { fields: [{ key: 'name', label: 'Fixture name', type: 'short_text', maxLength: 30, required: true }] },
      reviewRequired: true, merchantReviewNotes: 'Private source note',
    });
    [adminCookie, customerCookie] = await Promise.all([sessionFor('admin'), sessionFor('customer')]);
  });
  after(async () => {
    env.databaseTarget = original.databaseTarget;
    env.stagingPreviewEnabled = original.stagingPreviewEnabled;
    if (original.media === undefined) delete process.env.CATALOG_MEDIA_BASE_URL; else process.env.CATALOG_MEDIA_BASE_URL = original.media;
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (database) await database.stop();
  });

  it('requires a real admin session and marks even denied preview responses private and noindex', async () => {
    for (const [cookie, expected] of [[undefined, 401], [customerCookie, 403]]) {
      const response = await request(`/admin/products/${product._id}/preview`, cookie);
      assert.equal(response.status, expected);
      assert.match(response.headers.get('x-robots-tag'), /noindex/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.body.data, undefined);
    }
  });
  it('requires both the explicit preview flag and the dedicated staging target', async () => {
    env.stagingPreviewEnabled = false;
    assert.equal((await request(`/admin/products/${product._id}/preview`, adminCookie)).status, 404);
    env.stagingPreviewEnabled = true;
    env.databaseTarget = 'local';
    assert.equal((await request(`/admin/products/${product._id}/preview`, adminCookie)).status, 404);
    env.databaseTarget = 'staging';
    assert.equal(isStagingPreviewEnabled({ readyState: 1, name: 'tapandwrap_production', host: '127.0.0.1' }), false);
    assert.equal(isStagingPreviewEnabled({ readyState: 1, name: 'other_staging', host: '127.0.0.1' }), false);
    assert.equal(isStagingPreviewEnabled({ readyState: 0, name: 'tapandwrap_staging' }), false);
  });
  it('blocks API mutations and readiness when the connected target no longer passes the write guard', async () => {
    const before = await Product.findById(product._id).lean();
    const sessionCount = await Session.countDocuments({});
    const originalName = mongoose.connection.name;
    // Simulate rejected connection metadata on this same disposable database.
    // No URI, network target or actual database is changed.
    try {
      mongoose.connection.name = 'tapandwrap_production';
      for (const [method, path] of [['PATCH', `/admin/products/${product._id}`], ['POST', '/auth/signup']]) {
        const response = await fetch(`${baseUrl}/api/v1${path}`, { method, headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(response.status, 503);
        const result = await response.json();
        assert.equal(result.error.code, 'DATABASE_NAME_REJECTED');
        assert.equal(result.data, undefined);
      }
      assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503);
    } finally { mongoose.connection.name = originalName; }
    assert.deepEqual(await Product.findById(product._id).lean(), before);
    assert.equal(await Session.countDocuments({}), sessionCount);
  });
  it('shows original draft information and ordered placeholder slots without leaking private references or provisional prices', async () => {
    const before = await Product.findById(product._id).lean();
    const response = await request(`/admin/products/${product._id}/preview`, adminCookie);
    assert.equal(response.status, 200);
    const preview = response.body.data.product;
    assert.equal(preview.name, product.name);
    assert.equal(preview.externalCatalogId, product.externalCatalogId);
    assert.equal(preview.status, 'draft');
    assert.equal(preview.category.slug, 'preview-main');
    assert.equal(preview.subcategory.slug, 'preview-child');
    assert.deepEqual(preview.gallerySlots, [{ position: 1, url: null, isMain: true }, { position: 2, url: null, isMain: false }]);
    assert.equal(preview.pricePiastres, null);
    assert.equal(preview.compareAtPiastres, null);
    assert.equal(preview.variants[0].pricePiastres, null);
    assert.equal(preview.priceApproved, false);
    assert.equal(preview.inventory.quantity, 10);
    assert.equal(preview.inventory.approved, false);
    assert.equal(preview.orderingAvailable, false);
    assert.equal(preview.variants[0].orderingAvailable, false);
    assert.deepEqual(preview.relatedProducts, []);
    for (const field of ['mainImageKey', 'galleryKeys', 'merchantReviewNotes', 'catalogSource', 'importSource', 'passwordHash', 'email']) assert.equal(field in preview, false, field);
    assert.equal(JSON.stringify(preview).includes('fixtures/selected-02.webp'), false);
    assert.deepEqual(await Product.findById(product._id).lean(), before, 'preview is read-only');
    assert.match(response.headers.get('vary'), /Cookie/i);
  });
  it('preserves selected main-image order when approved public media mapping is configured', async () => {
    process.env.CATALOG_MEDIA_BASE_URL = 'https://media.example.test/catalog';
    const response = await request(`/admin/products/${product._id}/preview`, adminCookie);
    const preview = response.body.data.product;
    assert.deepEqual(preview.gallerySlots.map((slot) => slot.url), ['https://media.example.test/catalog/fixtures/selected-02.webp', 'https://media.example.test/catalog/fixtures/secondary-01.webp']);
    assert.equal(preview.mainImageUrl, preview.gallerySlots[0].url);
    assert.equal(preview.gallerySlots[0].isMain, true);
  });
  it('does not turn admin preview into a public draft-preview endpoint or change public category counts', async () => {
    assert.equal((await request('/public/products/isolated-draft')).status, 404);
    assert.equal((await request(`/public/products/${product._id}/preview`)).status, 404);
    const publicList = await request('/public/products?limit=100');
    assert.deepEqual(publicList.body.data.products, []);
    assert.equal(publicList.body.data.pagination.limit, 20);
    const adminList = await request('/admin/products?status=draft&limit=100&category=preview-main&subcategory=preview-child', adminCookie);
    assert.equal(adminList.body.data.pagination.limit, 20);
    assert.equal(adminList.body.data.pagination.total, 1);
    const categories = await request('/public/categories?parent=preview-main');
    assert.equal(categories.body.data.categories[0].slug, 'preview-child');
    assert.equal(categories.body.data.categories[0].productCount, 0);
    assert.equal(mongoose.connection.name, 'tap_wrap_catalog_test');
  });
});
