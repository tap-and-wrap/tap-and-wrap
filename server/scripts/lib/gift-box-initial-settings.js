// Owner-approved starting values belong ONLY to this explicit provisioning tool.
// Runtime catalog/pricing code must never import this file or fall back to this plan.
import { FIXED_COMPONENTS, getFixedComponent, deepFreeze } from '../../../shared/gift-box/definitions.mjs';

export const INITIAL_SETTINGS_VERSION = 'gift-box-owner-initial-2026-10-28.2';
const ribbonNames = ['Cream / Ivory', 'Blush Pink', 'Champagne', 'White', 'Burgundy / Dark Red', 'Dusty Pink',
  'Mint', 'Coral / Soft Pink-Red', 'Red', 'Navy', 'Black', 'Grey-Blue / Blue-Grey', 'Mint Green',
  'Classic Green', 'Emerald', 'Baby Blue', 'Silver', 'Gold', 'Lavender', 'Beige', 'Peach'];
// Pin the authorization set: a future registry addition must not inherit approval.
const approvedIds = [
  ...Array.from({ length: 12 }, (_, i) => `box-${i + 1}`), 'rose-red', 'rose-yellow', 'rose-black',
  ...Array.from({ length: 17 }, (_, i) => `plush-${i + 1}`),
  ...Array.from({ length: 20 }, (_, i) => `chocolate-${i + 1}`),
  ...['cream-ivory', 'blush-pink', 'champagne', 'white', 'burgundy-dark-red', 'dusty-pink', 'mint',
    'coral-soft-pink-red', 'red', 'navy', 'black', 'grey-blue', 'mint-green', 'classic-green', 'emerald',
    'baby-blue', 'silver', 'gold', 'lavender', 'beige', 'peach'].map(key => `ribbon-${key}`), 'gift-card-1',
];
export const INITIAL_SETTINGS = deepFreeze(approvedIds.map(id => {
  const definition = getFixedComponent(id);
  if (!definition) throw new Error('An owner-approved initial identity is missing from the fixed registry.');
  const base = { componentId: definition.id, displayOrder: definition.initialDisplayOrder, enabled: true, available: true };
  switch (definition.category) {
    case 'box': return { ...base, displayName: `Box ${definition.sourceNumber}`, pricePiastres: 20000, inventoryMode: 'tracked', inventoryQuantity: 10 };
    case 'plush': return { ...base, displayName: `Plush ${definition.sourceNumber}`, pricePiastres: 50000, inventoryMode: 'tracked', inventoryQuantity: 10 };
    case 'flower': return { ...base, displayName: ({ 'rose-red': 'Red Rose', 'rose-yellow': 'Yellow Rose', 'rose-black': 'Black Rose' })[definition.id], pricePiastres: 3000, inventoryMode: 'tracked', inventoryQuantity: 50 };
    case 'chocolate': return { ...base, displayName: `Chocolate ${definition.sourceNumber}`, pricePiastres: 10000, inventoryMode: 'tracked', inventoryQuantity: 10 };
    case 'ribbon': return { ...base, displayName: ribbonNames[definition.initialDisplayOrder - 1], pricePiastres: 5000, inventoryMode: 'status_only', inventoryQuantity: null };
    case 'gift_card': return { ...base, displayName: 'Gift Card', pricePiastres: 5000, inventoryMode: 'tracked', inventoryQuantity: 10 };
    default: throw new Error('No approved initial settings exist for this fixed category.');
  }
}));

export function validateInitialSettings(plan = INITIAL_SETTINGS) {
  const known = new Set(FIXED_COMPONENTS.map(item => item.id));
  const ids = plan.map(item => item.componentId);
  if (ids.length !== approvedIds.length || new Set(ids).size !== approvedIds.length
    || ids.some(id => !known.has(id) || !approvedIds.includes(id))) throw new Error('The initial plan must contain the explicitly approved known identities exactly once.');
  for (const item of plan) {
    if (!item.displayName || !Number.isSafeInteger(item.displayOrder) || item.displayOrder < 0
      || !Number.isSafeInteger(item.pricePiastres) || item.pricePiastres <= 0
      || typeof item.enabled !== 'boolean' || typeof item.available !== 'boolean') throw new Error('Invalid approved initial business values.');
  }
  return true;
}

export async function provisionInitialSettings(actor, { authorized = false } = {}) {
  // Imports are deferred so an offline plan never loads credentials or connects.
  const [{ default: mongoose }, { env }, { assertDatabaseWriteAllowed }, { verifyDatabaseSchema }, { GiftBoxComponentSetting }, { User }, { recordAdminAudit }] = await Promise.all([
    import('mongoose'), import('../../src/config/env.js'), import('../../src/config/database-safety.js'),
    import('../../src/config/schema.js'), import('../../src/models/GiftBoxComponentSetting.js'),
    import('../../src/models/User.js'), import('../../src/commerce/audit.js'),
  ]);
  if (authorized !== true || env.nodeEnv === 'production' || !['local', 'staging'].includes(env.databaseTarget)) throw new Error('Explicit non-production initial-settings authorization is required.');
  validateInitialSettings();
  assertDatabaseWriteAllowed(GiftBoxComponentSetting.db, env);
  await verifyDatabaseSchema(env, { models: [GiftBoxComponentSetting], timeoutMs: 3000 });
  if (!mongoose.isObjectIdOrHexString(actor?._id) || actor.role !== 'admin' || actor.active === false
    || !await User.exists({ _id: actor._id, role: 'admin', active: true })) throw new Error('A current verified administrator is required.');
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      assertDatabaseWriteAllowed(GiftBoxComponentSetting.db, env);
      const existing = new Set((await GiftBoxComponentSetting.find({ componentId: { $in: INITIAL_SETTINGS.map(item => item.componentId) } }).select('componentId').session(session).lean()).map(item => item.componentId));
      const created = [], skipped = [];
      for (const item of INITIAL_SETTINGS) {
        if (existing.has(item.componentId)) { skipped.push(item.componentId); continue; }
        const now = new Date();
        const setting = new GiftBoxComponentSetting({ ...item, priceApproval: item.pricePiastres === null ? 'pending' : 'paid',
          priceApprovedBy: item.pricePiastres === null ? null : actor._id, priceApprovedAt: item.pricePiastres === null ? null : now,
          createdBy: actor._id, updatedBy: actor._id, __v: 1,
          initialProvisioningVersion: INITIAL_SETTINGS_VERSION, initialProvisionedAt: now });
        await setting.save({ session });
        const claim = await GiftBoxComponentSetting.updateOne({ _id: setting._id, __v: 0 }, { $inc: { __v: 1 } }, { session });
        if (claim.matchedCount !== 1) throw new Error('Initial-settings revision conflict; no automatic overwrite is permitted.');
        created.push(item.componentId);
      }
      if (created.length) await recordAdminAudit(actor, { action: 'gift_box.initial_settings.provisioned', resourceType: 'configuration', resourceId: INITIAL_SETTINGS_VERSION,
        details: { version: INITIAL_SETTINGS_VERSION, createdCount: created.length, skippedCount: skipped.length } }, { session });
      result = { version: INITIAL_SETTINGS_VERSION, created, skipped, existingSettingsOverwritten: false };
    });
    return result;
  } finally { await session.endSession(); }
}
