import test from 'node:test';
import assert from 'node:assert/strict';
import { giftBoxRuntimeCommerceOpen } from '../src/gift-box/runtime-commerce.js';

test('gift-box runtime checkout defaults shut and cannot be enabled by one flag alone', () => {
  assert.equal(giftBoxRuntimeCommerceOpen(), false);
  const settings = { giftBoxDirectCommerceEnabled: true, giftBoxBuilderBackendEnabled: true, checkoutEnabled: true };
  assert.equal(giftBoxRuntimeCommerceOpen(settings), true);
  for (const key of Object.keys(settings)) assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, [key]: false }), false, key);
  assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, checkoutEnabled: 'true' }), false);
  assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, giftBoxDirectCommerceEnabled: 'true' }), false);
  assert.equal(giftBoxRuntimeCommerceOpen({ ...settings, giftBoxBuilderBackendEnabled: null }), false);
});
