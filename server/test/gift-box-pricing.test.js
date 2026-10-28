import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_COMPONENTS, PENDING_CATEGORIES } from '../../shared/gift-box/definitions.mjs';
import { BOX_PLACEMENT_DEFINITIONS } from '../../shared/gift-box/geometry.mjs';
import { addPiastres, approvedPrice, calculateEstimate, multiplyPiastres, selectionLines } from '../src/gift-box/pricing.js';
import { estimateInput, giftCardMessage, reorderInput, settingPatch } from '../src/gift-box/validation.js';
const setting = (componentId, pricePiastres, patch = {}) => ({ componentId, displayName: 'Synthetic test component', pricePiastres,
  enabled: true, available: true, inventoryMode: 'made_to_order', inventoryQuantity: null, priceApproval: pricePiastres === 0 ? 'complimentary' : 'paid',
  priceApprovedBy: '507f1f77bcf86cd799439011', priceApprovedAt: new Date('2026-10-28T00:00:00Z'), __v: 2, ...patch });
const selection = { boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 3 }, { componentId: 'plush-1', quantity: 2 }] };
const prices = () => [setting('box-2', 12345), setting('rose-red', 678), setting('plush-1', 9012)];

test('server settings produce integer itemized amounts with separate pending delivery and no arrangement approval', () => {
  const estimate = calculateEstimate(selection, prices());
  assert.equal(estimate.componentSubtotalPiastres, 12345 + 3 * 678 + 2 * 9012);
  assert.deepEqual(estimate.items.map(item => item.quantity), [1, 3, 2]);
  assert.deepEqual(estimate.items.map(item => item.settingsRevision), [2, 2, 2]);
  assert.deepEqual(estimate.delivery, { status: 'pending_confirmation', pricePiastres: null });
  assert.equal(estimate.arrangementApproved, false);
  assert.equal(estimate.submissionAllowed, false);
  assert.equal(estimate.orderConversionAllowed, false);
  assert.ok(BOX_PLACEMENT_DEFINITIONS.every(box => box.reviewStatus === 'unreviewed'));
});
test('exactly one box is required and other categories cannot impersonate a box or item', () => {
  for (const input of [{}, { ...selection, boxId: ['box-2', 'box-3'] }, { ...selection, boxId: 'plush-1' },
    { ...selection, items: [{ componentId: 'box-3', quantity: 1 }] }, { ...selection, boxQuantity: 2 }]) assert.throws(() => calculateEstimate(input, prices()));
});
test('unknown identities, pending chocolate/ribbon/card choices and wrong-category selections fail closed', () => {
  for (const input of [{ boxId: 'box-99' }, { boxId: 'box-2', items: [{ componentId: 'chocolate-not-approved', quantity: 1 }] },
    { boxId: 'box-2', ribbonId: 'ribbon-not-approved' }, { boxId: 'box-2', ribbonId: 'rose-red' },
    { boxId: 'box-2', giftCard: { componentId: 'card-not-approved', message: 'For you' } }]) assert.throws(() => selectionLines(input));
  assert.deepEqual(PENDING_CATEGORIES, {});
  assert.equal(FIXED_COMPONENTS.find(item => item.id === 'chocolate-1').presentation, 'text-button');
});
test('missing, disabled, unpriced and unapproved amounts are not free', () => {
  assert.throws(() => calculateEstimate(selection, []), { code: 'GIFT_BOX_COMPONENT_UNAVAILABLE' });
  for (const patch of [{ enabled: false }, { pricePiastres: null }, { pricePiastres: 0, priceApproval: 'pending' },
    { pricePiastres: 123, priceApproval: 'pending' }, { priceApprovedBy: null }, { priceApprovedAt: null },
    { pricePiastres: -1 }, { pricePiastres: 1.5 }, { pricePiastres: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => calculateEstimate({ boxId: 'box-2' }, [setting('box-2', 100, patch)]));
  }
  assert.equal(approvedPrice(setting('box-2', 0, { priceApproval: 'paid' })), null);
});
test('an explicitly approved complimentary zero is preserved without inventing a paid default', () => {
  const result = calculateEstimate({ boxId: 'box-2', items: [{ componentId: 'rose-black', quantity: 2 }] }, [setting('box-2', 100), setting('rose-black', 0)]);
  assert.equal(result.items[1].lineSubtotalPiastres, 0);
  assert.equal(result.items[1].priceApproval, 'complimentary');
  assert.equal(result.componentSubtotalPiastres, 100);
});
test('quantities reject zero, negatives, decimals, numeric strings, duplicates and computation-limit overflow', () => {
  for (const quantity of [0, -1, 1.5, '2', 101, NaN, Infinity]) assert.equal(estimateInput.safeParse({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity }] }).success, false);
  assert.equal(estimateInput.safeParse({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 1 }, { componentId: 'rose-red', quantity: 2 }] }).success, false);
  assert.equal(estimateInput.safeParse({ boxId: 'box-2', items: ['red', 'yellow', 'black'].map(color => ({ componentId: `rose-${color}`, quantity: 100 })) }).success, false);
});
test('client prices, totals, delivery charges and placement approval cannot enter an estimate', () => {
  for (const patch of [{ totalPiastres: 1 }, { componentSubtotalPiastres: 1 }, { delivery: 0 }, { arrangementApproved: true }, { placements: [] }]) assert.equal(estimateInput.safeParse({ ...selection, ...patch }).success, false);
  assert.equal(estimateInput.safeParse({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 1, unitPricePiastres: 0 }] }).success, false);
});
test('sum and multiplication remain safe at integer boundaries', () => {
  assert.equal(addPiastres(Number.MAX_SAFE_INTEGER - 1, 1), Number.MAX_SAFE_INTEGER);
  assert.equal(multiplyPiastres(0, 100), 0);
  assert.throws(() => addPiastres(Number.MAX_SAFE_INTEGER, 1), { code: 'GIFT_BOX_AMOUNT_OVERFLOW' });
  assert.throws(() => multiplyPiastres(Number.MAX_SAFE_INTEGER, 2), { code: 'GIFT_BOX_AMOUNT_OVERFLOW' });
  assert.throws(() => calculateEstimate(selection, [setting('box-2', Number.MAX_SAFE_INTEGER), ...prices().slice(1)]), { code: 'GIFT_BOX_AMOUNT_OVERFLOW' });
  for (let quantity = 1; quantity <= 100; quantity++) {
    const amount = Math.floor(Number.MAX_SAFE_INTEGER / quantity);
    const exact = BigInt(amount) * BigInt(quantity);
    if (exact <= BigInt(Number.MAX_SAFE_INTEGER)) assert.equal(BigInt(multiplyPiastres(amount, quantity)), exact);
    else assert.throws(() => multiplyPiastres(amount, quantity));
    if (BigInt(amount + 1) * BigInt(quantity) > BigInt(Number.MAX_SAFE_INTEGER)) assert.throws(() => multiplyPiastres(amount + 1, quantity));
  }
});
test('zero-price saves require a dedicated explicit approval and reject invalid monetary inputs', () => {
  assert.equal(settingPatch.safeParse({ expectedRevision: 0, pricePiastres: 0 }).success, false);
  assert.equal(settingPatch.safeParse({ expectedRevision: 0, pricePiastres: 0, confirmComplimentary: true }).success, true);
  assert.equal(settingPatch.safeParse({ expectedRevision: 0, pricePiastres: 1, confirmComplimentary: true }).success, false);
  for (const pricePiastres of [-1, 0.1, '100', Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(settingPatch.safeParse({ expectedRevision: 0, pricePiastres }).success, false);
  assert.equal(settingPatch.safeParse({ expectedRevision: 0, pricePiastres: null }).success, true);
});
test('only approved business fields and approval/revision envelopes are accepted', () => {
  for (const key of ['componentId', 'category', 'imagePath', 'assetHash', 'geometry', 'approvedColorHex', 'priceApproval', 'priceApprovedBy', 'createdBy', '__v', 'revision', '$set']) {
    assert.equal(settingPatch.safeParse({ expectedRevision: 0, displayName: 'Updated', [key]: 'forged' }).success, false);
  }
  for (const displayName of ['', '  ', 'x'.repeat(121), 'name\nextra']) assert.equal(settingPatch.safeParse({ expectedRevision: 0, displayName }).success, false);
});
test('reordering requires every identity in one category once with individual revisions', () => {
  const items = FIXED_COMPONENTS.filter(item => item.category === 'box').map(item => ({ componentId: item.id, expectedRevision: 0 })).reverse();
  assert.equal(reorderInput.safeParse({ category: 'box', items }).success, true);
  for (const input of [{ category: 'box', items: items.slice(1) }, { category: 'box', items: [...items.slice(1), items[1]] },
    { category: 'plush', items }, { category: 'chocolate', items: [] }, { category: 'box', items: items.map(item => ({ componentId: item.componentId })) }]) assert.equal(reorderInput.safeParse(input).success, false);
});
test('gift-card messages enforce Unicode code points and preserve markup as literal text', () => {
  const text = '<script>alert("customer text")</script>\nFor you 💐';
  assert.equal(giftCardMessage.parse(text), text);
  assert.equal(giftCardMessage.parse(''), '');
  assert.equal(giftCardMessage.parse('💐'.repeat(500)).length, 1000);
  for (const value of ['💐'.repeat(501), 'x'.repeat(501), '\u0000', '\ud800', { text: 'no objects' }]) assert.equal(giftCardMessage.safeParse(value).success, false);
  assert.equal(estimateInput.safeParse({ boxId: 'box-2', giftCard: { componentId: 'card-not-approved', message: text, pricePiastres: 0 } }).success, false);
});
