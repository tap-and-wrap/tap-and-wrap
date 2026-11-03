import test from 'node:test';
import assert from 'node:assert/strict';
import { giftBoxRuntimeCommerceOpen, giftBoxFlexibleMadeToOrderOpen } from '../src/gift-box/runtime-commerce.js';

test('gift-box runtime checkout defaults shut and cannot be enabled by one flag alone', () => {
  assert.equal(giftBoxRuntimeCommerceOpen(), false);
  const settings = { giftBoxDirectCommerceEnabled: true, giftBoxFlexibleMadeToOrderEnabled: true, giftBoxBuilderBackendEnabled: true, checkoutEnabled: true };
  assert.equal(giftBoxRuntimeCommerceOpen(settings), true);
  assert.equal(giftBoxFlexibleMadeToOrderOpen(settings), true);
  const legacyOnly = { ...settings, giftBoxFlexibleMadeToOrderEnabled: false };
  assert.equal(giftBoxRuntimeCommerceOpen(legacyOnly), true, 'Published-policy checkout must remain enabled.');
  assert.equal(giftBoxFlexibleMadeToOrderOpen(legacyOnly), false, 'Flexible checkout needs the extra opt-in.');
  for (const key of ['giftBoxDirectCommerceEnabled', 'giftBoxBuilderBackendEnabled', 'checkoutEnabled']) {
    assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, [key]: false }), false, key);
    assert.equal(giftBoxFlexibleMadeToOrderOpen({ ...settings, [key]: false }), false, key);
  }
  assert.equal(giftBoxFlexibleMadeToOrderOpen({ ...settings, giftBoxFlexibleMadeToOrderEnabled: 'true' }), false);
  assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, checkoutEnabled: 'true' }), false);
  assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, giftBoxDirectCommerceEnabled: 'true' }), false);
  assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, giftBoxBuilderBackendEnabled: null }), false);
});
