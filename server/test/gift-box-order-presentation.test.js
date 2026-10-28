import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixedComponent } from '../../shared/gift-box/definitions.mjs';
import { Order } from '../src/models/Order.js';
import { prepareGiftBoxV2CommerceQuote } from '../src/gift-box/commerce-quote.js';
import { giftBoxOrderLine, giftBoxOrderLineInput, validOrderLineKinds } from '../src/gift-box/order-snapshot.js';
import { presentOrder, presentOrderSummary } from '../src/commerce/order-presentation.js';
import { giftCartConfiguration, giftCartPolicy } from './helpers/gift-box-cart-fixtures.js';

const actor = '507f1f77bcf86cd799439011';
const settings = () => Object.entries({ 'box-2': 20000, 'rose-red': 3000, 'plush-1': 50000, 'chocolate-1': 10000, 'ribbon-navy': 5000, 'gift-card-1': 5000 })
  .map(([componentId, pricePiastres]) => ({ componentId, displayName: `Purchased ${componentId}`, pricePiastres, priceApproval: 'paid',
    priceApprovedBy: actor, priceApprovedAt: new Date('2026-10-28T08:00:00Z'), enabled: true, available: true, __v: 5,
    inventoryMode: getFixedComponent(componentId).category === 'ribbon' ? 'status_only' : componentId === 'plush-1' ? 'made_to_order' : 'tracked',
    inventoryQuantity: getFixedComponent(componentId).category === 'ribbon' ? null : 20 }));
function line({ quantity = 2, snapshot = settings(), configuration = giftCartConfiguration() } = {}) {
  const quote = prepareGiftBoxV2CommerceQuote({ configuration, quantity }, snapshot, { fulfillmentPolicy: giftCartPolicy() });
  return giftBoxOrderLine({ ...quote, giftFulfillment: quote.fulfillment,
    giftComponents: quote.components.map(component => ({ ...component,
      priceApprovedBy: snapshot.find(item => item.componentId === component.componentId).priceApprovedBy,
      priceApprovedAt: snapshot.find(item => item.componentId === component.componentId).priceApprovedAt })) });
}
const orderRecord = (gift = line()) => ({ _id: '507f1f77bcf86cd799439012', owner: 'g:owner', checkoutKey: 'fixture-checkout-key', requestHash: 'fixture-hash',
  orderNumber: '123456', customer: { name: 'Fixture buyer' }, lines: [gift], totals: { subtotalPiastres: gift.lineTotalPiastres, totalPiastres: gift.lineTotalPiastres, shippingPiastres: null, discountPiastres: 0 },
  paymentMethod: 'instapay', paymentState: 'awaiting_transfer', accountingVersion: 1, personalized: true, allowedPaymentMethods: ['instapay'], history: [] });

test('gift order snapshot preserves complete canonical arrangement, per-box/line prices and explicit inventory sources', () => {
  const gift = line();
  assert.equal(gift.kind, 'gift_box_v2');
  assert.equal(gift.lineTotalPiastres, gift.unitPricePiastres * 2);
  assert.equal(gift.giftBox.snapshotVersion, 'gift-box-order-v1');
  assert.equal(gift.giftBox.configuration.placements.length, 5);
  assert.ok(gift.giftBox.components.every(item => item.settingsRevision === 5 && item.priceApprovedBy === actor));
  const roses = gift.giftBox.components.find(item => item.componentId === 'rose-red');
  assert.equal(roses.quantityPerBox, 3); assert.equal(roses.quantityForLine, 6);
  for (const component of gift.giftBox.components) {
    const claim = gift.giftBox.inventoryClaims.find(item => item.id === component.componentId);
    assert.equal(claim.kind, 'gift_box_component');
    assert.equal(claim.quantity, component.quantityForLine);
    assert.equal(claim.consumedQuantity, claim.mode === 'tracked' ? component.quantityForLine : 0);
  }
  assert.equal(gift.giftBox.fulfillment.policyReference.policyId, 'isolated-cart-policy');
  assert.equal(gift.giftBox.fulfillment.physicalFitCertifiedByGeometry, false);
});

test('snapshot is detached and immutable when business settings, prices, modes or draft selections change', () => {
  const snapshot = settings(), configuration = giftCartConfiguration(), saved = line({ snapshot, configuration });
  const before = JSON.stringify(saved);
  snapshot[0].displayName = 'Later name'; snapshot[0].pricePiastres = 1; snapshot[0].inventoryMode = 'made_to_order';
  configuration.selection.giftCard.message = 'A later private message'; configuration.placements[0].x = .8;
  assert.equal(JSON.stringify(saved), before);
  assert.ok(Object.isFrozen(saved.giftBox.configuration.placements[0]));
  assert.throws(() => { saved.giftBox.components[0].unitPricePiastres = 1; }, TypeError);
});

