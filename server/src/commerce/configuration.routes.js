import { mergeInventory } from '../catalog/inventory-input.js';
import { ownerComponentInput, ownerTemplateInput } from './owner-configuration.js';
import { productPersonalizationFields } from '../../../shared/product-personalization.mjs';
import { componentRequestPolicy } from './request-validation.js';
import { attachProductPaths, productIdentityFilter } from '../catalog/product-addresses.js';
import express from 'express';
import { validateMediaReferences } from '../catalog/media.js';
import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { ComponentOption } from '../models/ComponentOption.js';
import CustomizationTemplate from '../models/CustomizationTemplate.js';
import DiscountCode from '../models/DiscountCode.js';
import BundleRule from '../models/BundleRule.js';
import ShippingConfig from '../models/ShippingConfig.js';
import { CommerceControl } from '../models/CommerceControl.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { publicProductFilter, orderableProductStockFilter } from '../catalog/product-policy.js';
import { publicProductCard } from '../catalog/public-presentation.js';
import { loadEligibleProduct, canonical } from './pricing.js';
import { configurationError, loadCustomizationTemplate, publicTemplatePresentation, quoteCustomization } from './customization.js';
import { GOVERNORATES, shippingForGovernorate } from './promotions.js';
import { recordAdminAudit } from './audit.js';
import { captureAction } from '../tracking/service.js';
import { prepareAdminRevision } from '../utils/admin-revision.js';
import { validateCatalogCategoryReferences } from '../catalog/category-integrity.js';

export const publicConfigurationRoutes = express.Router();
export const adminConfigurationRoutes = express.Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const objectId = (value) => mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(String(value));
const idParam = (req) => {
  if (!objectId(req.params.id)) throw configurationError('A valid record ID is required.');
  return req.params.id;
};
const plainBody = (body, fields) => {
  if (body && Object.hasOwn(body, 'ownerWorkflow') && body.ownerWorkflow !== true) throw configurationError('Invalid owner workflow.');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((field) => !fields.includes(field))) throw configurationError('Unsupported configuration fields.');
  return Object.fromEntries(Object.entries(body));
};
const revisionBody = (body, fields) => {
  const { expectedRevision, ...values } = plainBody(body, [...fields, 'expectedRevision']);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw configurationError('Load the record before saving and include its revision.', 'INVALID_REVISION');
  return { expectedRevision, values };
};
const adminRecord = (record) => {
  const plain = record?.toObject ? record.toObject() : record;
  const { __v, ...fields } = plain;
  return { ...fields, revision: __v ?? 0 };
};
const regex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TEMPLATE_FIELDS = ['ownerWorkflow', 'usage', 'key', 'name', 'kind', 'status', 'active', 'pricingMode', 'baseAdjustmentPiastres', 'groups', 'fields', 'engraving'];
const COMPONENT_FIELDS = ['categoryId', 'subcategoryId', 'ownerWorkflow', 'requestPolicy', 'mainImageKey', 'galleryKeys', 'name', 'description', 'pricePiastres', 'compareAtPiastres', 'priceApproved', 'inventory', 'enabledForCustomization', 'configurationApproved', 'reviewRequired', 'merchantReviewNotes'];
function validateRequestPolicy(values) {
  if (values.requestPolicy) {
    const policy = componentRequestPolicy.parse(values.requestPolicy);
    if (policy.pricing === 'free') policy.unitPricePiastres = 0;
    else if (!policy.unitPricePiastres || policy.pricing === 'pending') { policy.pricing = 'pending'; policy.unitPricePiastres = null; }
    values.requestPolicy = policy;
  }
  return values;
}
const BUNDLE_FIELDS = ['name', 'description', 'active', 'published', 'items', 'discountKind', 'discountValue', 'maxApplications', 'priority', 'startsAt', 'endsAt'];
const DISCOUNT_FIELDS = ['code', 'name', 'active', 'kind', 'value', 'minimumSubtotalPiastres', 'maximumDiscountPiastres', 'productIds', 'categoryIds', 'authenticatedOnly', 'stackWithBundles', 'startsAt', 'endsAt', 'usageLimit', 'perCustomerLimit'];

