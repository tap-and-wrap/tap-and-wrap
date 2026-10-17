import { createHash } from 'node:crypto';

const id = value => String(value?._id || value || '');
const invalid = () => { throw new Error('Display transition requires a current, complete reviewed snapshot'); };
const fields = ['name', 'slug', 'description', 'status', 'visibility', 'reviewRequired', 'reviewReasons', 'merchantReviewNotes', 'mainImageKey', 'galleryKeys'];

// Offline planning only. No connections, credentials, writes, price approval,
// stock approval or alias allocation. Apply is a separately authorized operation.
export function displayReviewDigest(products, categories) {
  if (!Array.isArray(products) || products.length > 10_000 || !Array.isArray(categories) || categories.length > 10_000) invalid();
  const sorted = entries => entries.sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify({
    products: sorted(products.map(product => ({ id: id(product), revision: product.revision,
      categoryId: id(product.categoryId), subcategoryId: id(product.subcategoryId),
      ...Object.fromEntries(fields.map(field => [field, product[field] ?? null])) }))),
    categories: sorted(categories.map(category => ({ id: id(category), parentId: id(category.parentId), active: category.active === true }))),
  })).digest('hex');
}

export function planDisplayTransition(products, categories, review) {
  if (review?.version !== 1 || review.source !== 'merchant-reviewed-product-display' || review.snapshotHash !== displayReviewDigest(products, categories)
    || !Array.isArray(review.groups) || review.groups.length > 10_000) invalid();
  const byId = new Map(products.map(product => [id(product), product]));
  const categoryMap = new Map(categories.map(category => [id(category), category]));
  if (byId.size !== products.length || categoryMap.size !== categories.length) invalid();
  const planned = new Set(), changes = [];
  for (const group of review.groups) {
    if (!['hidden', 'public', 'withdrawn'].includes(group.visibility) || !Array.isArray(group.productIds) || !group.productIds.length || group.productIds.length > 10_000) invalid();
    for (const productId of group.productIds) {
      const product = byId.get(productId);
      if (!product || planned.has(productId) || !/^[a-f\d]{24}$/i.test(productId) || !Number.isSafeInteger(product.revision) || product.revision < 0) invalid();
      planned.add(productId);
      if (group.visibility === 'public') {
        const main = categoryMap.get(id(product.categoryId)), child = categoryMap.get(id(product.subcategoryId));
        if (!['draft', 'ready', 'hold'].includes(product.status) || !product.name?.trim() || !product.mainImageKey
          || !main?.active || main.parentId || product.subcategoryId && (!child?.active || id(child.parentId) !== id(main))) invalid();
      }
      changes.push({ id: productId, patch: { expectedRevision: product.revision, visibility: group.visibility } });
    }
  }
  // Every record needs an explicit disposition. Exclusions are reviewed, too.
  if (planned.size !== products.length) invalid();
  return { version: 1, source: 'reviewed-display-only-plan', snapshotHash: review.snapshotHash, changes };
}
