import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ownerReviews, ownerFeaturedReviews } from '../../src/content/owner-confirmed-reviews.js';
import { buildSeoPlan } from './generator.js';

test('64 unique approved testimonials have the exact bilingual inventory and five-star ratings', () => {
  assert.equal(ownerReviews.length, 64);
  assert.equal(new Set(ownerReviews.map(r => r.id)).size, 64);
  assert.equal(ownerReviews.filter(r => r.language === 'ar-EG').length, 35);
  assert.equal(ownerReviews.filter(r => r.language === 'en').length, 29);
  assert.ok(ownerReviews.every(r => r.rating === 5 && r.authorLabel && r.text && !/[—–]/.test(r.text)));
  assert.equal(ownerFeaturedReviews.length, 12);
  assert.equal(ownerFeaturedReviews.filter(r => r.language === 'ar-EG').length, 6);
  assert.ok(ownerFeaturedReviews.every(r => ownerReviews.includes(r)));
  assert.ok(ownerReviews.every(r => Object.keys(r).sort().join(',') === 'authorLabel,id,language,rating,text'));
});

test('source-pack identities, languages and ratings match exactly when private owner source is available', async t => {
  let source;
  try { source = JSON.parse(await readFile(new URL('../../../local-data/planning/tap_wrap_64_reviews_source_pack.json', import.meta.url), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('Private owner source is deliberately not shipped'); return; } throw error; }
  assert.deepEqual(ownerReviews.map(({id,authorLabel,language,rating}) => ({id,authorLabel,language,rating})), source.reviews.map(r => ({id:r.id,authorLabel:r.authorLabel,language:r.recommendedLanguage,rating:r.rating})));
});

test('review first paint contains all 64 escaped bilingual quotes with private provenance omitted', () => {
  const route = buildSeoPlan().routes.get('/reviews');
  assert.equal(route.indexable, false);
  assert.equal((route.body.match(/data-review-id=/g) || []).length, 64);
  assert.equal((route.body.match(/dir="rtl"/g) || []).length, 35);
  assert.doesNotMatch(route.body, /WhatsApp Image|sourceNote|privateSource|screenshot/i);
});
