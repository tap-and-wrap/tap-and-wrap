import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGRAVING_COLORS, DEFAULT_ENGRAVING_COLOR, getEngravingColor,
  LETTERING_STYLES, MAX_ENGRAVING_LINES, validateDraftEngraving,
} from '../../shared/gift-box/lettering-styles.mjs';

test('five immutable local engraving colors map to fixed safe color tokens', () => {
  assert.deepEqual(ENGRAVING_COLORS.map(color => color.id), ['black','white','red','gold','yellow']);
  assert.equal(new Set(ENGRAVING_COLORS.map(color => color.hex)).size, 5);
  assert.ok(Object.isFrozen(ENGRAVING_COLORS) && ENGRAVING_COLORS.every(color => Object.isFrozen(color)));
  for (const color of ENGRAVING_COLORS) {
    assert.match(color.hex, /^#[0-9A-F]{6}$/);
    assert.match(color.label, /^(Black|White|Red|Gold|Yellow)$/);
    assert.strictEqual(getEngravingColor(color.id), color);
  }
  assert.equal(DEFAULT_ENGRAVING_COLOR, 'black');
  assert.equal(getEngravingColor('url(javascript:alert(1))').id, DEFAULT_ENGRAVING_COLOR);
  assert.equal(getEngravingColor(null).id, DEFAULT_ENGRAVING_COLOR);
});

test('color choices do not alter the twelve unlicensed styles or character validation', () => {
  assert.equal(LETTERING_STYLES.length, 12);
  assert.ok(LETTERING_STYLES.every(style => !style.actualFontPreviewReady && !style.webEmbeddingApproved));
  assert.equal(MAX_ENGRAVING_LINES, 2);
  assert.equal(validateDraftEngraving('١٢ / ١٠ / ٢٠٢٦ 💛'), true);
  assert.equal(validateDraftEngraving('💛'.repeat(81)), false);
  assert.equal(ENGRAVING_COLORS.find(color => color.id === 'white').contrast, 'dark');
  assert.equal(ENGRAVING_COLORS.find(color => color.id === 'yellow').contrast, 'dark');
  assert.equal(ENGRAVING_COLORS.find(color => color.id === 'gold').contrast, 'dark');
});
