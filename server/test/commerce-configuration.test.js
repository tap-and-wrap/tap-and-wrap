import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import DiscountCode from '../src/models/DiscountCode.js';
import BundleRule from '../src/models/BundleRule.js';
import { evaluateCustomization, componentAvailable, publicTemplatePresentation } from '../src/commerce/customization.js';
import { evaluatePromotions, GOVERNORATES, shippingForGovernorate, claimDiscountRedemption } from '../src/commerce/promotions.js';

const id = () => new mongoose.Types.ObjectId();
function component(overrides = {}) {
  return { _id: id(), name: 'Isolated chocolate fixture', enabledForCustomization: true, configurationApproved: true, priceApproved: true, pricePiastres: 1500, inventory: { mode: 'tracked', quantity: 10, available: true, approved: true }, ...overrides };
}
function template(optionComponent, overrides = {}) {
  return { _id: id(), key: 'test-box', name: 'Isolated gift-box template', version: 1, kind: 'gift_box', status: 'approved', active: true, pricingMode: 'additive', baseAdjustmentPiastres: 0, groups: [{ key: 'extras', label: 'Extras', minChoices: 1, maxChoices: 2, allowedActions: ['add', 'remove', 'replace'], options: [{ key: 'chocolate', label: 'Chocolate', componentId: optionComponent._id, active: true, minQuantity: 1, maxQuantity: 3, defaultQuantity: 0, priceAdjustmentPiastres: 100 }, { key: 'card', label: 'Card', componentId: null, active: true, minQuantity: 1, maxQuantity: 1, defaultQuantity: 0, priceAdjustmentPiastres: 200 }] }], fields: [{ key: 'message', label: 'Gift message', type: 'text', required: true, maxChars: 20 }, { key: 'photo', label: 'Photo', type: 'image', required: true, minFiles: 1, maxFiles: 1, maxBytes: 5242880, acceptedMimeTypes: ['image/png'] }], ...overrides };
}
function input(value, overrides = {}) {
  return { templateId: String(value._id), version: value.version, selections: [{ groupKey: 'extras', optionKey: 'chocolate', quantity: 2 }], fields: { message: 'Happy birthday' }, ...overrides };
}

test('gift-box quote uses approved component prices, configured adjustments and component quantities', () => {
  const chocolate = component();
  const config = template(chocolate);
  const quote = evaluateCustomization(config, [chocolate], input(config));
  assert.equal(quote.adjustmentPiastres, 3200);
  assert.deepEqual(quote.inventoryClaims, [{ kind: 'component', id: String(chocolate._id), variantKey: null, mode: 'tracked', quantityPerUnit: 2 }]);
  assert.equal(quote.snapshot.version, 1);
  assert.equal(quote.snapshot.fields.message, 'Happy birthday');
  assert.equal(quote.fields.find((field) => field.key === 'photo').required, true);
});

test('customization rejects unknown options, duplicate selections, excess quantities and stale versions', () => {
  const chocolate = component();
  const config = template(chocolate);
  for (const invalid of [
    input(config, { selections: [{ groupKey: 'extras', optionKey: 'unconfigured', quantity: 1 }] }),
    input(config, { selections: [{ groupKey: 'extras', optionKey: 'chocolate', quantity: 1 }, { groupKey: 'extras', optionKey: 'chocolate', quantity: 1 }] }),
    input(config, { selections: [{ groupKey: 'extras', optionKey: 'chocolate', quantity: 4 }] }),
    input(config, { selections: [] }),
    input(config, { version: 2 })
  ]) assert.throws(() => evaluateCustomization(config, [chocolate], invalid));
});

test('component approval, availability and stock gates reject provisional and unavailable components', () => {
  const chocolate = component();
  const config = template(chocolate);
  for (const patch of [{ configurationApproved: false }, { enabledForCustomization: false }, { priceApproved: false }, { inventory: { ...chocolate.inventory, approved: false } }, { inventory: { ...chocolate.inventory, available: false } }, { inventory: { ...chocolate.inventory, quantity: 1 } }]) {
    assert.throws(() => evaluateCustomization(config, [{ ...chocolate, ...patch }], input(config)));
  }
  assert.equal(componentAvailable(component({ inventory: { mode: 'made_to_order', quantity: null, available: true, approved: true } }), 20), true);
  const safe = publicTemplatePresentation(config, [{ ...chocolate, priceApproved: false }]);
  assert.equal(safe.groups[0].options[0].componentPricePiastres, null);
  assert.equal(safe.groups[0].options[0].available, false);
});

