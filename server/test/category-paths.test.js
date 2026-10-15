import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { getPublicCategory, listCategories } from '../src/catalog/service.js';
import { categoryPublicPaths } from '../../shared/category-paths.mjs';
import { startTestDatabase } from './helpers/database.js';

let database, root, child, other;
before(async () => { database = await startTestDatabase({ models: [Category, Product] }); });
after(async () => { await database?.stop(); });
beforeEach(async () => {
  await Category.deleteMany({});
  root = await Category.create({ name: 'Accessories', slug: 'accessories-3a2b6498' });
  other = await Category.create({ name: 'Other gifts', slug: 'other-12345678' });
  child = await Category.create({ name: 'Cosmetics Lip Makeup', slug: 'accessories-cosmetics-lip-makeup-1b8eb3e0', parentId: root._id });
});

test('friendly and legacy paths return the same stored identity without modifying records', async () => {
  const before = await Category.find({}).sort({ _id: 1 }).lean();
  const main = await getPublicCategory('accessories');
  const friendly = await getPublicCategory('accessories', 'cosmetics-lip-makeup');
  const legacy = await getPublicCategory(child.slug);
  assert.equal(main.slug, root.slug);
  assert.equal(friendly.slug, child.slug);
  assert.equal(String(friendly._id), String(child._id));
  assert.equal(friendly.publicPath, '/categories/accessories/cosmetics-lip-makeup');
  assert.equal(legacy.publicPath, friendly.publicPath);
  assert.equal(friendly.parent.publicPath, main.publicPath);
  assert.equal((await listCategories({ parent: root.slug, includeProductCounts: false })).categories[0].publicPath, friendly.publicPath);
  assert.deepEqual(await Category.find({}).sort({ _id: 1 }).lean(), before);
});

test('child aliases are scoped to their actual parent and preserve visibility gates', async () => {
  await assert.rejects(getPublicCategory('other-gifts', 'cosmetics-lip-makeup'), { status: 404 });
  await assert.rejects(getPublicCategory('cosmetics-lip-makeup'), { status: 404 });
  await Category.updateOne({ _id: root._id }, { active: false });
  await assert.rejects(getPublicCategory('accessories', 'cosmetics-lip-makeup'), { status: 404 });
  await assert.rejects(getPublicCategory(child.slug), { status: 404 });
});

test('normalized sibling collisions have stable unique fallbacks; names in other roots remain independent', async () => {
  const duplicate = await Category.create({ name: 'Cosmetics-Lip Makeup', slug: 'another-unique-slug', parentId: root._id });
  const independent = await Category.create({ name: child.name, slug: 'other-child', parentId: other._id });
  const rows = await Category.find({}).lean();
  const paths = categoryPublicPaths(rows);
  assert.equal(paths.get(String(child._id)), `/categories/accessories/category-id-${child._id}`);
  assert.equal(paths.get(String(duplicate._id)), `/categories/accessories/category-id-${duplicate._id}`);
  assert.equal(paths.get(String(independent._id)), '/categories/other-gifts/cosmetics-lip-makeup');
  assert.deepEqual(categoryPublicPaths([...rows].reverse()), new Map([...paths].reverse()));
  assert.equal((await getPublicCategory('accessories', `category-id-${child._id}`)).slug, child.slug);
});

test('legacy child slugs cannot be stolen by a new root alias, including inactive records', async () => {
  await Category.create({ name: 'Reserved', slug: 'new-root', parentId: root._id, active: false });
  const added = await Category.create({ name: 'New Root', slug: 'new-root-87654321' });
  const result = await getPublicCategory(added.slug);
  assert.equal(result.publicPath, `/categories/category-id-${added._id}`);
  await assert.rejects(getPublicCategory('new-root'), { status: 404 });
});
