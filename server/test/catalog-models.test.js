import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { getPublicationIssues, getStockDeduction, publicProductFilter } from '../src/catalog/product-policy.js';
import { startTestDatabase } from './helpers/database.js';

const mainImage = 'catalog/test-product/selected-main.webp';
let sequence = 0;

function productData(overrides = {}) {
  sequence += 1;
  return {
    name: `Catalog test product ${sequence}`,
    slug: `catalog-test-product-${sequence}`,
    description: 'Description supplied for a test fixture.',
    categoryId: new mongoose.Types.ObjectId(),
    mainImageKey: mainImage,
    galleryKeys: [mainImage, 'catalog/test-product/detail.webp'],
    ...overrides,
  };
}

function approvedData(overrides = {}) {
  const defaults = new Product(productData());
  return productData({
    pricePiastres: 12500,
    priceApproved: true,
    inventory: { mode: defaults.inventory.mode, quantity: 10, approved: true, available: true },
    status: 'ready',
    ...overrides,
  });
}

async function rejectsValidation(overrides) {
  await assert.rejects(new Product(productData(overrides)).validate());
}

describe('catalog model validation', () => {
  it('starts a product as a draft with unapproved price and ten provisional stock units', async () => {
    const product = new Product(productData());
    await product.validate();
    assert.equal(product.status, 'draft');
    assert.equal(product.published, false);
    assert.equal(product.pricePiastres, null);
    assert.equal(product.priceApproved, false);
    assert.equal(product.inventory.quantity, 10);
    assert.equal(product.inventory.approved, false);
  });

  it('requires name, unique-slug value and main category', async () => {
    await rejectsValidation({ name: '' });
    await rejectsValidation({ slug: '' });
    await rejectsValidation({ categoryId: null });
    await rejectsValidation({ slug: 'unsafe slug/with spaces' });
  });

  it('accepts integer piastres and rejects fractional, negative and unsafe amounts', async () => {
    const product = new Product(productData({ pricePiastres: 1, compareAtPiastres: 2 }));
    await product.validate();
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await rejectsValidation({ pricePiastres: value });
      await rejectsValidation({ compareAtPiastres: value });
    }
  });

  it('rejects negative, fractional and unsafe inventory quantities', async () => {
    const mode = new Product(productData()).inventory.mode;
    for (const quantity of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await rejectsValidation({ inventory: { mode, quantity } });
    }
  });

  it('retains a made-by-request mode without stock quantity or stock deduction', async () => {
    const inventory = { mode: 'made_to_order', quantity: null, available: true, approved: false };
    const product = new Product(productData({ inventory }));
    await product.validate();
    assert.equal(product.inventory.mode, 'made_to_order');
    assert.equal(product.inventory.quantity, null);
    assert.equal(getStockDeduction(product.inventory, 3), 0);
  });

  it('deducts only the requested quantity for tracked stock', async () => {
    const product = new Product(productData());
    await product.validate();
    assert.equal(getStockDeduction(product.inventory, 3), 3);
    // The policy is a calculation; order and inventory persistence remain untouched.
    assert.equal(product.inventory.quantity, 10);
  });

  it('rejects invalid quantities, insufficient tracked stock and unavailable stock', () => {
    const inventory = new Product(productData()).inventory;
    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => getStockDeduction(inventory, quantity));
    }
    assert.throws(() => getStockDeduction(inventory, 11));
    assert.throws(() => getStockDeduction({ mode: 'made_to_order', quantity: null, available: false }, 1));
  });

  it('requires selected main image to be the first preserved gallery reference', async () => {
    await rejectsValidation({ galleryKeys: ['catalog/test-product/detail.webp', mainImage] });
    await rejectsValidation({ galleryKeys: ['catalog/test-product/detail.webp'] });
    const product = new Product(productData());
    await product.validate();
    assert.equal(product.galleryKeys[0], product.mainImageKey);
  });

  it('rejects traversal references and galleries larger than the audited 23-image limit', async () => {
    await rejectsValidation({ mainImageKey: '../secrets.png', galleryKeys: ['../secrets.png'] });
    await rejectsValidation({ mainImageKey: '/absolute/image.png', galleryKeys: ['/absolute/image.png'] });
    await rejectsValidation({ galleryKeys: [mainImage, ...Array.from({ length: 23 }, (_, i) => `catalog/image-${i}.webp`)] });
  });

  it('requires price and stock approval before Ready publication', async () => {
    await rejectsValidation({ status: 'ready' });
    const withoutPrice = new Product(approvedData({ priceApproved: false }));
    await assert.rejects(withoutPrice.validate());
    const withoutStock = new Product(approvedData({ inventory: { mode: new Product(productData()).inventory.mode, quantity: 10, available: true, approved: false } }));
    await assert.rejects(withoutStock.validate());
    const product = new Product(approvedData());
    await product.validate();
    assert.equal(product.published, true);
    assert.deepEqual(getPublicationIssues(product), []);
  });

  it('keeps unresolved review items from becoming Ready', async () => {
    const product = new Product(approvedData({ reviewRequired: true, reviewReasons: ['Catalog role needs review.'] }));
    await assert.rejects(product.validate());
    assert.ok(getPublicationIssues(product).length > 0);
  });

  it('records typed required personalization fields and rejects duplicate field keys', async () => {
    const fields = [
      { key: 'recipient_name', label: 'Recipient name', type: 'short_text', required: true, maxLength: 80 },
      { key: 'photo', label: 'Photo', type: 'image', required: true, minFiles: 1, maxFiles: 2 },
      { key: 'color', label: 'Color', type: 'select', required: true, choices: ['Rose', 'White'] },
    ];
    const product = new Product(productData({ personalization: { fields } }));
    await product.validate();
    assert.equal(product.personalization.fields[0].required, true);
    assert.equal(product.personalization.fields[1].type, 'image');
    await rejectsValidation({ personalization: { fields: [fields[0], fields[0]] } });
    await rejectsValidation({ personalization: { fields: [{ key: 'name', label: 'Name', type: 'unknown', required: true }] } });
  });

  it('requires a template reference when Customize This is enabled', async () => {
    await rejectsValidation({ customization: { enabled: true } });
    const templateId = new mongoose.Types.ObjectId();
    const product = new Product(productData({ customization: { enabled: true, serviceKind: 'generic', templateId } }));
    await product.validate();
    assert.equal(String(product.customization.templateId), String(templateId));
  });

  it('rejects duplicate variant keys and requires variant price approval for publication', async () => {
    const variant = {
      key: 'size_small',
      attributes: [{ name: 'Size', value: 'Small' }],
      pricePiastres: 15000,
      priceApproved: true,
      inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
    };
    await rejectsValidation({ variants: [variant, variant] });
    const product = new Product(approvedData({ variants: [variant] }));
    await product.validate();
    product.variants[0].priceApproved = false;
    await assert.rejects(product.validate());
    assert.ok(getPublicationIssues(product).length > 0);
  });

  it('keeps component roles in the separate component collection', async () => {
    await rejectsValidation({ catalogRole: 'Customization Option' });
    await rejectsValidation({ catalogRole: 'Gift Packaging' });
    const component = new ComponentOption({
      externalCatalogId: 'TEST-COMPONENT-001',
      name: 'Test customization component',
      slug: 'test-customization-component',
      description: 'Component fixture.',
      categoryId: new mongoose.Types.ObjectId(),
      catalogRole: 'Customization Option',
      mainImageKey: mainImage,
      galleryKeys: [mainImage],
    });
    await component.validate();
    assert.notEqual(ComponentOption.collection.name, Product.collection.name);
    assert.equal(component.status, 'draft');
    component.status = 'ready';
    await assert.rejects(component.validate());
  });

  it('rejects a category which names itself as parent', async () => {
    const id = new mongoose.Types.ObjectId();
    const category = new Category({ _id: id, name: 'Self parent', slug: 'self-parent', parentId: id });
    await assert.rejects(category.validate());
  });
});