export function configurationPagination(query = {}) {
  const parse = (value, fallback) => value === undefined ? fallback : (/^\d+$/.test(String(value)) ? Number(value) : NaN);
  const page = parse(query.page, 1);
  const limit = parse(query.limit, 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 200 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw configurationError('Pagination accepts pages 1–200 with one to twenty records.');
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.trim().length > 100)) throw configurationError('Search must be at most 100 characters.');
  return { page, limit, skip: (page - 1) * limit };
}
const paginationPresentation = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
function requireConnected(req, res, next) {
  if (mongoose.connection.readyState !== 1) return next(configurationError('Catalog configuration is temporarily unavailable.', 'COMMERCE_UNAVAILABLE', 503));
  return next();
}
publicConfigurationRoutes.use(requireConnected);
adminConfigurationRoutes.use(requireAuth, requireAdmin, csrfProtection, requireConnected);

async function auditedMutation(req, action, resourceId, mutate) {
  assertDatabaseWriteAllowed(mongoose.connection, env);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      assertDatabaseWriteAllowed(mongoose.connection, env);
      result = await mutate(session);
      await recordAdminAudit(req.user, { action, resourceType: 'configuration', resourceId: String(result?._id || resourceId), details: { requestedFields: Object.keys(req.body || {}).slice(0,30), version: result?.version ?? null, status: result?.status ?? null } }, { session });
    });
  } catch (error) {
    if (error.code === 11000 && action === 'shipping.updated') throw configurationError('Shipping settings were created by another editor. Reload them before saving.', 'EDIT_CONFLICT', 409);
    if (error.code === 11000 && action.startsWith('promotion.bundle.')) throw configurationError('Bundle capacity changed during this save. Reload the list before retrying.', 'EDIT_CONFLICT', 409);
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

publicConfigurationRoutes.get('/customization/services/:kind/products', wrap(async (req, res) => {
  if (!['gift_box', 'laser_engraving'].includes(req.params.kind)) throw configurationError('This featured customization service does not exist.', 'NOT_FOUND', 404);
  const { page, limit, skip } = configurationPagination(req.query);
  const filter = {
    ...publicProductFilter(),
    'customization.serviceKind': req.params.kind, 'customization.serviceEntryEligible': true, 'inventory.available': true,
    $and: [orderableProductStockFilter()]
  };
  if (req.query.search?.trim()) filter.name = { $regex: regex(req.query.search.trim()), $options: 'i' };
  const pipeline = [
    { $match: filter },
    { $lookup: { from: CustomizationTemplate.collection.name, localField: 'customization.templateId', foreignField: '_id', as: 'templateRecord' } },
    { $match: { templateRecord: { $elemMatch: { kind: req.params.kind, usage: { $ne: 'enquiry' }, status: 'approved', active: true } } } },
    { $lookup: { from: Category.collection.name, localField: 'categoryId', foreignField: '_id', as: 'mainCategory' } },
    { $lookup: { from: Category.collection.name, localField: 'subcategoryId', foreignField: '_id', as: 'subCategory' } },
    { $match: { mainCategory: { $elemMatch: { active: true, parentId: null } }, $or: [{ subcategoryId: null }, { subCategory: { $elemMatch: { active: true } } }] } },
    { $match: { $expr: { $or: [{ $eq: [{ $ifNull: ['$subcategoryId', null] }, null] }, { $eq: [{ $arrayElemAt: ['$subCategory.parentId', 0] }, '$categoryId'] }] } } },
    { $facet: { products: [{ $sort: { name: 1, _id: 1 } }, { $skip: skip }, { $limit: limit }, { $project: { visibility: 1, name: 1, slug: 1, pricePiastres: 1, compareAtPiastres: 1, priceApproved: 1, featured: 1, bestSeller: 1, status: 1, published: 1, reviewRequired: 1, inventory: 1, mainImageKey: 1, variants: 1, 'personalization.fields': 1, 'personalization.requiredBeforePurchase': 1, 'customization.enabled': 1, categoryId: { $arrayElemAt: ['$mainCategory', 0] }, subcategoryId: { $arrayElemAt: ['$subCategory', 0] } } }], count: [{ $count: 'total' }] } }
  ];
  const [result] = await Product.aggregate(pipeline).option({ maxTimeMS: 3000 });
  respond(res, { products: await attachProductPaths((result?.products || []).map(publicProductCard)), pagination: paginationPresentation(page, limit, result?.count?.[0]?.total || 0) });
}));

publicConfigurationRoutes.get('/customization/products/:slug', wrap(async (req, res) => {
  if (req.params.slug.length > 300 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug)) throw configurationError('This product is not available.', 'NOT_FOUND', 404);
  const record = await Product.findOne({ ...publicProductFilter(), ...await productIdentityFilter(req.params.slug) }).select('_id').lean().maxTimeMS(3000);
  if (!record) throw configurationError('This product is not available.', 'NOT_FOUND', 404);
  const product = await loadEligibleProduct(record._id);
  const { template, components } = await loadCustomizationTemplate(product);
  await Product.populate(product, [{ path: 'categoryId', select: 'name slug' }, { path: 'subcategoryId', select: 'name slug' }]);
  const [publicCard] = await attachProductPaths([publicProductCard(product)]);
  const sourcePath = ['gift_box', 'laser_engraving'].includes(template.kind) ? `/customize/${template.kind.replaceAll('_', '-')}` : publicCard.publicPath;
  const tracking = await captureAction(req, 'CustomizationStart', { service_kind: template.kind }, { sourcePath, dedupKey: `template:${template._id}:${template.version}:product:${product._id}` });
  respond(res, { product: { ...publicCard, personalization: { requiredBeforePurchase: product.personalization?.requiredBeforePurchase === true, fields: productPersonalizationFields(product.personalization) }, variants: (product.variants || []).map((variant) => ({ key: variant.key, attributes: variant.attributes, pricePiastres: variant.pricePiastres == null ? product.pricePiastres : (variant.priceApproved ? variant.pricePiastres : null), priceApproved: variant.pricePiastres == null ? Boolean(product.priceApproved) : Boolean(variant.priceApproved), available: Boolean(variant.inventory?.approved && variant.inventory?.available && (variant.inventory.mode === 'made_to_order' || variant.inventory.quantity > 0)) })) }, template: publicTemplatePresentation(template, components), tracking });
}));

