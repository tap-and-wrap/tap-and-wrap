import mongoose from 'mongoose';
import { FIXED_COMPONENTS, CATALOG_VERSION, PENDING_CATEGORIES } from '../../../shared/gift-box/definitions.mjs';
import { GiftBoxComponentSetting } from '../models/GiftBoxComponentSetting.js';
import { env } from '../config/env.js';
import { verifyDatabaseSchema } from '../config/schema.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { assertExpectedRevision } from '../utils/admin-revision.js';
import { recordAdminAudit } from '../commerce/audit.js';
import { approvedPrice, calculateEstimate, requireComponent, selectionLines } from './pricing.js';
import { builderError, catalogQuery, reorderInput, settingPatch } from './validation.js';
import { applyInventoryPatch, inventoryEligibility } from './inventory.js';
import { publishedBoxSelectionLimits, assertBoxSelectionLimits } from './limits.js';

export async function ensureBuilderBackend() {
  if (!env.giftBoxBuilderBackendEnabled) throw builderError(404, 'GIFT_BOX_BACKEND_DISABLED', 'The builder backend is not enabled.');
  // Read-only guard also prevents an upsert from implicitly creating an unprepared collection.
  await verifyDatabaseSchema(env, { models: [GiftBoxComponentSetting], timeoutMs: 3000 });
}
function requireActor(actor) {
  if (actor?.role !== 'admin' || actor.active === false || !mongoose.isObjectIdOrHexString(actor._id)) throw builderError(403, 'ADMIN_REQUIRED', 'Admin authorization is required.');
}
function present(definition, setting, admin = false) {
  const price = approvedPrice(setting);
  const inventory = inventoryEligibility(definition, setting);
  return { componentId: definition.id, category: definition.category,
    displayName: setting?.displayName ?? null, displayOrder: setting?.displayOrder ?? definition.initialDisplayOrder,
    enabled: setting?.enabled === true, pricePiastres: price, pricing: price === null ? 'pending' : setting.priceApproval,
    available: setting?.available === true, inventoryMode: setting?.inventoryMode ?? null,
    inventoryQuantity: definition.category === 'ribbon' ? null : setting?.inventoryQuantity ?? null,
    inventoryStatus: inventory.reason ?? 'available',
    availableForEstimate: setting?.enabled === true && price !== null && inventory.eligible,
    ...(definition.category === 'ribbon' ? { approvedColorHex: definition.approvedColorHex } : {}),
    ...(admin ? { revision: setting?.__v ?? 0, configured: Boolean(setting),
      createdAt: setting?.createdAt ?? null, updatedAt: setting?.updatedAt ?? null,
      priceApprovedAt: setting?.priceApprovedAt ?? null } : {}) };
}
export async function listBuilderComponents(rawQuery, { admin = false } = {}) {
  await ensureBuilderBackend();
  const input = catalogQuery.parse(rawQuery);
  const definitions = FIXED_COMPONENTS.filter(item => !input.category || item.category === input.category);
  const settings = await GiftBoxComponentSetting.find({ componentId: { $in: definitions.map(item => item.id) } }).lean().maxTimeMS(3000);
  const byId = new Map(settings.map(item => [item.componentId, item]));
  const boxLimits = await publishedBoxSelectionLimits();
  const categories = ['box', 'flower', 'plush', 'chocolate', 'ribbon', 'gift_card'];
  const ordered = [...definitions].sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category)
    || (byId.get(a.id)?.displayOrder ?? a.initialDisplayOrder) - (byId.get(b.id)?.displayOrder ?? b.initialDisplayOrder)
    || a.initialDisplayOrder - b.initialDisplayOrder || a.id.localeCompare(b.id));
  return { catalogVersion: CATALOG_VERSION, boxLimits, components: ordered.slice((input.page - 1) * input.limit, input.page * input.limit).map(item => present(item, byId.get(item.id), admin)),
    pagination: { page: input.page, limit: input.limit, total: ordered.length, pages: Math.ceil(ordered.length / input.limit) },
    pendingCategories: Object.keys(PENDING_CATEGORIES).filter(key => !FIXED_COMPONENTS.some(item => item.category === key)),
    arrangementApproved: false, submissionAllowed: false, orderConversionAllowed: false };
}
export async function getBuilderSetting(id) {
  await ensureBuilderBackend();
  const definition = requireComponent(id, ['box', 'flower', 'plush', 'chocolate', 'ribbon', 'gift_card']);
  const setting = await GiftBoxComponentSetting.findOne({ componentId: id }).lean().maxTimeMS(3000);
  return present(definition, setting, true);
}