describe('catalog uniqueness and visibility in an isolated local database', () => {
  let database;
  before(async () => { database = await startTestDatabase(); });
  after(async () => { if (database) await database.stop(); });
  beforeEach(async () => {
    await Promise.all([Product.deleteMany({}), Category.deleteMany({}), ComponentOption.deleteMany({})]);
  });

  it('enforces unique product slugs and preserved source product IDs', async () => {
    const first = productData({ slug: 'unique-product', externalCatalogId: 'TEST-PRODUCT-001' });
    await Product.create(first);
    await assert.rejects(Product.create(productData({ slug: first.slug })), { code: 11000 });
    await assert.rejects(Product.create(productData({ externalCatalogId: first.externalCatalogId })), { code: 11000 });
    assert.equal(await Product.countDocuments({}), 1);
  });

  it('allows multiple merchant-created products without a catalog source ID', async () => {
    await Product.create([productData(), productData()]);
    assert.equal(await Product.countDocuments({}), 2);
  });

  it('enforces global category slug uniqueness', async () => {
    await Category.create({ name: 'Main one', slug: 'main-one' });
    await assert.rejects(Category.create({ name: 'Main two', slug: 'main-one' }), { code: 11000 });
  });

  it('enforces normalized names under the same parent while allowing distinct parents', async () => {
    const firstParent = await Category.create({ name: 'First main', slug: 'first-main' });
    const secondParent = await Category.create({ name: 'Second main', slug: 'second-main' });
    await Category.create({ name: 'Cards', slug: 'first-cards', parentId: firstParent._id });
    await assert.rejects(Category.create({ name: '  cards  ', slug: 'duplicate-cards', parentId: firstParent._id }), { code: 11000 });
    await Category.create({ name: 'Cards', slug: 'second-cards', parentId: secondParent._id });
    assert.equal(await Category.countDocuments({ nameNormalized: 'cards' }), 2);
  });

  it('returns only approved Ready products from the public visibility filter', async () => {
    const draft = await Product.create(productData());
    const hold = await Product.create(approvedData({ status: 'hold' }));
    const ready = await Product.create(approvedData());
    const results = await Product.find(publicProductFilter()).lean();
    assert.deepEqual(results.map((product) => String(product._id)), [String(ready._id)]);
    assert.equal(draft.published, false);
    assert.equal(hold.published, false);
  });

  it('excludes unapproved legacy documents even if their stored publication flags say Ready', async () => {
    const ready = await Product.create(approvedData());
    // Simulate older data bypassing Mongoose's publication validator.
    const unapproved = await Product.create(productData());
    await Product.collection.updateOne({ _id: unapproved._id }, { $set: { status: 'ready', published: true, pricePiastres: 2500, priceApproved: false, 'inventory.approved': false } });
    assert.equal(await Product.countDocuments(publicProductFilter()), 1);
    assert.equal(String((await Product.findOne(publicProductFilter()))._id), String(ready._id));
  });
});
