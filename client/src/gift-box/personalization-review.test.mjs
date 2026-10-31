import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeGiftBoxPersonalDraft } from './personalization-review.mjs';

test('memory-only preview reports photo placement and excludes private files and engraving content', () => {
  const personal = { photos: [
    { id: 'p1', file: { secret: 'never-copy' }, url: 'blob:secret', name: 'private.png' },
    { id: 'p2', file: { secret: 'never-copy' }, url: 'blob:secret2' },
  ], photoPositions: { p1: { x: 0.45, y: 0.54, placementZone: 'inside' } },
  engravings: [{ text: 'ذكرى 🎁', colorId: 'gold', styleId: null }, { text: '   ', styleId: 'lettering-01' }] };
  const result = summarizeGiftBoxPersonalDraft(personal, 'box-2');
  assert.equal(result.photoCount, 2);
  assert.equal(result.inside + result.beside + result.unpositioned, 2);
  assert.equal(result.engravingCount, 1);
  assert.equal(result.missingStyle, 1);
  assert.deepEqual([result.uploaded, result.priced, result.readyToOrder], [false,false,false]);
  for (const secret of ['never-copy','blob:','private.png','ذكرى']) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(Object.isFrozen(result), true);
});
test('missing box never treats a photo study as a physically approved placement', () => {
  const personal = { photos: [{id:'p1'}], engravings:[{text:'💐',styleId:'lettering-01'}], photoPositions:{} };
  const result = summarizeGiftBoxPersonalDraft(personal, null);
  assert.equal(result.unpositioned,1);
  assert.equal(result.readyToOrder,false);
});
test('blocked Box 1 remains visually unpositioned rather than claiming approval', () => {
  const result = summarizeGiftBoxPersonalDraft({ photos:[{id:'p1'}], engravings:[], photoPositions:{} }, 'box-1');
  assert.equal(result.unpositioned,1);
});
