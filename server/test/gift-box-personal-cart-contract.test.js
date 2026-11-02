import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getFixedComponent } from '../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_PERSONALIZATION_INTENT_VERSION } from '../../shared/gift-box/personalization-intent.mjs';
import { giftBoxV2CommerceInput, identifyGiftBoxConfiguration } from '../src/gift-box/commerce-contract.js';
import { giftCartConfiguration, giftCartPolicy } from './helpers/gift-box-cart-fixtures.js';
import { giftCartConfigurationInput } from '../src/commerce/cart-contract.js';
import { prepareGiftBoxV2CommerceQuote } from '../src/gift-box/commerce-quote.js';
import { giftBoxOrderLine, giftBoxOrderLineInput } from '../src/gift-box/order-snapshot.js';
import { presentOrder } from '../src/commerce/order-presentation.js';

const photoId = 'a'.repeat(24);
const intent = () => ({ version: GIFT_BOX_PERSONALIZATION_INTENT_VERSION,
  photoPrints: [{ uploadId: photoId, printOptionId: 'standard-print', zone: 'inside', x: 0.25, y: 0.50 }],
  engravings: [{ text: 'أحبك ٢٠٢٦', styleId: 'lettering-12', colorId: 'black', surfaceOptionId: 'engraving-front' }] });
const configuration = () => ({ ...giftCartConfiguration(), personalizationIntent: intent() });
const actor='507f1f77bcf86cd799439011';
const settings = () => Object.entries({ 'box-2': 20000, 'rose-red': 3000, 'plush-1': 50000, 'chocolate-1': 10000, 'ribbon-navy': 5000, 'gift-card-1': 5000 })
  .map(([componentId, pricePiastres]) => ({ componentId, displayName: `Purchased ${componentId}`, pricePiastres, priceApproval: 'paid',
    priceApprovedBy: actor, priceApprovedAt: new Date('2026-10-28T08:00:00Z'), enabled: true, available: true, __v: 5,
    inventoryMode: getFixedComponent(componentId).category === 'ribbon' ? 'status_only' : 'tracked',
    inventoryQuantity: getFixedComponent(componentId).category === 'ribbon' ? null : 20 }));
function snapshot(quantity = 2) {
  const { configuration: canonical, configurationId } = identifyGiftBoxConfiguration(configuration());
  const records = settings();
  const base = prepareGiftBoxV2CommerceQuote({ configuration: canonical, quantity }, records, { fulfillmentPolicy: giftCartPolicy() });
  const adjustment = 2500;
  return giftBoxOrderLine({ ...base, configuration: canonical, configurationId,
    giftFulfillment: base.fulfillment,
    giftPersonalization: { ...intent(), photoPrints: [{ ...intent().photoPrints[0], pricePiastres: 1500,
      optionRevision: 2, priceApprovedAt: '2026-10-28T08:00:00Z' }],
      engravings: [{ ...intent().engravings[0], pricePiastres: 1000, optionRevision: 3,
        priceApprovedAt: '2026-10-28T08:00:00Z' }], unitAdjustmentPiastres: adjustment },
    unitPricePiastres: base.unitPricePiastres + adjustment,
    lineTotalPiastres: base.lineTotalPiastres + adjustment * quantity,
    giftComponents: base.components.map(component => ({ ...component, priceApprovedBy: actor,
      priceApprovedAt: new Date('2026-10-28T08:00:00Z') })) });
}

test('personal selections change the immutable gift identity while legacy carts remain v1', () => {
  const old = identifyGiftBoxConfiguration(giftCartConfiguration());
  assert.equal(Object.hasOwn(old.configuration, 'personalizationIntent'), false);
  const first = identifyGiftBoxConfiguration(configuration());
  const second = identifyGiftBoxConfiguration({ ...configuration(), personalizationIntent: { ...intent(), engravings: [{ ...intent().engravings[0], text: 'اسم آخر' }] } });
  assert.notEqual(first.configurationId, second.configurationId);
  assert.notEqual(first.configurationId, old.configurationId);
  assert.equal(first.configuration.personalizationIntent.engravings[0].text, 'أحبك ٢٠٢٦');
});