publicConfigurationRoutes.post('/customization/quote', csrfProtection, wrap(async (req, res) => {
  const body = plainBody(req.body, ['productId', 'variantKey', 'customization']);
  if (!objectId(body.productId)) throw configurationError('Choose an eligible product.');
  const product = await loadEligibleProduct(body.productId);
  let basePricePiastres = product.pricePiastres;
  if (body.variantKey !== undefined && body.variantKey !== null) {
    const variant = product.variants?.find((candidate) => candidate.key === body.variantKey);
    if (!variant || (variant.pricePiastres !== null && !variant.priceApproved) || !variant.inventory?.approved || !variant.inventory?.available || (variant.inventory.mode === 'tracked' && variant.inventory.quantity < 1)) throw configurationError('Choose an available approved variant.', 'VARIANT_UNAVAILABLE', 409);
    if (variant.pricePiastres !== null && variant.pricePiastres !== undefined) basePricePiastres = variant.pricePiastres;
  }
  const quote = await quoteCustomization(product, body.customization, { requireFields: false });
  const unitPricePiastres = basePricePiastres + quote.adjustmentPiastres;
  if (!Number.isSafeInteger(unitPricePiastres) || unitPricePiastres < 0) throw configurationError('The configured price requires merchant review.', 'CUSTOMIZATION_PRICE_INVALID', 409);
  respond(res, { basePricePiastres, adjustmentPiastres: quote.adjustmentPiastres, unitPricePiastres, snapshot: quote.snapshot, fields: quote.fields });
}));

publicConfigurationRoutes.get('/shipping', wrap(async (req, res) => {
  const configuration = await ShippingConfig.findOne({ key: 'egypt-v1' }).lean().maxTimeMS(3000);
  const cairo = shippingForGovernorate('cairo', configuration);
  const other = shippingForGovernorate('alexandria', configuration);
  respond(res, { governorates: GOVERNORATES, rates: { cairoGizaPiastres: cairo.shippingPiastres, otherGovernoratesPiastres: other.shippingPiastres } });
}));