async function transaction(actor, operation) {
  requireActor(actor);
  await ensureBuilderBackend();
  assertDatabaseWriteAllowed(GiftBoxComponentSetting.db, env);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      assertDatabaseWriteAllowed(GiftBoxComponentSetting.db, env);
      result = await operation(session);
    });
    return result;
  } catch (error) {
    if (error.code === 11000 || error instanceof mongoose.Error.VersionError) throw builderError(409, 'EDIT_CONFLICT', 'The setting changed. Reload it before saving; your draft has not been applied.');
    throw error;
  } finally { await session.endSession(); }
}
async function saveSetting(id, patch, actor, session) {
  const definition = requireComponent(id, ['box', 'flower', 'plush', 'chocolate', 'ribbon', 'gift_card']);
  let setting = await GiftBoxComponentSetting.findOne({ componentId: id }).session(session).maxTimeMS(3000);
  assertExpectedRevision(setting ?? { __v: 0 }, patch.expectedRevision);
  if (!setting) setting = new GiftBoxComponentSetting({ componentId: id, displayOrder: definition.initialDisplayOrder, createdBy: actor._id, updatedBy: actor._id });
  const creating = setting.isNew;
  for (const key of ['displayName', 'displayOrder', 'enabled', 'available']) if (Object.hasOwn(patch, key)) setting[key] = patch[key];
  applyInventoryPatch(definition, setting, patch);
  if (Object.hasOwn(patch, 'pricePiastres')) {
    setting.pricePiastres = patch.pricePiastres;
    setting.priceApproval = patch.pricePiastres === null ? 'pending' : patch.pricePiastres === 0 ? 'complimentary' : 'paid';
    setting.priceApprovedBy = patch.pricePiastres === null ? null : actor._id;
    setting.priceApprovedAt = patch.pricePiastres === null ? null : new Date();
  }
  setting.updatedBy = actor._id;
  // Ensure even a same-value save consumes the loaded revision, atomically with its audit.
  setting.markModified('updatedBy');
  await setting.save({ session });
  // Mongoose initializes inserted version keys to zero. Consume the virtual
  // missing-record revision inside the same transaction so stale zero cannot win.
  if (creating) {
    const claimed = await GiftBoxComponentSetting.updateOne({ _id: setting._id, __v: 0 }, { $inc: { __v: 1 } }, { session });
    if (claimed.matchedCount !== 1) throw builderError(409, 'EDIT_CONFLICT', 'The setting changed during its first save. Reload before retrying.');
    setting.__v = 1;
  }
  return present(definition, setting.toObject(), true);
}
export async function updateBuilderSetting(id, raw, actor) {
  requireActor(actor);
  const input = settingPatch.parse(raw);
  return transaction(actor, async session => {
    const setting = await saveSetting(id, input, actor, session);
    await recordAdminAudit(actor, { action: 'gift_box.component.updated', resourceType: 'configuration', resourceId: `gift-box:${id}`,
      details: { componentId: id, revision: setting.revision, changedFields: Object.keys(input).filter(key => key !== 'expectedRevision'), pricing: setting.pricing } }, { session });
    return setting;
  });
}
export async function reorderBuilderCategory(raw, actor) {
  requireActor(actor);
  const input = reorderInput.parse(raw);
  return transaction(actor, async session => {
    const components = [];
    for (const [index, item] of input.items.entries()) components.push(await saveSetting(item.componentId, { expectedRevision: item.expectedRevision, displayOrder: index + 1 }, actor, session));
    await recordAdminAudit(actor, { action: 'gift_box.category.reordered', resourceType: 'configuration', resourceId: `gift-box:category:${input.category}`,
      details: { category: input.category, count: components.length } }, { session });
    return { category: input.category, components };
  });
}
export async function estimateBuilderSelection(raw) {
  await ensureBuilderBackend();
  const { input, lines } = selectionLines(raw);
  const session = await mongoose.startSession();
  try {
    let result;
    // Coherent price snapshot across all selected settings; no writes or inventory claims.
    await session.withTransaction(async () => {
      const boxLimits = await publishedBoxSelectionLimits([input.boxId], { session });
      assertBoxSelectionLimits(input, boxLimits);
      const settings = await GiftBoxComponentSetting.find({ componentId: { $in: lines.map(line => line.definition.id) } }).session(session).lean().maxTimeMS(3000);
      result = calculateEstimate(input, settings);
    }, { readConcern: { level: 'snapshot' } });
    return result;
  } finally { await session.endSession(); }
}