test('customize-this preserves original selections and delta pricing, only allowing configured actions', () => {
  const chocolate = component();
  const config = template(chocolate, { pricingMode: 'delta', fields: [] });
  config.groups[0].options[0].defaultQuantity = 1;
  assert.equal(evaluateCustomization(config, [chocolate], input(config, { selections: undefined, fields: {} })).adjustmentPiastres, 0);
  const changed = evaluateCustomization(config, [chocolate], input(config, { selections: [{ groupKey: 'extras', optionKey: 'card', quantity: 1 }], fields: {} }));
  assert.equal(changed.adjustmentPiastres, -1400);
  config.groups[0].allowedActions = ['replace'];
  assert.equal(evaluateCustomization(config, [chocolate], input(config, { selections: [{ groupKey: 'extras', optionKey: 'card', quantity: 1 }], fields: {} })).adjustmentPiastres, -1400);
  assert.throws(() => evaluateCustomization(config, [chocolate], input(config, { selections: [{ groupKey: 'extras', optionKey: 'chocolate', quantity: 2 }], fields: {} })));
});

test('engraving only permits explicit materials, fonts and placements with exact integer pricing', () => {
  const config = template(component(), { kind: 'laser_engraving', groups: [], fields: [], engraving: { materials: [{ key: 'wood', label: 'Wood', active: true, adjustmentPiastres: 300 }], fonts: [{ key: 'classic', label: 'Classic', active: true, adjustmentPiastres: 100 }], placements: [{ key: 'front', label: 'Front', active: true, adjustmentPiastres: 200 }], maxChars: 12, allowedTextLines: 1, maxCharsPerLine: 12, textRequired: true, baseAdjustmentPiastres: 1000, artworkAllowed: true, artworkRequired: false, artworkMaxFiles: 1, artworkMaxBytes: 5242880, artworkAcceptedMimeTypes: ['image/png'] } });
  const request = input(config, { selections: [], fields: { engraving_text: 'Hi ❤️', engraving_material: 'wood', engraving_font: 'classic', engraving_placement: 'front' } });
  const quote = evaluateCustomization(config, [], request);
  assert.equal(quote.adjustmentPiastres, 1000 + 300 + 100 + 200);
  assert.equal(quote.snapshot.engraving.engraving_material.key, 'wood');
  assert.equal(quote.fields.find((field) => field.key === 'engraving_artwork').maxFiles, 1);
  assert.throws(() => evaluateCustomization(config, [], { ...request, fields: { ...request.fields, engraving_material: 'plastic' } }));
  assert.throws(() => evaluateCustomization(config, [], { ...request, fields: { ...request.fields, engraving_text: 'this is too long' } }));
  assert.throws(() => evaluateCustomization(config, [], { ...request, fields: { ...request.fields, engraving_text: 'Hi\nThere' } }));
  assert.throws(() => evaluateCustomization(config, [], { ...request, fields: { ...request.fields, unknown: 'unsafe' } }));
});

test('customization model validates keys, limits, explicit engraving settings and delta defaults', async () => {
  const valid = new CustomizationTemplate({ key: 'test-laser', name: 'Isolated engraving', kind: 'laser_engraving', engraving: { materials: [{ key: 'wood', label: 'Wood' }], fonts: [{ key: 'classic', label: 'Classic' }] } });
  await valid.validate();
  await assert.rejects(new CustomizationTemplate({ key: 'bad-laser', name: 'Bad', kind: 'laser_engraving' }).validate());
  await assert.rejects(new CustomizationTemplate({ key: 'bad-groups', name: 'Bad', kind: 'gift_box', groups: [{ key: 'extras', label: 'Extras', minChoices: 2, maxChoices: 1, options: [{ key: 'one', label: 'One' }] }] }).validate());
  await assert.rejects(new CustomizationTemplate({ key: 'bad-delta', name: 'Bad', kind: 'tray', pricingMode: 'delta', groups: [{ key: 'extras', label: 'Extras', minChoices: 1, maxChoices: 1, options: [{ key: 'one', label: 'One', defaultQuantity: 0 }] }] }).validate());
});

