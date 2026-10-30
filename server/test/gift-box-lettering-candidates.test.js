import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LETTERING_STYLES, MAX_GIFT_PHOTOS, MAX_ENGRAVING_LINES,
  validateDraftEngraving, validateLocalPhoto,
} from '../../shared/gift-box/lettering-styles.mjs';

test('twelve neutral lettering candidate IDs include Rochester instead of 42dot Sans', () => {
  assert.equal(LETTERING_STYLES.length, 12);
  assert.equal(new Set(LETTERING_STYLES.map(style => style.id)).size, 12);
  assert.equal(LETTERING_STYLES.at(-1).internalName, 'Rochester');
  assert.equal(LETTERING_STYLES.some(style => /42dot/i.test(style.internalName)), false);
  assert.ok(LETTERING_STYLES.every(style => !style.webEmbeddingApproved && !style.actualFontPreviewReady));
  assert.deepEqual(LETTERING_STYLES.map(style => style.customerLabel), Array.from({ length: 12 }, (_, index) => `Style ${String(index + 1).padStart(2, '0')}`));
});
test('photo and engraving drafts have six, two, and eighty character caps', () => {
  assert.equal(MAX_GIFT_PHOTOS, 6);
  assert.equal(MAX_ENGRAVING_LINES, 2);
  assert.equal(validateDraftEngraving('💐'.repeat(80)), true);
  for (const text of ['💐'.repeat(81), '\ud800', 'Hello\u0000']) assert.equal(validateDraftEngraving(text), false);
  assert.equal(validateDraftEngraving('١٢/١٠/٢٠٢٦'), true);
});
test('browser photo type/size screening is a preview filter, not server proof', () => {
  assert.equal(validateLocalPhoto({ type: 'image/png', size: 100 }), null);
  for (const photo of [{ type: 'image/gif', size: 100 }, { type: 'image/jpeg', size: 0 }, { type: 'image/webp', size: 9 * 1024 * 1024 }]) {
    assert.equal(typeof validateLocalPhoto(photo), 'string');
  }
});
