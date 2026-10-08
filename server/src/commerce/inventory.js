import { Product } from '../models/Product.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { Category } from '../models/Category.js';
import CustomizationTemplate from '../models/CustomizationTemplate.js';
import BundleRule from '../models/BundleRule.js';
import { publicProductFilter } from '../catalog/product-policy.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { env } from '../config/env.js';
import { commerceError } from './errors.js';

export function aggregateClaims(lines) {
  const claims = new Map();
  for (const line of lines) for (const claim of line.inventoryClaims) {
    const key = `${claim.kind}:${claim.id}:${claim.variantKey || ''}`;
    const previous = claims.get(key);
    const quantity = (previous?.quantity || 0) + claim.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw commerceError(400, 'INVALID_QUANTITY', 'Inventory quantity exceeds supported limits.');
    claims.set(key, { kind: claim.kind, id: String(claim.id), variantKey: claim.variantKey || null, mode: claim.mode, quantity });
  }
  return [...claims.values()];
}
export async function consumeInventory(lines, applied, session) {
  const claims = aggregateClaims(lines), byProduct = new Map();
  for (const claim of claims) {
    if (claim.kind === 'component') {
      const component = await ComponentOption.findById(claim.id).session(session).lean();
      if (!component) throw commerceError(409, 'COMPONENT_UNAVAILABLE', 'A selected component is unavailable.');
      claim.mode = component.inventory.mode;
      const filter = { _id: claim.id, enabledForCustomization: true, configurationApproved: true, priceApproved: true, reviewRequired: false,
        'inventory.approved': true, 'inventory.available': true, 'inventory.mode': claim.mode };
      const increment = { commerceRevision: 1 };
      if (claim.mode === 'tracked') { filter['inventory.quantity'] = { $gte: claim.quantity }; increment['inventory.quantity'] = -claim.quantity; }
      assertDatabaseWriteAllowed(ComponentOption.db, env);
      if (!(await ComponentOption.updateOne(filter, { $inc: increment }, { session })).matchedCount) throw commerceError(409, 'INSUFFICIENT_STOCK', 'A selected component is no longer available.');
    } else {
      const entries = byProduct.get(claim.id) || []; entries.push(claim); byProduct.set(claim.id, entries);
    }
  }
  for (const [id, entries] of byProduct) {
    const filter = { ...publicProductFilter(), _id: id, 'inventory.available': true };
    const increment = { commerceRevision: 1 }, arrayFilters = [];
    for (const [index, claim] of entries.entries()) {
      if (claim.variantKey) {
        (filter.$and ||= []).push({ variants: { $elemMatch: { key: claim.variantKey, 'inventory.approved': true, 'inventory.available': true,
          'inventory.mode': claim.mode, ...(claim.mode === 'tracked' ? { 'inventory.quantity': { $gte: claim.quantity } } : {}) } } });
        if (claim.mode === 'tracked') {
          increment[`variants.$[v${index}].inventory.quantity`] = -claim.quantity;
          arrayFilters.push({ [`v${index}.key`]: claim.variantKey });
        }
      } else {
        filter['inventory.mode'] = claim.mode;
        if (claim.mode === 'tracked') { filter['inventory.quantity'] = { $gte: claim.quantity }; increment['inventory.quantity'] = -claim.quantity; }
      }
    }
    assertDatabaseWriteAllowed(Product.db, env);
    if (!(await Product.updateOne(filter, { $inc: increment }, { session, ...(arrayFilters.length ? { arrayFilters } : {}) })).matchedCount) throw commerceError(409, 'INSUFFICIENT_STOCK', 'Stock or product approval changed. Review your cart.');
  }
  // Touch every eligibility record read by pricing, preventing write skew when
  // an administrator disables a category/template/promotion during checkout.
  for (const id of new Set(lines.flatMap(line => [line.categoryId, line.subcategoryId]).filter(Boolean))) {
    assertDatabaseWriteAllowed(Category.db, env);
    if (!(await Category.updateOne({ _id: id, active: true }, { $inc: { __v: 1 } }, { session })).matchedCount) throw commerceError(409, 'CATEGORY_UNAVAILABLE', 'A product category is no longer available.');
  }
  for (const template of new Map(lines.filter(line => line.customizationSnapshot).map(line => [line.customizationSnapshot.templateId, line.customizationSnapshot])).values()) {
    assertDatabaseWriteAllowed(CustomizationTemplate.db, env);
    if (!(await CustomizationTemplate.updateOne({ _id: template.templateId, version: template.version, active: true, status: 'approved' }, { $inc: { __v: 1 } }, { session })).matchedCount) throw commerceError(409, 'TEMPLATE_UNAVAILABLE', 'Customization approval changed.');
  }
  for (const promotion of applied.filter(value => value.kind === 'bundle')) {
    assertDatabaseWriteAllowed(BundleRule.db, env);
    if (!(await BundleRule.updateOne({ _id: promotion.id, active: true }, { $inc: { __v: 1 } }, { session })).matchedCount) throw commerceError(409, 'PROMOTION_UNAVAILABLE', 'Bundle approval changed.');
  }
  return claims;
}
export async function restockInventory(order, session) {
  if (order.restockedAt) return;
  for (const claim of order.inventoryClaims) {
    if (claim.mode !== 'tracked') continue;
    const Model = claim.kind === 'component' ? ComponentOption : Product;
    const filter = { _id: claim.id }, increment = { commerceRevision: 1 };
    if (claim.variantKey) {
      filter.variants = { $elemMatch: { key: claim.variantKey, 'inventory.mode': 'tracked', 'inventory.quantity': { $gte: 0, $lte: Number.MAX_SAFE_INTEGER - claim.quantity } } };
      increment['variants.$.inventory.quantity'] = claim.quantity;
    } else { filter['inventory.mode'] = 'tracked'; filter['inventory.quantity'] = { $gte: 0, $lte: Number.MAX_SAFE_INTEGER - claim.quantity }; increment['inventory.quantity'] = claim.quantity; }
    assertDatabaseWriteAllowed(Model.db, env);
    if (!(await Model.updateOne(filter, { $inc: increment }, { session })).matchedCount) throw commerceError(409, 'RESTOCK_REVIEW_REQUIRED', 'An inventory source changed. Review it before cancelling this order.');
  }
  order.restockedAt = new Date();
}
