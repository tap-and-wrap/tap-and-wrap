import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryCanOrder, mediaUrlForKey, publicProductCard, publicProductDetail } from '../src/catalog/public-presentation.js';

test('enquiry products hide provisional quantities and variant prices while approved sold-out products remain unorderable', () => {
  const product = {
    _id: 'fixture', name: 'Gift', slug: 'gift', status: 'draft', published: false,
    categoryId: { _id: 'category', name: 'Gifts', slug: 'gifts', active: true },
    mainImageKey: 'Gifts/gift.webp', priceApproved: false, pricePiastres: 999,
    inventory: { mode: 'tracked', quantity: 10, approved: false, available: true },
    variants: [{ key: 'one', attributes: [], priceApproved: false, pricePiastres: 555, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } }],
  };
  const detail = publicProductDetail(product);
  assert.equal(detail.browseOnly, true);
  assert.equal(detail.pricePiastres, null);
  assert.equal(detail.inventory.quantity, null);
  assert.equal(detail.variants[0].pricePiastres, null);
  assert.equal(detail.variants[0].inventory.quantity, null);
  assert.equal(detail.orderingAvailable, false);
  const soldOut = publicProductCard({ ...product, variants: [], status: 'ready', published: true, priceApproved: true, inventory: { ...product.inventory, approved: true, quantity: 0 } });
  assert.equal(soldOut.pricePiastres, 999);
  assert.equal(soldOut.orderingAvailable, false);
});

test('public image references require an explicit HTTPS media base', () => {
  assert.equal(mediaUrlForKey('Accessories/bag.webp', ''), null);
  assert.equal(mediaUrlForKey('Accessories/bag.webp', 'http://localhost:5173'), null);
  assert.equal(mediaUrlForKey('C:\\merchant\\bag.webp', 'https://media.example.test'), null);
  assert.equal(mediaUrlForKey('../bag.webp', 'https://media.example.test'), null);
  assert.equal(mediaUrlForKey('Accessories/bag.webp', 'https://user:password@media.example.test'), null);
  assert.equal(mediaUrlForKey('Accessories/Bags / Women/bag.webp', 'https://media.example.test/catalog/'), 'https://media.example.test/catalog/Accessories/Bags%20/%20Women/bag.webp');
});

test('approved made-by-request inventory ignores quantity and unavailable stock cannot order', () => {
  assert.equal(inventoryCanOrder({ mode: 'made_to_order', quantity: null, approved: true, available: true }), true);
  assert.equal(inventoryCanOrder({ mode: 'tracked', quantity: 0, approved: true, available: true }), false);
  assert.equal(inventoryCanOrder({ mode: 'tracked', quantity: 10, approved: false, available: true }), false);
  assert.equal(inventoryCanOrder({ mode: 'made_to_order', approved: true, available: false }), false);
});

test('public cards and details never return raw image keys or provisional prices', () => {
  const product = {
    _id: 'fixture', name: 'Fixture item', slug: 'fixture-item', description: 'Fixture description',
    mainImageKey: 'Accessories/item.webp', galleryKeys: ['Accessories/item.webp'],
    categoryId: { _id: 'category', name: 'Accessories', slug: 'accessories' },
    pricePiastres: 123, compareAtPiastres: 200, priceApproved: false,
    inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
    personalization: { fields: [{ key: 'message', label: 'Message', type: 'short_text', required: true, maxLength: 80 }] },
    customization: { enabled: false, serviceEntryEligible: false }, variants: [],
  };
  const card = publicProductCard(product);
  assert.equal(card.pricePiastres, null);
  assert.equal(card.compareAtPiastres, null);
  assert.equal(card.requiresOptions, true);
  assert.equal('galleryKeys' in card, false);
  assert.equal('mainImageKey' in card, false);
  assert.equal('personalization' in card, false);
  const detail = publicProductDetail(product);
  assert.equal('mainImageKey' in detail, false);
  assert.equal('galleryKeys' in detail, false);
  assert.deepEqual(detail.galleryUrls, []);
  assert.equal(detail.personalization.fields[0].required, true);
  assert.equal(detail.customization.serviceEntryEligible, false);
});
