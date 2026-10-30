// No arbitrary business selection caps. A separately reviewed, published
// owner packing policy may still impose conservative category restrictions.
// This never grants physical-fit or checkout approval.
export const DEFAULT_BOX_CATEGORY_LIMITS = null;
const categoryOrder = Object.freeze(['flower', 'plush', 'chocolate']);
const MAX_VISUAL_UNITS = 200;

export function resolveBoxCategoryLimits(boxId, publishedLimits) {
  const proposed = publishedLimits?.[boxId];
  if (typeof boxId !== 'string' || !proposed || !categoryOrder.every(category =>
    Number.isSafeInteger(proposed[category]) && proposed[category] >= 0 && proposed[category] <= MAX_VISUAL_UNITS)) {
    return null;
  }
  return Object.freeze(Object.fromEntries(categoryOrder.map(category => [category, proposed[category]])));
}

export function countBuilderCategories(items, getCategory) {
  const result = { flower: 0, plush: 0, chocolate: 0 };
  for (const item of items || []) {
    const category = getCategory(item);
    if (categoryOrder.includes(category)) {
      const quantity = item.quantity ?? 1;
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_VISUAL_UNITS - result[category]) {
        throw new RangeError('Invalid builder selection quantity.');
      }
      result[category] += quantity;
    }
  }
  return result;
}

export function exceedingBuilderCategories(counts, limits) {
  return limits ? categoryOrder.filter(category => counts[category] > limits[category]) : [];
}
