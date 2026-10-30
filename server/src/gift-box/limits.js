import { DEFAULT_BOX_CATEGORY_LIMITS, countBuilderCategories, resolveBoxCategoryLimits, exceedingBuilderCategories } from '../../../shared/gift-box/selection-limits.mjs';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { loadPublishedGiftBoxPolicies } from './policy-store.js';
import { builderError } from './validation.js';

const boxIds = Array.from({ length: 12 }, (_, index) => `box-${index + 1}`);

// Only current, owner-reviewed publications create category limits. Missing,
// unprepared and withdrawn policies impose no invented count limits; this never
// grants physical fit, placement approval, stock availability or direct commerce.
export async function publishedBoxSelectionLimits(requestedBoxIds = boxIds, { session } = {}) {
  const policies = await loadPublishedGiftBoxPolicies(requestedBoxIds, { session });
  const limits = {};
  for (const boxId of requestedBoxIds) {
    const candidate = policies.get(boxId)?.limits?.maxByCategory;
    if (candidate) limits[boxId] = resolveBoxCategoryLimits(boxId, { [boxId]: candidate });
  }
  return limits;
}

export function assertBoxSelectionLimits(selection, publishedLimits) {
  const limits = resolveBoxCategoryLimits(selection.boxId, publishedLimits);
  const counts = countBuilderCategories(selection.items, item => getFixedComponent(item.componentId)?.category);
  const exceeded = exceedingBuilderCategories(counts, limits);
  if (exceeded.length) throw builderError(409, 'GIFT_BOX_CATEGORY_LIMIT', `This box exceeds its current ${exceeded.join(', ')} selection limit. Remove items or choose another box.`);
  return { counts, limits };
}

export { DEFAULT_BOX_CATEGORY_LIMITS };