test('all 27 governorates have validated integer shipping rates, with no international zone', () => {
  assert.equal(GOVERNORATES.length, 27);
  assert.equal(new Set(GOVERNORATES.map((value) => value.id)).size, 27);
  for (const governorate of GOVERNORATES) assert.equal(shippingForGovernorate(governorate.id).shippingPiastres, ['cairo', 'giza'].includes(governorate.id) ? 9000 : 12000);
  assert.equal(shippingForGovernorate('cairo', { approved: true, cairoGizaPiastres: 10000, otherGovernoratesPiastres: 15000 }).shippingPiastres, 10000);
  assert.throws(() => shippingForGovernorate('international'));
  assert.throws(() => shippingForGovernorate('cairo', { approved: false }));
});

const firstProduct = String(id());
const secondProduct = String(id());
const lines = [{ productId: firstProduct, quantity: 2, unitPricePiastres: 5000, lineTotalPiastres: 10000 }, { productId: secondProduct, quantity: 2, unitPricePiastres: 3000, lineTotalPiastres: 6000 }];
const bundle = () => ({ _id: id(), name: 'Isolated bundle', active: true, items: [{ productId: firstProduct, variantKey: null, quantity: 1 }, { productId: secondProduct, variantKey: null, quantity: 1 }], discountKind: 'percentage', discountValue: 1250, maxApplications: 2, priority: 1 });
const discount = (patch = {}) => ({ _id: id(), code: 'FIXTURE', name: 'Isolated discount', active: true, kind: 'fixed', value: 500, minimumSubtotalPiastres: 0, maximumDiscountPiastres: null, usageLimit: null, usedCount: 0, authenticatedOnly: false, stackWithBundles: false, productIds: [], categoryIds: [], ...patch });

test('bundle allocations are deterministic, disjoint, quantity-aware and capped', () => {
  const rule = bundle();
  const result = evaluatePromotions(lines, [rule, { ...rule, _id: id(), priority: 2 }]);
  assert.equal(result.subtotalPiastres, 16000);
  assert.equal(result.discountPiastres, 2000);
  assert.equal(result.totalPiastres, 14000);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].applications, 2);
});

test('discount calculations enforce stacking, expiry, eligibility, limits and nonnegative totals', () => {
  assert.throws(() => evaluatePromotions(lines, [bundle()], discount()));
  const stacked = evaluatePromotions(lines, [bundle()], discount({ stackWithBundles: true, kind: 'percentage', value: 1000 }));
  assert.equal(stacked.discountPiastres, 3400);
  assert.equal(stacked.totalPiastres, 12600);
  assert.equal(evaluatePromotions(lines, [], discount({ value: 100000 })).totalPiastres, 0);
  assert.throws(() => evaluatePromotions(lines, [], discount({ usageLimit: 1, usedCount: 1 })));
  assert.throws(() => evaluatePromotions(lines, [], discount({ authenticatedOnly: true })));
  assert.throws(() => evaluatePromotions(lines, [], discount({ endsAt: new Date(0) })));
  assert.throws(() => evaluatePromotions(lines, [], discount({ minimumSubtotalPiastres: 20000 })));
  assert.throws(() => evaluatePromotions(lines, [], discount({ productIds: [String(id())] })));
  assert.equal(evaluatePromotions(lines, [], discount({ productIds: [firstProduct], kind: 'percentage', value: 5000, maximumDiscountPiastres: 1000 })).discountPiastres, 1000);
  assert.throws(() => evaluatePromotions(lines, [], discount({ authenticatedOnly: true, perCustomerLimit: 1 }), { userId: String(id()), customerRedemptionCount: 1 }));
});

test('pricing rejects browser-shaped inconsistent totals and unsupported percentages', () => {
  assert.throws(() => evaluatePromotions([{ ...lines[0], lineTotalPiastres: 1 }]));
  assert.throws(() => evaluatePromotions([{ ...lines[0], unitPricePiastres: -1 }]));
  assert.equal(evaluatePromotions([{ ...lines[0], unitPricePiastres: 0, lineTotalPiastres: 0 }]).totalPiastres, 0);
  assert.throws(() => evaluatePromotions(lines, [], discount({ kind: 'percentage', value: 10001 })));
});