async function listConfiguration(Model, req, { fields, filters = {} } = {}) {
  const { page, limit, skip } = configurationPagination(req.query);
  if (req.query.search?.trim()) {
    const hasTextIndex = Model.schema.indexes().some(([fields]) => Object.values(fields).includes('text'));
    if (hasTextIndex) filters.$text = { $search: JSON.stringify(req.query.search.trim()) };
    else filters.name = { $regex: regex(req.query.search.trim()), $options: 'i' };
  }
  const [records, total] = await Promise.all([Model.find(filters).select(fields ? `${fields} __v` : '').sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).lean().maxTimeMS(3000), Model.countDocuments(filters).maxTimeMS(3000)]);
  return { records: records.map(adminRecord), pagination: paginationPresentation(page, limit, total) };
}
async function findRecord(Model, id, session) {
  let query = Model.findById(id).maxTimeMS(3000);
  if (session) query = query.session(session);
  const record = await query;
  if (!record) throw configurationError('This configuration record does not exist.', 'NOT_FOUND', 404);
  return record;
}

adminConfigurationRoutes.get('/templates', wrap(async (req, res) => {
  const filters = {};
  if (req.query.kind !== undefined) {
    if (!['gift_box', 'laser_engraving', 'tray', 'generic'].includes(req.query.kind)) throw configurationError('Invalid template kind.');
    filters.kind = req.query.kind;
  }
  if (req.query.status !== undefined) {
    if (!['draft', 'approved', 'retired'].includes(req.query.status)) throw configurationError('Invalid template status.');
    filters.status = req.query.status;
  }
  const { records, pagination } = await listConfiguration(CustomizationTemplate, req, { filters, fields: 'usage key name kind version status active pricingMode baseAdjustmentPiastres supersedes createdAt updatedAt' });
  respond(res, { templates: records, pagination });
}));
adminConfigurationRoutes.get('/templates/:id', wrap(async (req, res) => respond(res, { template: adminRecord(await findRecord(CustomizationTemplate, idParam(req))) })));

async function validateTemplateReferences(record, session) {
  const ids = [...new Set(record.groups.flatMap((group) => group.options.map((option) => option.componentId && String(option.componentId))).filter(Boolean))];
  const components = await ComponentOption.find({ _id: { $in: ids } }).session(session).select('_id ownerManaged enabledForCustomization configurationApproved priceApproved pricePiastres inventory reviewRequired').lean().maxTimeMS(3000);
  if (components.length !== ids.length) throw configurationError('A referenced component does not exist.');
  if (record.usage !== 'enquiry' && record.status === 'approved' && record.active) {
    for (const group of record.groups) {
      const available = group.options.filter((option) => option.active && (!option.componentId || components.some((component) => String(component._id) === String(option.componentId) && (!component.reviewRequired || component.ownerManaged) && component.enabledForCustomization && component.configurationApproved && component.priceApproved && component.inventory.approved)));
      if (available.length < group.minChoices) throw configurationError('Approve enough configured components to meet each group’s minimum choices.');
    }
  }
}
adminConfigurationRoutes.post('/templates', wrap(async (req, res) => {
  const values = ownerTemplateInput(plainBody(req.body, TEMPLATE_FIELDS));
  const template = await auditedMutation(req, 'customization.template.created', 'new', async (session) => {
    const record = new CustomizationTemplate({ ...values, version: 1, createdBy: req.user._id });
    await record.validate();
    await validateTemplateReferences(record, session);
    return record.save({ session });
  });
  respond(res, { template: adminRecord(template) }, 201);
}));

