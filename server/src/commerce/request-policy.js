import { Product } from '../models/Product.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { Category } from '../models/Category.js';
import { mediaUrlForKey } from '../catalog/public-presentation.js';
import { commerceError } from './errors.js';

export const requestError = message => commerceError(409, 'REQUEST_REVIEW_REQUIRED', message);
export function componentEstimate(component) {
  const policy = component.requestPolicy || {};
  const price = policy.pricing === 'free' ? 0 : policy.pricing === 'fixed' && Number.isSafeInteger(policy.unitPricePiastres) && policy.unitPricePiastres > 0 ? policy.unitPricePiastres : null;
  return { componentId: String(component._id), name: component.name, imageUrl: mediaUrlForKey(component.mainImageKey), pricing: price === null ? 'pending' : policy.pricing === 'free' ? 'free' : 'fixed', unitPricePiastres: price };
}
export async function activeRequestCategory(record, session, fence = false) {
  const main = await Category.findOne({ _id: record.categoryId, active: true, parentId: null }).session(session || null).lean().maxTimeMS(3000);
  const child = record.subcategoryId ? await Category.findOne({ _id: record.subcategoryId, parentId: record.categoryId, active: true }).session(session || null).lean().maxTimeMS(3000) : null;
  if (!main || record.subcategoryId && !child) throw requestError('The selected category is no longer available.');
  if (fence) for (const category of [main, child].filter(Boolean)) { if (!(await Category.updateOne({ _id: category._id, __v: category.__v }, { $inc: { __v: 1 } }, { session })).matchedCount) throw requestError('The category changed. Review the request again.'); }
}
export async function requestProduct(id, { session, fence = false } = {}) {
  const product = await Product.findOne({ _id: id, visibility: 'public', status: { $in: ['draft', 'ready', 'hold'] }, reviewRequired: false, 'engravingRequest.enabled': true }).session(session || null).lean().maxTimeMS(3000);
  if (!product) throw requestError('Choose an owner-approved engraving product or describe a manual reference instead.');
  await activeRequestCategory(product, session, fence); return product;
}
export async function requestComponent(id, service, { session, fence = false } = {}) {
  const component = await ComponentOption.findOne({ _id: id, reviewRequired: false, 'requestPolicy.enabled': true, 'requestPolicy.services': service, 'requestPolicy.availability': 'available' }).session(session || null).lean().maxTimeMS(3000);
  if (!component) throw requestError('A requested component is no longer available. Review the selection.');
  await activeRequestCategory(component, session, fence); return component;
}
export function engravingProductPresentation(product) {
  return { id: String(product._id), name: product.name, imageUrl: mediaUrlForKey(product.mainImageKey), engraving: product.engravingRequest,
    basePricePiastres: product.priceApproved === true && product.pricePiastres > 0 ? product.pricePiastres : null,
    variants: (product.variants || []).map(variant => ({ key: variant.key, label: variant.attributes.map(attribute => `${attribute.name}: ${attribute.value}`).join(', '), basePricePiastres: variant.pricePiastres == null ? product.priceApproved === true && product.pricePiastres > 0 ? product.pricePiastres : null : variant.priceApproved === true && variant.pricePiastres > 0 ? variant.pricePiastres : null })) };
}
