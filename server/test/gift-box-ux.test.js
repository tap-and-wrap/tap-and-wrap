import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGiftCardMessage } from '../../shared/gift-box/card-message.mjs';
import { arrangementReducer, initialArrangement, estimateSelection } from '../../client/src/gift-box/state.mjs';
import { prepareGiftBoxCommerceConfiguration } from '../../client/src/gift-box/commerce-payload.mjs';
import { shoppingEstimateInput } from '../src/gift-box/validation.js';
import { cartItemInput, giftCartConfigurationInput, shoppingGiftCartConfigurationInput } from '../src/commerce/cart-contract.js';
import { identifyGiftBoxConfiguration } from '../src/gift-box/commerce-contract.js';
import { giftCartConfiguration, giftCartInput } from './helpers/gift-box-cart-fixtures.js';

test('blank selected gift cards are valid while malformed Unicode is rejected', () => {
  for (const message of ['', ' \n\t', '\u200b\u200c\u200d\u2066\u2069\ufeff', '\u061c\u064e\u0651']) {
    assert.equal(hasGiftCardMessage(message), false);
    assert.equal(shoppingEstimateInput.safeParse({ boxId: 'box-2', giftCard: { componentId: 'gift-card-1', message } }).success, true);
    assert.equal(shoppingGiftCartConfigurationInput.safeParse(giftCartConfiguration({ message })).success, true);
  }
  assert.equal(shoppingEstimateInput.safeParse({ boxId: 'box-2', giftCard: { componentId: 'gift-card-1', message: '\ud800' } }).success, false);
});

test('real Arabic, diacritics, punctuation, English and emoji retain exact text at ingress', () => {
  for (const message of ['هَدِيَّة لَكِ', 'أحبّك\u200d', 'With love\nAlways yours.', '— !', '💐'.repeat(500)]) {
    assert.equal(hasGiftCardMessage(message), true);
    assert.equal(shoppingEstimateInput.parse({ boxId: 'box-2', giftCard: { componentId: 'gift-card-1', message } }).giftCard.message, message);
    assert.equal(cartItemInput.parse(giftCartInput(giftCartConfiguration({ message }))).configuration.selection.giftCard.message, message);
  }
});

test('checkbox governs the paid Gift Card independently of message content and undo', () => {
  let history = { present: { ...initialArrangement(), freePlacement: true, boxId: 'box-2' }, past: [] };
  history = arrangementReducer(history, { type: 'message', message: 'For you' });
  assert.equal(history.present.cardEnabled, false);
  assert.equal(estimateSelection(history.present, 'gift-card-1').giftCard, null);
  history = arrangementReducer(history, { type: 'card', enabled: true });
  assert.equal(estimateSelection(history.present, 'gift-card-1').giftCard.message, 'For you');
  history = arrangementReducer(history, { type: 'message', message: '' });
  assert.equal(prepareGiftBoxCommerceConfiguration(history.present, { cardId: 'gift-card-1' }).selection.giftCard.message, '');
  history = arrangementReducer(history, { type: 'undo' });
  assert.equal(history.present.message, 'For you');
  history = arrangementReducer(history, { type: 'card', enabled: false });
  assert.equal(estimateSelection(history.present, 'gift-card-1').giftCard, null);
  assert.equal(estimateSelection({ ...history.present, cardEnabled: true, message: '' }, 'gift-card-1').giftCard.message, '');
});

test('legacy saved blank-card configurations remain readable with identical identity', () => {
  const legacy = giftCartConfiguration({ message: '' });
  const before = identifyGiftBoxConfiguration(legacy).configurationId;
  const restored = giftCartConfigurationInput.parse(legacy);
  assert.equal(restored.selection.giftCard.message, '');
  assert.equal(identifyGiftBoxConfiguration(restored).configurationId, before);
  assert.equal(shoppingGiftCartConfigurationInput.safeParse(restored).success, true);
  assert.equal(cartItemInput.safeParse(giftCartInput(giftCartConfiguration({ card: false }))).success, true);
});
