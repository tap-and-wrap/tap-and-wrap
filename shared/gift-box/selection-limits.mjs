// Suggested selection ceilings are not physical-fit certifications. A box's
// current published packing policy may replace these values. None of this
// module approves geometry, stock, artwork, payment or fulfillment.
export const DEFAULT_BOX_CATEGORY_LIMITS = Object.freeze({ flower: 25, plush: 2, chocolate: 6 });
const categoryOrder = Object.freeze(['flower', 'plush', 'chocolate']);
const MAX_VISUAL_UNITS = 200;

export function resolveBoxCategoryLimits(boxId, publishedLimits) {
  const proposed = publishedLimits?.[boxId];
  if (typeof boxId !== 'string' || !proposed || !categoryOrder.every(category =>
    Number.isSafeInteger(proposed[category]) && proposed[category] >= 0 && proposed[category] <= MAX_VISUAL_UNITS)) {
    return DEFAULT_BOX_CATEGORY_LIMITS;
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
  return categoryOrder.filter(category => counts[category] > limits[category]);
}
