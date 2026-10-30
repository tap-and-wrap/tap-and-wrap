import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LETTERING_STYLES, MAX_GIFT_PHOTOS, MAX_ENGRAVING_LINES, MAX_GIFT_PHOTO_TOTAL_BYTES,
  validateDraftEngraving, validateLocalPhoto, validateLocalPhotoBatch,
} from '../../shared/gift-box/lettering-styles.mjs';

test('twelve neutral lettering candidate IDs include Rochester instead of 42dot Sans', () => {
  assert.equal(LETTERING_STYLES.length, 12);
  assert.equal(new Set(LETTERING_STYLES.map(style => style.id)).size, 12);
  assert.equal(LETTERING_STYLES.at(-1).internalName, 'Rochester');
  assert.equal(LETTERING_STYLES.some(style => /42dot/i.test(style.internalName)), false);
  assert.ok(LETTERING_STYLES.every(style => !style.webEmbeddingApproved && !style.actualFontPreviewReady));
  assert.deepEqual(LETTERING_STYLES.map(style => style.customerLabel), Array.from({ length: 12 }, (_, index) => `Style ${String(index + 1).padStart(2, '0')}`));
});
test('local previews use technical safety budgets, not six/two business caps', () => {
  assert.equal(MAX_GIFT_PHOTOS, 48);
  assert.equal(MAX_ENGRAVING_LINES, 24);
  assert.equal(MAX_GIFT_PHOTO_TOTAL_BYTES, 64 * 1024 * 1024);
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

test('photo preview admits seven or more and rejects count/byte overages without weakening file validation', () => {
  const photo = size => ({type:'image/png',size});
  assert.equal(validateLocalPhotoBatch(Array.from({length:6},()=>photo(10)), [photo(10)]), null);
  assert.equal(validateLocalPhotoBatch(Array.from({length:47},()=>photo(10)), [photo(10)]), null);
  assert.match(validateLocalPhotoBatch(Array.from({length:48},()=>photo(10)), [photo(10)]), /browser preview supports/);
  assert.equal(validateLocalPhotoBatch(Array.from({length:8},()=>photo(8*1024*1024)), []), null);
  assert.match(validateLocalPhotoBatch(Array.from({length:8},()=>photo(8*1024*1024)), [photo(1)]), /64 MB/);
  assert.match(validateLocalPhotoBatch([], [photo(9*1024*1024)]), /no larger than 8 MB/);
  assert.equal(validateLocalPhotoBatch([], [{type:'image/webp',size:1024}]),null);
  assert.match(validateLocalPhotoBatch([], [{type:'image/gif',size:1024}]), /JPEG, PNG or WebP/);
});
