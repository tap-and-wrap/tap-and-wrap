import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestDatabase } from './helpers/database.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { buildCatalogPlan, MASTER_HEADERS, INDEX_HEADERS, CATEGORY_HEADERS } from '../src/catalog/import-workbook.js';
import { applyCatalogPlan } from '../src/catalog/import-catalog.js';
import { updateCategory } from '../src/catalog/service.js';

let fixture;
const models = { Product, ComponentOption, Category };
const actor = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
before(async () => { fixture = await startTestDatabase({ models: [AdminAudit], transactions: true }); });
after(async () => { await fixture?.stop(); });
beforeEach(async () => { for (const Model of [Product, Category, ComponentOption, AdminAudit]) await Model.deleteMany({}); });
function planFor(role = 'Product') {
  const row = { 'Product ID': 'TEST-IMPORT-001', 'Product Name': 'Synthetic import fixture', 'Main Category': 'Synthetic Gifts', Subcategory: 'Synthetic Boxes',
    Description: 'Original synthetic description.', 'Catalog Role': role, Confidence: 'High', 'Publish Status': 'Draft', 'Image Count': 1, 'Image 1 (Main)': 'fixtures/box.webp' };
  return buildCatalogPlan([
    { name: 'Website Product Master', rows: [MASTER_HEADERS, MASTER_HEADERS.map(header => row[header] ?? null)] },
    { name: 'Image Index', rows: [INDEX_HEADERS, [row['Product ID'], row['Product Name'], 1, 'Main image', row['Image 1 (Main)']]] },
    { name: 'Category Summary', rows: [CATEGORY_HEADERS, [row['Main Category'], row.Subcategory, 1]] },
  ]);
}
async function seedCategories(plan) {
  const rootEntry = plan.categories.find(entry => !entry.parentKey);
  const childEntry = plan.categories.find(entry => entry.parentKey);
  const main = await Category.create({ name: rootEntry.name, slug: rootEntry.slug, importCategoryKey: rootEntry.key });
  const child = await Category.create({ name: childEntry.name, slug: childEntry.slug, parentId: main._id, importCategoryKey: childEntry.key });
  const other = await Category.create({ name: 'Independent merchant root', slug: 'independent-merchant-root' });
  return { main, child, other };
}
function barrier() {
  let enter, release;
  return { entered: new Promise(resolve => { enter = resolve; }), wait: new Promise(resolve => { release = resolve; }), enter, release };
}

for (const [role, Model, kind] of [['Product', Product, 'products'], ['Customization Option', ComponentOption, 'components']]) {
  test(`concurrent admin reparent rolls back uncommitted imported ${kind} and leaves valid relationships`, async () => {
    const plan = planFor(role);
    const { child, other } = await seedCategories(plan);
    const gate = barrier();
    const original = Model.bulkWrite;
    let paused = false;
    Model.bulkWrite = async function (operations, options) {
      assert.ok(options.session, 'Every import batch must use its transaction session.');
      const result = await original.call(this, operations, options);
      if (!paused) { paused = true; gate.enter(); await gate.wait; }
      return result;
    };
    try {
      const importing = applyCatalogPlan(plan, models).catch(error => error);
      await gate.entered;
      const moved = await updateCategory(child.id, { expectedRevision: 0, parentId: other.id }, { actor });
      assert.equal(String(moved.parentId), other.id);
      gate.release();
      const failure = await importing;
      assert.equal(failure.code, 'CATEGORY_HIERARCHY_CHANGED');
      assert.equal(failure.importReport.inserted[kind], 0);
      assert.equal(failure.importReport.journal.at(-1).rolledBack, true);
      assert.equal(failure.importReport.journal.at(-1).inserted, 0);
      assert.equal(await Model.countDocuments(), 0);
      assert.equal(String((await Category.findById(child.id)).parentId), other.id);
    } finally { gate.release(); Model.bulkWrite = original; }
  });
}

test('an importer relationship fence prevents concurrent admin reparent after product insertion', async () => {
  const plan = planFor();
  const { main, child, other } = await seedCategories(plan);
  const gate = barrier();
  const original = Category.updateOne;
  let paused = false;
  Category.updateOne = async function (filter, update, options) {
    const result = await original.call(this, filter, update, options);
    if (!paused && options?.session && update.$inc?.relationshipRevision && String(filter._id) === child.id) {
      paused = true; gate.enter(); await gate.wait;
    }
    return result;
  };
  try {
    const importing = applyCatalogPlan(plan, models);
    await gate.entered;
    const moving = updateCategory(child.id, { expectedRevision: 0, parentId: other.id }, { actor }).catch(error => error);
    gate.release();
    assert.equal((await importing).inserted.products, 1);
    assert.equal((await moving).code, 'CATEGORY_IN_USE');
    const product = await Product.findOne();
    assert.equal(String(product.categoryId), main.id);
    assert.equal(String(product.subcategoryId), child.id);
    assert.equal(String((await Category.findById(child.id)).parentId), main.id);
  } finally { gate.release(); Category.updateOne = original; }
});

