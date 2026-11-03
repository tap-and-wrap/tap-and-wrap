import { FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';

// Pure, read-only preview. Writes are issued separately via existing audited admin APIs.
export function planMadeToOrderActivation(components) {
  if (!Array.isArray(components) || components.length !== 74 || FIXED_COMPONENTS.length !== 74)
    throw new Error('The complete 74-component catalog is required.');
  const map = new Map(components.map(c => [c.componentId, c]));
  if (map.size !== 74) throw new Error('Duplicate component IDs.');
  const updates = [], unchanged = [], conflicts = [];
  for (const fixed of FIXED_COMPONENTS) {
    const c = map.get(fixed.id);
    if (!c || c.category !== fixed.category || !Number.isSafeInteger(c.revision) || c.revision < 0)
      throw new Error(`Unknown or invalid component: ${fixed.id}`);
    if (c.pricing !== 'paid' || !Number.isSafeInteger(c.pricePiastres) || c.pricePiastres <= 0) {
      conflicts.push({ id: fixed.id, reason: 'Price not approved' }); continue;
    }
    if (fixed.category !== 'ribbon' && ![null, undefined, 'made_to_order'].includes(c.inventoryMode)) {
      conflicts.push({ id: fixed.id, reason: 'Existing tracked inventory needs manual review' }); continue;
    }
    const patch = { expectedRevision: c.revision };
    if (!c.enabled) patch.enabled = true;
    if (!c.available) patch.available = true;
    if (fixed.category !== 'ribbon' && c.inventoryMode !== 'made_to_order') patch.inventoryMode = 'made_to_order';
    if (Object.keys(patch).length === 1) unchanged.push(fixed.id);
    else updates.push({ componentId: fixed.id, patch });
  }
  return { updates, unchanged, conflicts };
}