async function reviseTemplate(req, forceRevision) {
  const id = idParam(req);
  const { values: submitted, expectedRevision } = revisionBody(req.body, TEMPLATE_FIELDS);
  const ownerSave = submitted.ownerWorkflow === true;
  let revisionCreated = false;
  const template = await auditedMutation(req, 'customization.template.updated', id, async (session) => {
    let record = await findRecord(CustomizationTemplate, id, session);
    const values = ownerSave ? ownerTemplateInput(submitted, record.key) : submitted;
    await prepareAdminRevision(record, expectedRevision, { session });
    const stable = value => JSON.stringify(canonical(JSON.parse(JSON.stringify(value ?? null))));
    const administrativeOnly = ownerSave ? Object.entries(values).every(([key, value]) => ['active', 'status'].includes(key) || stable(value) === stable(record.get(key)))
      : Object.keys(values).every((key) => ['active', 'status'].includes(key)) && values.status !== 'draft';
    if (forceRevision || (record.status !== 'draft' && !administrativeOnly)) {
      // Fence the source version as well as the newly created revision. Two stale
      // editors must not independently create successive revisions from one form.
      const claimed = await CustomizationTemplate.updateOne({ _id: record._id, __v: record.__v }, { $inc: { __v: 1 } }, { session });
      if (claimed.modifiedCount !== 1) throw configurationError('This record changed. Reload it before saving.', 'EDIT_CONFLICT', 409);
      const latest = await CustomizationTemplate.findOne({ key: record.key }).sort({ version: -1 }).session(session).select('version').lean().maxTimeMS(3000);
      const original = record.toObject();
      delete original._id;
      delete original.__v;
      delete original.createdAt;
      delete original.updatedAt;
      record = new CustomizationTemplate({ ...original, ...values, key: original.key, version: latest.version + 1, supersedes: id, createdBy: req.user._id, status: 'draft', active: false });
      if (ownerSave) record.set(ownerTemplateInput({ ...values, ownerWorkflow: true }));
      revisionCreated = true;
    } else {
      if (record.status !== 'draft' && values.status === 'draft') throw configurationError('Create a new revision instead of changing an approved version.');
      if (values.key !== undefined && values.key !== record.key) throw configurationError('Template family keys cannot be renamed.');
      record.set(ownerSave && administrativeOnly ? { active: values.active, status: values.status } : values);
    }
    await record.validate();
    await validateTemplateReferences(record, session);
    return record.save({ session });
  });
  return { template: adminRecord(template), revisionCreated };
}
adminConfigurationRoutes.patch('/templates/:id', wrap(async (req, res) => respond(res, await reviseTemplate(req, false))));
adminConfigurationRoutes.post('/templates/:id/revisions', wrap(async (req, res) => respond(res, await reviseTemplate(req, true), 201)));

