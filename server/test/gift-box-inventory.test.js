import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestDatabase } from './helpers/database.js';
import { env } from '../src/config/env.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { FIXED_COMPONENTS, getFixedComponent, RIBBON_COLORS } from '../../shared/gift-box/definitions.mjs';
import { calculateEstimate } from '../src/gift-box/pricing.js';
import { inventoryEligibility } from '../src/gift-box/inventory.js';
import { getBuilderSetting, updateBuilderSetting } from '../src/gift-box/catalog.js';
import { INITIAL_SETTINGS, INITIAL_SETTINGS_VERSION, provisionInitialSettings, validateInitialSettings } from '../scripts/lib/gift-box-initial-settings.js';
import { parseProvisionArguments, runInitialProvision } from '../scripts/provision-gift-box-settings.js';

let database, admin;
const originalEnabled = env.giftBoxBuilderBackendEnabled;
const approved = (id, patch = {}) => ({ componentId: id, displayName: 'Isolated fixture', enabled: true, available: true,
  inventoryMode: getFixedComponent(id).category === 'ribbon' ? 'status_only' : 'tracked',
  inventoryQuantity: getFixedComponent(id).category === 'ribbon' ? null : 10,
  pricePiastres: 100, priceApproval: 'paid', priceApprovedBy: '507f1f77bcf86cd799439011', priceApprovedAt: new Date(), __v: 1, ...patch });
const save = (id, patch, expectedRevision = 0) => updateBuilderSetting(id, { expectedRevision, ...patch }, admin);
before(async () => {
  database = await startTestDatabase({ transactions: true });
  await GiftBoxComponentSetting.createCollection(); await GiftBoxComponentSetting.createIndexes();
  admin = await User.create({ name: 'Isolated inventory administrator', email: 'inventory@example.test', passwordHash: 'fixture', role: 'admin' });
});
beforeEach(async () => { env.giftBoxBuilderBackendEnabled = true; await GiftBoxComponentSetting.deleteMany({}); await AdminAudit.deleteMany({}); });
after(async () => { env.giftBoxBuilderBackendEnabled = originalEnabled; await database?.stop(); });

