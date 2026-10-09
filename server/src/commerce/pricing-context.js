import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import CustomizationTemplate from '../models/CustomizationTemplate.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { Upload } from '../models/Upload.js';
import { publicProductFilter } from '../catalog/product-policy.js';

const ids = values => [...new Set(values.filter(value => mongoose.isObjectIdOrHexString(value)).map(String))];
const byId = records => new Map(records.map(record => [String(record._id), record]));

/** One quote/transaction attempt only. Never cache prices, stock or private files
 * across requests, owners or transaction retries. Operations stay sequential:
 * MongoDB does not support parallel operations within one transaction session. */
export async function createPricingContext(lines, owner, { session } = {}) {
  const context = { owner, session, products: new Map(), categories: new Map(), templates: new Map(), components: new Map(), uploads: new Map(), queryCount: 0 };
  const read = async query => { context.queryCount += 1; return query.session(session || null).lean().maxTimeMS(3000); };
  const productIds = ids(lines.map(line => line.productId));
  if (!productIds.length) return context;
  context.products = byId(await read(Product.find({ ...publicProductFilter(), _id: { $in: productIds } }).select('name slug description sku categoryId subcategoryId mainImageKey pricePiastres priceApproved variants inventory personalization customization updatedAt')));
  const products = [...context.products.values()];
  const categoryIds = ids(products.flatMap(product => [product.categoryId, product.subcategoryId]));
  if (categoryIds.length) context.categories = byId(await read(Category.find({ _id: { $in: categoryIds } }).select('_id parentId active')));
  const customized = new Set(lines.filter(line => line.customization).map(line => String(line.productId)));
  const templateIds = ids(products.filter(product => customized.has(String(product._id))).map(product => product.customization?.templateId));
  if (templateIds.length) {
    context.templates = byId(await read(CustomizationTemplate.find({ _id: { $in: templateIds } })));
    const componentIds = ids([...context.templates.values()].flatMap(template => (template.groups || []).flatMap(group => group.options.map(option => option.componentId))));
    if (componentIds.length) context.components = byId(await read(ComponentOption.find({ _id: { $in: componentIds } }).select('name pricePiastres priceApproved inventory enabledForCustomization configurationApproved reviewRequired updatedAt')));
  }
  // Malformed/oversized individual lines are rejected by normal field validation;
  // they must not turn a lightweight cart read into an unbounded dependency query.
  const uploadIds = ids(lines.flatMap(line => {
    const values = [...Object.values(line.personalization || {}), ...Object.values(line.customization?.fields || {})].filter(Array.isArray).flat();
    return values.length <= 10 ? values : [];
  }));
  if (uploadIds.length) context.uploads = byId(await read(Upload.find({ _id: { $in: uploadIds }, owner, state: 'complete', expiresAt: { $gt: new Date() } })));
  return context;
}