adminConfigurationRoutes.get('/components', wrap(async (req, res) => {
  const filters = {};
  for (const [queryKey, field] of [['enabled', 'enabledForCustomization'], ['approved', 'configurationApproved']]) {
    if (req.query[queryKey] !== undefined) {
      if (!['true', 'false'].includes(req.query[queryKey])) throw configurationError('Invalid component filter.');
      filters[field] = req.query[queryKey] === 'true';
    }
  }
  const { records, pagination } = await listConfiguration(ComponentOption, req, { filters, fields: 'ownerManaged requestPolicy externalCatalogId name slug catalogRole status pricePiastres compareAtPiastres priceApproved inventory enabledForCustomization configurationApproved reviewRequired merchantReviewNotes createdAt updatedAt' });
  respond(res, { components: records, pagination });
}));
adminConfigurationRoutes.get('/components/:id', wrap(async (req, res) => respond(res, { component: adminRecord(await findRecord(ComponentOption, idParam(req))) })));
adminConfigurationRoutes.post('/components', wrap(async (req, res) => {
  const values = validateRequestPolicy(plainBody(req.body, [...COMPONENT_FIELDS, 'slug', 'categoryId', 'subcategoryId', 'externalCatalogId', 'mainImageKey', 'galleryKeys', 'sku', 'catalogRole']));
  const component = await auditedMutation(req, 'customization.component.created', 'new', async (session) => {
    await validateMediaReferences([values.mainImageKey, ...(values.galleryKeys || [])], { session });
    const normalized = ownerComponentInput(values);
    const record = new ComponentOption({ ...normalized, catalogRole: values.catalogRole || 'Customization Option', status: 'draft', commerceRevision: 0 });
    if (normalized.inventory) record.inventory = mergeInventory(undefined, normalized.inventory);
    if (record.configurationApproved && ((!record.ownerManaged && record.reviewRequired) || !record.enabledForCustomization || !record.priceApproved || !record.inventory.approved)) throw configurationError('Component approval requires resolved catalog review, enabled customization, approved prices and approved inventory.');
    await record.validate();
    await validateCatalogCategoryReferences(record.categoryId, record.subcategoryId, { session, fence: true });
    return record.save({ session });
  });
  respond(res, { component: adminRecord(component) }, 201);
}));
adminConfigurationRoutes.patch('/components/:id', wrap(async (req, res) => {
  const id = idParam(req);
  const { values, expectedRevision } = revisionBody(req.body, COMPONENT_FIELDS);
  validateRequestPolicy(values);
  const component = await auditedMutation(req, 'customization.component.updated', id, async (session) => {
    const record = await findRecord(ComponentOption, id, session);
    await prepareAdminRevision(record, expectedRevision, { session });
    const patch = ownerComponentInput({ ...values }, record);
    await validateCatalogCategoryReferences(patch.categoryId ?? record.categoryId, patch.subcategoryId !== undefined ? patch.subcategoryId : record.subcategoryId, { session, fence: patch.categoryId !== undefined || patch.subcategoryId !== undefined });
    const has = (key) => Object.hasOwn(values, key);
    const priceChanged = ['pricePiastres', 'compareAtPiastres'].some((key) => has(key) && values[key] !== record[key]);
    let inventoryChanged = false;
    if (has('inventory')) {
      const existing = record.inventory.toObject();
      patch.inventory = values.ownerWorkflow ? patch.inventory : mergeInventory(existing, values.inventory);
      inventoryChanged = ['mode', 'quantity', 'available'].some((key) => patch.inventory[key] !== existing[key]);
    }
    if (!values.ownerWorkflow && priceChanged && !has('priceApproved')) patch.priceApproved = false;
    const meaningfulChange = priceChanged || inventoryChanged || ['name', 'description', 'enabledForCustomization', 'reviewRequired', 'priceApproved'].some((key) => has(key) && values[key] !== record[key]) || (has('inventory') && patch.inventory.approved !== record.inventory.approved);
    if (!values.ownerWorkflow && meaningfulChange && !has('configurationApproved')) patch.configurationApproved = false;
    await validateMediaReferences([patch.mainImageKey ?? record.mainImageKey, ...(patch.galleryKeys ?? record.galleryKeys)], { session });
    record.set(patch);
    record.commerceRevision += 1;
    if (record.configurationApproved && (record.reviewRequired || !record.enabledForCustomization || !record.priceApproved || !record.inventory.approved)) throw configurationError('Component approval requires resolved catalog review, enabled customization, approved prices and approved inventory.');
    await record.validate();
    return record.save({ session });
  });
  respond(res, { component: adminRecord(component) });
}));