test('strict order snapshot rejects tampered prices, identity, placement associations, modes, claims, extra fields and unsupported versions', () => {
  const patches = [value => { value.lineTotalPiastres = 1; }, value => { value.giftBox.components[0].unitPricePiastres = Number.MAX_SAFE_INTEGER; },
    value => { value.giftBox.configurationId = `gift-box-configuration-v1:${'0'.repeat(64)}`; },
    value => { value.giftBox.configuration.placements[0].componentId = 'plush-1'; },
    value => { value.giftBox.components[0].inventory.owner = 'Product'; },
    value => { value.giftBox.inventoryClaims[0].consumedQuantity = 0; },
    value => { value.giftBox.inventoryClaims.push(value.giftBox.inventoryClaims[0]); },
    value => { value.giftBox.components[0].clientApproved = true; }, value => { value.productId = actor; },
    value => { value.giftBox.snapshotVersion = 'future-version'; },
    value => { value.giftBox.fulfillment.policyReference.boxId = 'box-11'; }];
  for (const mutate of patches) { const changed = structuredClone(line()); mutate(changed); assert.equal(giftBoxOrderLineInput.safeParse(changed).success, false); }
});

test('Order schema accepts historical ordinary lines and explicit product/gift kinds, rejects unknown or incomplete gift kinds', () => {
  const historical = { productId: actor, name: 'Historical product', quantity: 1, unitPricePiastres: 2500, lineTotalPiastres: 2500 };
  assert.equal(validOrderLineKinds([historical, { ...historical, kind: 'product' }, line()]), true);
  const valid = new Order({ ...orderRecord(), lines: [historical, line()] });
  assert.equal(valid.validateSync(), undefined);
  for (const bad of [{ ...historical, kind: 'unknown' }, { kind: 'gift_box_v2', name: 'Incomplete' }]) {
    const invalid = new Order({ ...orderRecord(), lines: [bad] });
    assert.ok(invalid.validateSync()?.errors.lines);
  }
});

test('owned customer DTO uses saved component amounts and private literal message, omits arrangement identity and internal approval/source fields', () => {
  const saved = structuredClone(line({ configuration: giftCartConfiguration({ message: '<script>private 🌹</script>' }) }));
  saved.giftBox.secret = 'never serialize'; saved.giftBox.components[0].internalNote = 'never serialize';
  const record = presentOrder(orderRecord(saved));
  assert.equal(record.lines[0].giftBox.giftCard.message, '<script>private 🌹</script>');
  assert.equal(record.lines[0].giftBox.components[0].unitPricePiastres, 20000);
  assert.equal(record.shipping, undefined);
  const serialized = JSON.stringify(record.lines);
  for (const privateField of ['configurationId', 'placements', 'instanceId', 'priceApprovedBy', 'settingsRevision', 'inventoryClaims', 'internalNote', 'never serialize']) assert.ok(!serialized.includes(privateField));
  const summary = JSON.stringify(presentOrderSummary(orderRecord(saved)));
  assert.ok(!summary.includes('private')); assert.ok(!summary.includes('giftCard'));
});

test('admin DTO includes immutable arrangement/policy/pricing/source metadata and never spreads unknown nested fields', () => {
  const saved = structuredClone(line()); saved.giftBox.configuration.secret = 'never serialize';
  saved.giftBox.fulfillment.policyReference.internalNote = 'never serialize';
  const record = presentOrder(orderRecord(saved), { admin: true });
  assert.equal(record.lines[0].giftBox.configuration.placements.length, 5);
  assert.equal(record.lines[0].giftBox.fulfillment.policyReference.policyVersion, 'fixture-v1');
  assert.equal(record.lines[0].giftBox.components[0].inventory.owner, 'GiftBoxComponentSetting');
  assert.equal(record.lines[0].giftBox.components[0].priceApprovedBy, actor);
  assert.ok(!JSON.stringify(record).includes('never serialize'));
});

test('historical product DTO retains ordinary customization while unknown kinds fail to an unavailable presentation', () => {
  const ordinary = { productId: actor, name: 'Historical product', quantity: 1, unitPricePiastres: 100, lineTotalPiastres: 100,
    personalization: { engraved_name: 'Saved name' }, customization: { templateName: 'Saved engraving', fields: {} } };
  const record = presentOrder({ ...orderRecord(), lines: [ordinary, { kind: 'malicious', customerSecret: 'never serialize' }] });
  assert.equal(record.lines[0].kind, 'product'); assert.equal(record.lines[0].customization.templateName, 'Saved engraving');
  assert.deepEqual(record.lines[1], { kind: 'unsupported', name: 'Order item details unavailable' });
});

test('malformed historical gift snapshot remains an honest unavailable item without crashing customer or admin reads', () => {
  for (const giftBox of [null, { snapshotVersion: 'future-version' }, { snapshotVersion: 'gift-box-order-v1', components: [null] },
    { ...structuredClone(line().giftBox), configuration: { selection: {} } },
    { ...structuredClone(line().giftBox), inventoryClaims: {} },
    { ...structuredClone(line().giftBox), configuration: { ...structuredClone(line().giftBox.configuration), placements: [null] } }]) {
    for (const admin of [false, true]) {
      const record = presentOrder(orderRecord({ ...line(), giftBox }), { admin });
      assert.equal(record.lines[0].kind, 'gift_box_v2'); assert.equal(record.lines[0].giftBox, null);
      assert.equal(record.lines[0].lineTotalPiastres, 198000);
    }
  }
});
