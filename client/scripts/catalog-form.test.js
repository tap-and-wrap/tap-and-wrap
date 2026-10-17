import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductDraft, createProductPayload, inventoryChoice, selectInventoryAvailability } from '../src/admin/catalog-form.js';

const fixture = {
  name: 'Imported gift', slug: 'imported-gift', categoryId: '111111111111111111111111',
  galleryKeys: ['catalog/imported.webp'], mainImageKey: 'catalog/imported.webp',
  inventory: { mode: 'tracked', quantity: 10, approved: false, available: true },
  pricePiastres: null, priceApproved: false, status: 'draft', variants: [],
};

test('personalization remains untouched on unrelated saves and requires explicit valid configuration for Ready', () => {
  const draft = createProductDraft({ ...fixture, personalization: { fields: [{ key: 'existing', label: 'Existing name', type: 'short_text', required: true, maxLength: 40 }] } });
  assert.equal('personalization' in createProductPayload(draft), false);
  draft.personalizationEdited = true; draft.personalization = { requiredBeforePurchase: true, fields: [] }; draft.status = 'ready';
  assert.throws(() => createProductPayload(draft), /Configure between one and twenty/);
  draft.personalization.fields = [{ key: 'name', label: 'Name', type: 'short_text', required: true, maxLength: 40 }];
  assert.equal(createProductPayload(draft).personalization.requiredBeforePurchase, true);
  assert.equal(createProductPayload(draft).inventory.approved, false);
});

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
  const payload = createProductPayload({ ...draft, name: 'New gift', slug: 'new-gift', categoryId: fixture.categoryId });
  assert.equal(payload.inventory.quantity, 0);
  assert.equal(payload.inventory.approved, false);
  assert.equal(payload.visibility, 'hidden');
});

test('display approval, confirmed price and unavailable stock remain independent on saves', () => {
  const draft = createProductDraft(fixture);
  assert.equal(draft.inventory.quantity, '');
  draft.visibility = 'public'; draft.price = '123.45'; draft.priceApproved = true;
  draft.inventory = selectInventoryAvailability(draft.inventory, 'unavailable');
  const payload = createProductPayload(draft);
  assert.equal(payload.visibility, 'public'); assert.equal(payload.status, 'draft');
  assert.equal(payload.pricePiastres, 12345); assert.equal(payload.priceApproved, true);
  assert.equal(payload.inventory.available, false); assert.equal(payload.inventory.approved, false);
  assert.equal(payload.inventory.quantity, 10); // retained privately, never approved by unrelated saves
});

test('availability choices never approve placeholder stock when switching back to tracked', () => {
  const draft = createProductDraft(fixture);
  const made = selectInventoryAvailability(draft.inventory, 'made_to_order');
  assert.equal(inventoryChoice(made), 'made_to_order'); assert.equal(made.approved, true);
  const tracked = selectInventoryAvailability(made, 'tracked');
  assert.equal(inventoryChoice(tracked), 'tracked'); assert.equal(tracked.quantity, ''); assert.equal(tracked.approved, false);
  const payload = createProductPayload({ ...draft, inventory: tracked });
  assert.equal(payload.inventory.approved, false); assert.equal('choice' in payload.inventory, false);
  assert.equal('originalQuantity' in payload.inventory, false);
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