function addPromotionRoutes(path, Model, fields, listKey, itemKey) {
  adminConfigurationRoutes.get(path, wrap(async (req, res) => {
    const projection = itemKey === 'bundle' ? 'name active published discountKind discountValue priority startsAt endsAt createdAt updatedAt' : 'name code active kind value usedCount usageLimit startsAt endsAt createdAt updatedAt';
    const { records, pagination } = await listConfiguration(Model, req, { fields: projection });
    respond(res, { [listKey]: records, pagination });
  }));
  adminConfigurationRoutes.get(`${path}/:id`, wrap(async (req, res) => respond(res, { [itemKey]: adminRecord(await findRecord(Model, idParam(req))) })));
  adminConfigurationRoutes.post(path, wrap(async (req, res) => {
    const values = plainBody(req.body, fields);
    const record = await auditedMutation(req, `promotion.${itemKey}.created`, 'new', async (session) => {
      const document = new Model(values);
      await document.validate();
      await validatePromotionReferences(document, itemKey, session);
      return document.save({ session });
    });
    respond(res, { [itemKey]: adminRecord(record) }, 201);
  }));
  adminConfigurationRoutes.patch(`${path}/:id`, wrap(async (req, res) => {
    const id = idParam(req);
    const { values, expectedRevision } = revisionBody(req.body, fields);
    const record = await auditedMutation(req, `promotion.${itemKey}.updated`, id, async (session) => {
      const document = await findRecord(Model, id, session);
      await prepareAdminRevision(document, expectedRevision, { session });
      document.set(values);
      await document.validate();
      await validatePromotionReferences(document, itemKey, session);
      return document.save({ session });
    });
    respond(res, { [itemKey]: adminRecord(record) });
  }));
}
async function validatePromotionReferences(document, kind, session) {
  const ids = kind === 'bundle' ? [...new Set(document.items.map((item) => String(item.productId)))] : [...new Set(document.productIds.map(String))];
  const products = await Product.find({ _id: { $in: ids } }).session(session).select('_id variants.key').lean().maxTimeMS(3000);
  if (products.length !== ids.length) throw configurationError('A promotion product does not exist.');
  if (kind === 'bundle') {
    for (const item of document.items) if (item.variantKey && !products.find((product) => String(product._id) === String(item.productId))?.variants.some((variant) => variant.key === item.variantKey)) throw configurationError('A bundle variant does not exist.');
    if (document.active) {
      // Count-then-save alone admits two concurrent activations at 99. This
      // transaction-local fence serializes only bundle-capacity decisions.
      assertDatabaseWriteAllowed(CommerceControl.db, env);
      await CommerceControl.findOneAndUpdate({ _id: 'bundle-activation' }, { $inc: { revision: 1 } }, { upsert: true, new: true, session }).maxTimeMS(3000);
      if (await BundleRule.countDocuments({ active: true, _id: { $ne: document._id } }).session(session).maxTimeMS(3000) >= 100) throw configurationError('At most 100 bundle rules may be active.', 'BUNDLE_CAPACITY', 409);
    }
  } else if (document.categoryIds.length) {
    const categoryIds = [...new Set(document.categoryIds.map(String))];
    if (await Category.countDocuments({ _id: { $in: categoryIds } }).session(session).maxTimeMS(3000) !== categoryIds.length) throw configurationError('A discount category does not exist.');
  }
}
addPromotionRoutes('/bundles', BundleRule, BUNDLE_FIELDS, 'bundles', 'bundle');
addPromotionRoutes('/discounts', DiscountCode, DISCOUNT_FIELDS, 'discounts', 'discount');

adminConfigurationRoutes.get('/shipping', wrap(async (req, res) => {
  const configuration = await ShippingConfig.findOne({ key: 'egypt-v1' }).lean().maxTimeMS(3000);
  respond(res, { governorates: GOVERNORATES, configuration: configuration ? adminRecord(configuration) : { key: 'egypt-v1', cairoGizaPiastres: 9000, otherGovernoratesPiastres: 12000, approved: false, revision: 0 } });
}));
adminConfigurationRoutes.patch('/shipping', wrap(async () => {
  throw configurationError('Delivery is confirmed per order after checkout. Global checkout rates cannot be approved.', 'SHIPPING_POLICY_CHANGED', 409);
}));

adminConfigurationRoutes.patch('/products/:id/configuration', wrap(async (req, res) => {
  const id = idParam(req);
  const { values, expectedRevision } = revisionBody(req.body, ['personalization', 'customization']);
  const product = await auditedMutation(req, 'product.configuration.updated', id, async (session) => {
    const record = await findRecord(Product, id, session);
    await prepareAdminRevision(record, expectedRevision, { session });
    record.set(values);
    const customization = record.customization;
    if (customization.enabled || customization.serviceEntryEligible) {
      const template = await CustomizationTemplate.findById(customization.templateId).session(session).lean().maxTimeMS(3000);
      if (!template || template.status !== 'approved' || !template.active || template.kind !== customization.serviceKind) throw configurationError('Select an active approved template with the matching service kind.');
    }
    record.commerceRevision += 1;
    await record.validate();
    return record.save({ session });
  });
  respond(res, { product: { _id: String(product._id), name: product.name, slug: product.slug, status: product.status, personalization: product.personalization, customization: product.customization, revision: product.__v ?? 0 } });
}));