test('personalized identity survives Zod parse without changing its canonical bytes', () => {
  const first = identifyGiftBoxConfiguration(configuration());
  const strict = giftBoxV2CommerceInput.parse(first.configuration);
  assert.equal(JSON.stringify(strict), JSON.stringify(first.configuration));
  assert.equal(identifyGiftBoxConfiguration(strict).configurationId, first.configurationId);
  const legacy = identifyGiftBoxConfiguration(giftCartConfiguration());
  const parsedLegacy = giftBoxV2CommerceInput.parse(legacy.configuration);
  assert.equal(JSON.stringify(parsedLegacy), JSON.stringify(legacy.configuration));
  assert.equal(identifyGiftBoxConfiguration(parsedLegacy).configurationId, legacy.configurationId);
});

test('strict cart contract rejects browser prices, raw files and duplicate image references', () => {
  const source = configuration();
  assert.equal(giftCartConfigurationInput.safeParse(source).success, true);
  for (const bad of [
    { ...source, personalizationIntent: { ...intent(), unitAdjustmentPiastres: 1 } },
    { ...source, personalizationIntent: { ...intent(), photoPrints: [{ ...intent().photoPrints[0], pricePiastres: 1 }] } },
    { ...source, personalizationIntent: { ...intent(), photoPrints: [intent().photoPrints[0], intent().photoPrints[0]] } },
    { ...source, personalizationIntent: { ...intent(), photos: [new Uint8Array(5)] } },
  ]) assert.equal(giftCartConfigurationInput.safeParse(bad).success, false);
});

test('v2 snapshot includes literal text, print order, source IDs and exact per-box price', () => {
  const line = snapshot();
  assert.equal(line.giftBox.snapshotVersion, 'gift-box-order-v2');
  assert.equal(line.lineTotalPiastres, line.unitPricePiastres * 2);
  assert.equal(line.giftBox.personalization.unitAdjustmentPiastres, 2500);
  assert.equal(line.giftBox.personalization.photoPrints[0].uploadId, photoId);
  assert.equal(line.giftBox.personalization.engravings[0].text, 'أحبك ٢٠٢٦');
  assert.equal(giftBoxOrderLineInput.safeParse(line).success, true);
  assert.ok(Object.isFrozen(line.giftBox.personalization.photoPrints[0]));
});

test('v2 order rejects mismatched attachment identity, price, or snapshot version', () => {
  const valid = snapshot();
  for (const edit of [
    line => { line.giftBox.personalization.photoPrints[0].uploadId = 'b'.repeat(24); },
    line => { line.giftBox.personalization.unitAdjustmentPiastres++; },
    line => { line.giftBox.personalization.engravings[0].text = 'tampered'; },
    line => { line.giftBox.snapshotVersion = 'gift-box-order-v1'; },
    line => { line.lineTotalPiastres--; },
  ]) {
    const line = structuredClone(valid); edit(line);
    assert.equal(giftBoxOrderLineInput.safeParse(line).success, false);
  }
});

test('owned customer DTO hides private photo IDs; admin DTO allows audited file selection', () => {
  const line = snapshot(1);
  const order = { _id: '507f1f77bcf86cd799439012', orderNumber: '123456', customer: { name: 'Fixture' },
    lines: [line], totals: { subtotalPiastres: line.lineTotalPiastres, totalPiastres: line.lineTotalPiastres,
      shippingPiastres: null, discountPiastres: 0 }, paymentMethod: 'instapay', paymentState: 'awaiting_transfer',
    history: [], personalized: true };
  const customer = JSON.stringify(presentOrder(order));
  const admin = JSON.stringify(presentOrder(order, { admin: true }));
  assert.ok(!customer.includes(photoId));
  assert.ok(customer.includes('أحبك ٢٠٢٦'));
  assert.ok(admin.includes(photoId));
  assert.ok(!admin.includes('objectKey'));
});