test('the explicit initial plan contains precisely the approved names, prices and quantities', () => {
  assert.equal(validateInitialSettings(), true);
  assert.equal(INITIAL_SETTINGS.length, 74);
  for (const item of INITIAL_SETTINGS) {
    const definition = getFixedComponent(item.componentId);
    const expectedPrice = { box: 20000, flower: 3000, plush: 50000, chocolate: 10000, ribbon: 5000, gift_card: 5000 }[definition.category];
    assert.equal(item.pricePiastres, expectedPrice);
    assert.equal(item.inventoryQuantity, definition.category === 'ribbon' ? null : definition.category === 'flower' ? 50 : 10);
    assert.equal(item.inventoryMode, definition.category === 'ribbon' ? 'status_only' : 'tracked');
    assert.equal(item.displayOrder, definition.initialDisplayOrder);
    assert.equal(item.available, true); assert.equal(item.enabled, true);
    if (definition.sourceNumber) assert.equal(item.displayName, `${{ box: 'Box', plush: 'Plush', chocolate: 'Chocolate' }[definition.category]} ${definition.sourceNumber}`);
  }
  assert.deepEqual(INITIAL_SETTINGS.filter(item => item.componentId.startsWith('rose-')).map(item => item.displayName), ['Red Rose', 'Yellow Rose', 'Black Rose']);
  assert.equal(INITIAL_SETTINGS.find(item => item.componentId === 'gift-card-1').displayName, 'Gift Card');
  assert.throws(() => validateInitialSettings([...INITIAL_SETTINGS.slice(1), { ...INITIAL_SETTINGS[0], componentId: 'unknown' }]));
  assert.throws(() => validateInitialSettings(INITIAL_SETTINGS.map(item => item.componentId === 'chocolate-1' ? { ...item, pricePiastres: null } : item)));
});
test('21 immutable ribbon colors preserve unique order, distinct shades and image-less identities', () => {
  const definitions = FIXED_COMPONENTS.filter(item => item.category === 'ribbon');
  assert.equal(definitions.length, 21); assert.equal(RIBBON_COLORS.length, 21);
  assert.equal(new Set(definitions.map(item => item.approvedColorHex)).size, 21);
  assert.equal(definitions.filter(item => item.id === 'ribbon-navy').length, 1);
  definitions.forEach((definition, index) => {
    assert.equal(definition.initialDisplayOrder, index + 1); assert.match(definition.approvedColorHex, /^#[A-F0-9]{6}$/);
    assert.equal(definition.selectionAsset, null); assert.equal(definition.placementAsset, null);
    assert.equal('pricePiastres' in definition, false); assert.equal('displayName' in definition, false);
  });
});
test('offline provisioning never connects, requires explicit apply authorization, and rejects production', async () => {
  const plan = await runInitialProvision(parseProvisionArguments([]));
  assert.equal(plan.connected, false); assert.equal(plan.writes, false);
  assert.equal(plan.settings.length, 74);
  assert.throws(() => parseProvisionArguments(['--apply']));
  assert.throws(() => parseProvisionArguments(['--target', 'production']));
  await assert.rejects(provisionInitialSettings(admin), /authorization/);
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
});
test('provisioning is create-only, audited, revision-aware and idempotent without overwriting owner edits', async () => {
  await save('box-2', { displayName: 'Owner changed this', pricePiastres: 34567, inventoryMode: 'made_to_order', available: false, enabled: false });
  const before = await GiftBoxComponentSetting.findOne({ componentId: 'box-2' }).lean();
  const first = await provisionInitialSettings(admin, { authorized: true });
  assert.equal(first.created.length, 73); assert.deepEqual(first.skipped, ['box-2']);
  assert.deepEqual(await GiftBoxComponentSetting.findOne({ componentId: 'box-2' }).lean(), before);
  assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.initial_settings.provisioned' }), 1);
  const allBefore = await GiftBoxComponentSetting.find().sort('componentId').lean();
  assert.ok(allBefore.every(item => item.__v === 1));
  const card = allBefore.find(item => item.componentId === 'gift-card-1');
  assert.equal(card.pricePiastres, 5000); assert.equal(card.initialProvisioningVersion, INITIAL_SETTINGS_VERSION);
  assert.ok(card.initialProvisionedAt); assert.equal(String(card.priceApprovedBy), String(admin._id));
  const second = await provisionInitialSettings(admin, { authorized: true });
  assert.deepEqual(second.created, []); assert.equal(second.skipped.length, 74);
  assert.deepEqual(await GiftBoxComponentSetting.find().sort('componentId').lean(), allBefore);
  assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.initial_settings.provisioned' }), 1);
  await assert.rejects(save('gift-card-1', { displayName: 'Stale virtual zero' }), { code: 'EDIT_CONFLICT' });
});
test('provision audit failure rolls back every newly created setting', async () => {
  const original = AdminAudit.create;
  AdminAudit.create = async () => { throw new Error('Isolated audit failure'); };
  try { await assert.rejects(provisionInitialSettings(admin, { authorized: true }), /Isolated/); }
  finally { AdminAudit.create = original; }
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
});
test('runtime has no initial fallback and only explicitly provisioned chocolate/ribbons receive approved prices', async () => {
  assert.throws(() => calculateEstimate({ boxId: 'box-2' }, []), { code: 'GIFT_BOX_COMPONENT_UNAVAILABLE' });
  const missing = await getBuilderSetting('gift-card-1');
  assert.equal(missing.pricePiastres, null); assert.equal(missing.inventoryMode, null); assert.equal(missing.availableForEstimate, false);
  await provisionInitialSettings(admin, { authorized: true });
  for (const id of ['chocolate-1', 'ribbon-navy']) {
    const component = await getBuilderSetting(id);
    assert.equal(component.pricePiastres, id === 'chocolate-1' ? 10000 : 5000); assert.equal(component.availableForEstimate, true);
  }
  const settings = await GiftBoxComponentSetting.find().lean();
  assert.equal(calculateEstimate({ boxId: 'box-2', ribbonId: 'ribbon-navy' }, settings).componentSubtotalPiastres, 25000);
  assert.equal(calculateEstimate({ boxId: 'box-2', items: [{ componentId: 'chocolate-1', quantity: 1 }] }, settings).componentSubtotalPiastres, 30000);
  assert.equal(calculateEstimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 2 }, { componentId: 'plush-1', quantity: 1 }], giftCard: { componentId: 'gift-card-1', message: '' } }, settings).componentSubtotalPiastres, 81000);
  assert.equal(calculateEstimate({ boxId: 'box-2' }, settings).componentSubtotalPiastres, 20000);
  assert.equal(calculateEstimate({ boxId: 'box-2', giftCard: { componentId: 'gift-card-1' } }, settings).componentSubtotalPiastres, 25000);
});