test('promotion models validate percentage basis points, authenticated limits and duplicate bundle entries', async () => {
  const unlimited = new DiscountCode({ code: 'TEST', name: 'Test', kind: 'percentage', value: 1500 });
  await unlimited.validate();
  assert.equal(unlimited.maximumDiscountPiastres, null);
  assert.equal(unlimited.usageLimit, null);
  assert.equal(unlimited.perCustomerLimit, null);
  await new DiscountCode({ code: 'LIMITED', name: 'Test', kind: 'fixed', value: 500, maximumDiscountPiastres: 1000, usageLimit: 10, perCustomerLimit: 1, authenticatedOnly: true }).validate();
  await assert.rejects(new DiscountCode({ code: 'TEST', name: 'Test', kind: 'percentage', value: 10001 }).validate());
  await assert.rejects(new DiscountCode({ code: 'TEST', name: 'Test', kind: 'fixed', value: 100, perCustomerLimit: 1, authenticatedOnly: false }).validate());
  await assert.rejects(new BundleRule({ name: 'Bad', items: [{ productId: firstProduct, quantity: 1 }, { productId: firstProduct, quantity: 1 }], discountKind: 'fixed', discountValue: 500 }).validate());
});

test('discount redemption refuses to mutate outside a checkout transaction', async () => {
  await assert.rejects(claimDiscountRedemption(id()), (error) => error.code === 'CHECKOUT_TRANSACTION_REQUIRED');
});

test('zero-priced approved bundle lines cannot cause division by zero or negative discounts', () => {
  const zeroLines = lines.map((line) => ({ ...line, unitPricePiastres: 0, lineTotalPiastres: 0 }));
  const result = evaluatePromotions(zeroLines, [bundle()]);
  assert.equal(result.subtotalPiastres, 0);
  assert.equal(result.discountPiastres, 0);
  assert.equal(result.totalPiastres, 0);
  assert.deepEqual(result.applied, []);
});

test('component inventory claims carry the price/availability fence without private object keys', () => {
  const chocolate = component({ updatedAt: new Date('2026-01-01T00:00:00Z'), mainImageKey: 'private/test.jpg' });
  const config = template(chocolate);
  const quote = evaluateCustomization(config, [chocolate], input(config));
  assert.equal(quote.inventoryClaims[0].expectedUpdatedAt, chocolate.updatedAt);
  assert.equal(JSON.stringify(quote).includes('private/test.jpg'), false);
});

test('approved template pricing cannot be edited in place through document save hooks', async () => {
  const configuration = CustomizationTemplate.hydrate({ _id: id(), key: 'immutable', name: 'Isolated template', kind: 'generic', version: 1, status: 'approved', active: true, groups: [], fields: [] });
  configuration.baseAdjustmentPiastres = 100;
  await assert.rejects(configuration.save(), /immutable/i);
});

test('specific bundle variants are allocated before wildcard entries of the same product', () => {
  const productId = String(id());
  const configured = { ...bundle(), maxApplications: 1, items: [{ productId, variantKey: null, quantity: 1 }, { productId, variantKey: 'red', quantity: 1 }] };
  const result = evaluatePromotions([{ productId, variantKey: 'red', quantity: 1, unitPricePiastres: 1000 }, { productId, variantKey: 'blue', quantity: 1, unitPricePiastres: 2000 }], [configured]);
  assert.equal(result.applied.length, 1);
  assert.equal(result.discountPiastres, 375);
});

test('valid stored hyphenated template fields and upper bounds remain supported without schema relaxation', async () => {
  const values = { key: 'contract-limits', name: 'Isolated limits', kind: 'laser_engraving', fields: [{ key: 'gift-message', label: 'Message', type: 'text', maxChars: 2000 }, { key: 'gift-photo', label: 'Photo', type: 'image', minFiles: 0, maxFiles: 10, maxBytes: 10485760, acceptedMimeTypes: ['image/png'] }], groups: [{ key: 'gift-extras', label: 'Extras', options: [{ key: 'gift-card', label: 'Card', minQuantity: 1, maxQuantity: 20, defaultQuantity: 20 }] }], engraving: { materials: [{ key: 'approved-metal', label: 'Approved metal' }], fonts: [{ key: 'approved-font', label: 'Approved font' }], maxChars: 500, maxCharsPerLine: 500, artworkAllowed: true, artworkMaxFiles: 5, artworkMaxBytes: 10485760 } };
  await new CustomizationTemplate(values).validate();
  for (const mutate of [
    (value) => { value.fields[0].maxChars = 2001; },
    (value) => { value.groups[0].options[0].maxQuantity = 21; },
    (value) => { value.engraving.maxChars = 501; },
    (value) => { value.engraving.artworkMaxFiles = 6; },
    (value) => { value.engraving.artworkMaxBytes = 10485761; },
  ]) {
    const invalid = structuredClone(values); mutate(invalid);
    await assert.rejects(new CustomizationTemplate(invalid).validate());
  }
});
