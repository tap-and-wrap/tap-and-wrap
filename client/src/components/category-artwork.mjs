// Owner-approved, baked-in square category art. Each already contains its
// category title and SHOP NOW graphic; never add a second visual CTA on top.
export const approvedCategorySlugs = Object.freeze([
  'accessories', 'food-treats', 'gifts-occasions', 'home-kitchen',
  'beauty-selfcare', 'baby-kids', 'home-decor', 'flowers-plants',
  'outdoor-travel', 'electronics-gaming', 'office-stationery', 'pets',
]);
const approved = new Set(approvedCategorySlugs);
function key(value) {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/&/g,' ').replace(/\band\b/g,' ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
    : '';
}
export function approvedCategoryImage(category) {
  if (!category || typeof category !== 'object') return null;
  // The catalog's actual slug is authoritative; name is a compatibility route
  // for older imported category records. No API image can hide approved art.
  const slug = [category.slug, category.name].map(key).find(item => approved.has(item));
  return slug ? `/media/tap-wrap-category-${slug}.webp` : null;
}