test('corrected provisioning skips saved null chocolate and ribbon prices without backfilling owner settings', async () => {
  for (const id of ['chocolate-1', 'ribbon-navy']) await save(id, { displayName: `Owner pending ${id}`, pricePiastres: null, enabled: false });
  const pendingBefore = await GiftBoxComponentSetting.find().sort('componentId').lean();
  const first = await provisionInitialSettings(admin, { authorized: true });
  assert.equal(first.created.length, 72);
  assert.deepEqual(first.skipped, ['chocolate-1', 'ribbon-navy']);
  assert.deepEqual(await GiftBoxComponentSetting.find({ componentId: { $in: first.skipped } }).sort('componentId').lean(), pendingBefore);
  for (const id of first.skipped) {
    const component = await getBuilderSetting(id);
    assert.equal(component.pricePiastres, null); assert.equal(component.availableForEstimate, false);
  }
  const beforeRepeat = await GiftBoxComponentSetting.find().sort('componentId').lean();
  const auditCount = await AdminAudit.countDocuments();
  const second = await provisionInitialSettings(admin, { authorized: true });
  assert.equal(second.created.length, 0); assert.equal(second.skipped.length, 74);
  assert.deepEqual(await GiftBoxComponentSetting.find().sort('componentId').lean(), beforeRepeat);
  assert.equal(await AdminAudit.countDocuments(), auditCount);
});