test('new child-category batch rolls back when its formerly empty main category is reparented', async () => {
  const plan = planFor();
  const other = await Category.create({ name: 'Other synthetic root', slug: 'other-synthetic-root' });
  const gate = barrier();
  const original = Category.bulkWrite;
  let main;
  let paused = false;
  Category.bulkWrite = async function (operations, options) {
    const result = await original.call(this, operations, options);
    if (!paused && operations[0].updateOne.update.$setOnInsert.parentId) {
      paused = true;
      main = await Category.findOne({ parentId: null, _id: { $ne: other._id } });
      gate.enter(); await gate.wait;
    }
    return result;
  };
  try {
    const importing = applyCatalogPlan(plan, { ...models, batchSize: 1 }).catch(error => error);
    await gate.entered;
    await updateCategory(main.id, { expectedRevision: 0, parentId: other.id }, { actor });
    gate.release();
    const failure = await importing;
    assert.equal(failure.code, 'CATEGORY_HIERARCHY_CHANGED');
    assert.equal(failure.importReport.inserted.categories, 1, 'Only the prior committed root batch is counted.');
    assert.equal(failure.importReport.journal.at(-1).inserted, 0);
    assert.equal(await Category.countDocuments({ parentId: main._id }), 0);
    assert.equal(await Product.countDocuments(), 0);
  } finally { gate.release(); Category.bulkWrite = original; }
});

test('ambiguous commit is journaled as uncertain and insert-only resume preserves the actually committed record', async () => {
  const plan = planFor();
  await seedCategories(plan);
  const original = Product.db.startSession;
  Product.db.startSession = async function (...args) {
    const session = await original.apply(this, args);
    const transact = session.withTransaction;
    session.withTransaction = async function (...arguments_) {
      await transact.apply(this, arguments_);
      // Failure injection after the server commits but before the importer
      // observes the acknowledgement. Never treat this as a known rollback.
      throw Object.assign(new Error('SYNTHETIC_PRIVATE_NETWORK_DETAIL'), { errorLabels: ['UnknownTransactionCommitResult'] });
    };
    return session;
  };
  try {
    const failure = await applyCatalogPlan(plan, models).catch(error => error);
    assert.equal(failure.importReport.inserted.products, 0, 'Unacknowledged counts are never guessed.');
    assert.equal(failure.importReport.journal.at(-1).uncertain, true);
    assert.equal(failure.importReport.journal.at(-1).rolledBack, false);
    assert.equal(failure.importReport.journal.at(-1).inserted, null);
    assert.equal(JSON.stringify(failure.importReport).includes('SYNTHETIC_PRIVATE_NETWORK_DETAIL'), false);
    assert.equal(await Product.countDocuments(), 1);
    const before = await Product.findOne().lean();
    Product.db.startSession = original;
    const resumed = await applyCatalogPlan(plan, models);
    assert.equal(resumed.preserved.products, 1);
    assert.equal(resumed.inserted.products, 0);
    assert.deepEqual(await Product.findById(before._id).lean(), before);
  } finally { Product.db.startSession = original; }
});

test('session cleanup failure retains known committed counts and a sanitized journal', async () => {
  const plan = planFor();
  await seedCategories(plan);
  const original = Product.db.startSession;
  Product.db.startSession = async function (...args) {
    const session = await original.apply(this, args);
    const end = session.endSession;
    session.endSession = async function (...arguments_) {
      await end.apply(this, arguments_);
      throw new Error('SYNTHETIC_PRIVATE_SESSION_DETAIL');
    };
    return session;
  };
  try {
    const failure = await applyCatalogPlan(plan, models).catch(error => error);
    assert.equal(failure.code, 'IMPORT_SESSION_CLEANUP_FAILED');
    assert.equal(failure.importReport.inserted.products, 1);
    assert.equal(failure.importReport.journal.at(-2).status, 'completed');
    assert.equal(failure.importReport.journal.at(-2).inserted, 1);
    assert.equal(failure.importReport.journal.at(-1).status, 'cleanup-failed');
    assert.equal(JSON.stringify(failure.importReport).includes('SYNTHETIC_PRIVATE_SESSION_DETAIL'), false);
    assert.equal(await Product.countDocuments(), 1);
    Product.db.startSession = original;
    const resumed = await applyCatalogPlan(plan, models);
    assert.equal(resumed.inserted.products, 0);
    assert.equal(resumed.preserved.products, 1);
  } finally { Product.db.startSession = original; }
});

test('cleanup and journal failures never replace the original rolled-back batch error', async () => {
  const plan = planFor();
  await seedCategories(plan);
  const start = Product.db.startSession;
  const bulk = Product.bulkWrite;
  const primary = Object.assign(new Error('Synthetic original batch failure'), { code: 'SYNTHETIC_PRIMARY' });
  Product.bulkWrite = async function (...args) { await bulk.apply(this, args); throw primary; };
  Product.db.startSession = async function (...args) {
    const session = await start.apply(this, args);
    const end = session.endSession;
    session.endSession = async function (...arguments_) { await end.apply(this, arguments_); throw new Error('Synthetic cleanup failure'); };
    return session;
  };
  try {
    const failure = await applyCatalogPlan(plan, { ...models, onProgress(report) {
      if (['failed', 'cleanup-failed'].includes(report.journal.at(-1)?.status)) throw new Error('Synthetic journal failure');
    } }).catch(error => error);
    assert.equal(failure, primary);
    assert.equal(failure.importReport.inserted.products, 0);
    assert.equal(failure.importReport.journal.at(-2).rolledBack, true);
    assert.equal(failure.importReport.journal.at(-1).status, 'cleanup-failed');
    assert.equal(await Product.countDocuments(), 0);
  } finally { Product.db.startSession = start; Product.bulkWrite = bulk; }
});
