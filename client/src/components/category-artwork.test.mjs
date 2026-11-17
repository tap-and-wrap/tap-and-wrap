import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedCategoryImage, approvedCategorySlugs} from './category-artwork.mjs';

test('exactly twelve approved categories map to protected square local artwork', () => {
  assert.equal(approvedCategorySlugs.length,12);
  assert.equal(new Set(approvedCategorySlugs).size,12);
  for (const slug of approvedCategorySlugs) {
    assert.equal(approvedCategoryImage({slug,imageUrl:'https://untrusted.invalid/other.webp'}),`/media/tap-wrap-category-${slug}.webp`);
  }
});
test('canonical names with ampersands map to their existing files', () => {
  for(const [name,slug] of [['Gifts & Occasions','gifts-occasions'],['Electronics & Gaming','electronics-gaming'],['Home & Decor','home-decor'],['Baby & Kids','baby-kids']]){
    assert.equal(approvedCategoryImage({name}),`/media/tap-wrap-category-${slug}.webp`);
  }
});
test('unknown or untrusted slugs are not rewritten into local category assets', () => {
  for(const entry of [null,{}, {slug:'../../../secret'}, {slug:'seasonal-gifts'}, {slug:4}]) assert.equal(approvedCategoryImage(entry),null);
});