test('builder chocolate settings and ordinary Product stock remain independently owned despite matching names and IDs', async () => {
  const product = await Product.create({ name: 'Chocolate 1', slug: 'isolated-builder-stock-chocolate', externalCatalogId: 'chocolate-1',
    sku: 'chocolate-1', categoryId: new mongoose.Types.ObjectId(), inventory: { mode: 'tracked', quantity: 37, approved: true, available: true } });
  const ordinaryBefore = await Product.findById(product._id).lean();
  const productCount = await Product.countDocuments();
  await provisionInitialSettings(admin, { authorized: true });
  assert.equal(await Product.countDocuments(), productCount);
  assert.deepEqual(await Product.findById(product._id).lean(), ordinaryBefore);
  await save('chocolate-1', { displayName: 'Chocolate 1', inventoryQuantity: 7 }, 1);
  assert.deepEqual(await Product.findById(product._id).lean(), ordinaryBefore);
  const builderBefore = await GiftBoxComponentSetting.findOne({ componentId: 'chocolate-1' }).lean();
  product.inventory.quantity = 29;
  await product.save();
  assert.deepEqual(await GiftBoxComponentSetting.findOne({ componentId: 'chocolate-1' }).lean(), builderBefore);
  const estimate = calculateEstimate({ boxId: 'box-2', items: [{ componentId: 'chocolate-1', quantity: 7 }] }, await GiftBoxComponentSetting.find().lean());
  assert.equal(estimate.items.find(item => item.componentId === 'chocolate-1').inventoryQuantity, 7);
  assert.deepEqual(await GiftBoxComponentSetting.findOne({ componentId: 'chocolate-1' }).lean(), builderBefore);
  assert.equal((await Product.findById(product._id).lean()).inventory.quantity, 29);
});
test('tracked inventory validates quantity, zero stock, and missing inventory without stock deductions', () => {
  const selected = { boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 3 }] };
  const settings = [approved('box-2'), approved('rose-red', { inventoryQuantity: 3 })];
  assert.equal(calculateEstimate(selected, settings).componentSubtotalPiastres, 400);
  assert.equal(settings[1].inventoryQuantity, 3);
  assert.throws(() => calculateEstimate({ ...selected, items: [{ componentId: 'rose-red', quantity: 4 }] }, settings), { code: 'GIFT_BOX_STOCK_EXCEEDED' });
  for (const patch of [{ inventoryQuantity: 0 }, { inventoryQuantity: -1 }, { inventoryQuantity: null }, { inventoryMode: null }, { available: false }]) {
    assert.throws(() => calculateEstimate({ boxId: 'box-2' }, [approved('box-2', patch)]));
  }
});
test('switching to made-to-order preserves stored stock and returning to tracked requires confirmation', async () => {
  await save('box-2', { inventoryMode: 'tracked', inventoryQuantity: 8, confirmInventoryQuantity: true, available: true, enabled: true, pricePiastres: 20000 });
  await save('box-2', { inventoryMode: 'made_to_order' }, 1);
  let result = await getBuilderSetting('box-2');
  assert.equal(result.inventoryQuantity, 8); assert.equal(result.availableForEstimate, true);
  await assert.rejects(save('box-2', { inventoryMode: 'tracked' }, 2), { code: 'GIFT_BOX_STOCK_CONFIRMATION_REQUIRED' });
  await assert.rejects(save('box-2', { inventoryMode: 'tracked', inventoryQuantity: 9 }, 2), { code: 'GIFT_BOX_STOCK_CONFIRMATION_REQUIRED' });
  await assert.rejects(save('box-2', { inventoryQuantity: 5 }, 2), { code: 'GIFT_BOX_STOCK_MODE' });
  await save('box-2', { inventoryMode: 'tracked', inventoryQuantity: 9, confirmInventoryQuantity: true }, 2);
  result = await getBuilderSetting('box-2'); assert.equal(result.inventoryMode, 'tracked'); assert.equal(result.inventoryQuantity, 9);
  const madeToOrder = approved('rose-red', { inventoryMode: 'made_to_order', inventoryQuantity: 0 });
  assert.equal(calculateEstimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 100 }] }, [approved('box-2'), madeToOrder]).items[1].quantity, 100);
  assert.equal(inventoryEligibility(getFixedComponent('rose-red'), { ...madeToOrder, available: false }).eligible, false);
});
test('dynamic owner edits preserve approval, audit and conflict protection', async () => {
  await save('gift-card-1', { displayName: 'Saved card', pricePiastres: 5000, available: true, enabled: true, inventoryMode: 'tracked', inventoryQuantity: 10, confirmInventoryQuantity: true });
  const results = await Promise.allSettled([save('gift-card-1', { inventoryQuantity: 2, displayName: 'Updated card', pricePiastres: 6000 }, 1), save('gift-card-1', { inventoryQuantity: 7 }, 1)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'EDIT_CONFLICT');
  const current = await getBuilderSetting('gift-card-1'); assert.equal(current.revision, 2);
  await save('gift-card-1', { inventoryQuantity: 4, displayName: 'Final owner name', pricePiastres: 6500 }, 2);
  const final = await getBuilderSetting('gift-card-1'); assert.equal(final.inventoryQuantity, 4); assert.equal(final.displayName, 'Final owner name'); assert.equal(final.pricePiastres, 6500);
  assert.equal(await AdminAudit.countDocuments(), 3);
});
test('ribbons enforce status-only stock in service and schema while allowing dynamic price/name/status', async () => {
  for (const patch of [{ inventoryMode: 'tracked' }, { inventoryMode: 'made_to_order' }, { inventoryQuantity: 10 }]) {
    await assert.rejects(save('ribbon-navy', patch), { code: 'GIFT_BOX_RIBBON_INVENTORY' });
  }
  await save('ribbon-navy', { displayName: 'Owner Navy', pricePiastres: 1250, available: true, enabled: true });
  const saved = await getBuilderSetting('ribbon-navy'); assert.equal(saved.inventoryMode, 'status_only'); assert.equal(saved.inventoryQuantity, null); assert.equal(saved.availableForEstimate, true);
  const estimate = calculateEstimate({ boxId: 'box-2', ribbonId: 'ribbon-navy' }, [approved('box-2'), approved('ribbon-navy')]);
  assert.equal(estimate.items[1].colorHex, getFixedComponent('ribbon-navy').approvedColorHex);
  await save('ribbon-navy', { available: false }, 1); assert.equal((await getBuilderSetting('ribbon-navy')).availableForEstimate, false);
  await assert.rejects(new GiftBoxComponentSetting({ componentId: 'ribbon-navy', displayOrder: 1, inventoryMode: 'tracked', inventoryQuantity: 10, createdBy: admin._id, updatedBy: admin._id }).validate());
});
test('invalid stock, forged metadata and unconfirmed mode changes fail without a write', async () => {
  for (const inventoryQuantity of [-1, 1.5, '10', Number.MAX_SAFE_INTEGER + 1, null]) await assert.rejects(save('box-2', { inventoryMode: 'tracked', inventoryQuantity, confirmInventoryQuantity: true }));
  for (const field of ['initialProvisioningVersion', 'initialProvisionedAt', 'approvedColorHex', 'inventoryStatus']) await assert.rejects(save('box-2', { displayName: 'Forgery', [field]: 'forged' }));
  await assert.rejects(save('box-unknown', { inventoryMode: 'made_to_order' }), { code: 'GIFT_BOX_COMPONENT_UNKNOWN' });
  await assert.rejects(updateBuilderSetting('box-2', { expectedRevision: 0, inventoryQuantity: 4 }, { _id: new mongoose.Types.ObjectId(), role: 'customer' }), { code: 'ADMIN_REQUIRED' });
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
});
