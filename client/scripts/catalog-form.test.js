import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductDraft, createProductPayload } from '../src/admin/catalog-form.js';

const fixture = {
  name: 'Imported gift', slug: 'imported-gift', categoryId: '111111111111111111111111',
  galleryKeys: ['catalog/imported.webp'], mainImageKey: 'catalog/imported.webp',
  inventory: { mode: 'tracked', quantity: 10, approved: false, available: true },
  pricePiastres: null, priceApproved: false, status: 'draft', variants: [],
};

test('an imported quantity of ten remains provisional on unrelated admin saves', () => {
  const payload = createProductPayload(createProductDraft(fixture));
  assert.equal(payload.pricePiastres, null);
  assert.equal(payload.priceApproved, false);
  assert.deepEqual(payload.inventory, { mode: 'tracked', quantity: 10, approved: false, available: true });
});

test('newly created products no longer fabricate ten units of stock', () => {
  const draft = createProductDraft();
  assert.equal(draft.inventory.quantity, '');
  assert.equal(draft.inventory.approved, false);
  assert.throws(() => createProductPayload({ ...draft, name: 'New gift', slug: 'new-gift', categoryId: fixture.categoryId }), /quantity/);
});

test('a zero or blank price remains unconfirmed in the administrator payload', () => {
  for (const input of ['', '0', '0.00']) {
    const draft = createProductDraft(fixture);
    draft.price = input;
    draft.priceApproved = false;
    const payload = createProductPayload(draft);
    assert.equal(payload.pricePiastres, input ? 0 : null);
    assert.equal(payload.priceApproved, false);
  }
  const bad = createProductDraft(fixture);
  bad.price = '0'; bad.priceApproved = true;
  assert.throws(() => createProductPayload(bad), /above zero/);
});

test('a deliberately selected made-on-demand mode requires no quantity', () => {
  const draft = createProductDraft(fixture);
  draft.inventory = { mode: 'made_to_order', quantity: '', available: true, approved: true };
  const payload = createProductPayload(draft);
  assert.equal(payload.inventory.quantity, null);
  assert.equal(payload.inventory.mode, 'made_to_order');
  assert.equal(payload.inventory.approved, true);
});
