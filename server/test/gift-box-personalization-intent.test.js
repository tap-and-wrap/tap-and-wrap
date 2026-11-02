import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGiftBoxPersonalizationIntent, GIFT_BOX_PERSONALIZATION_INTENT_VERSION } from '../../shared/gift-box/personalization-intent.mjs';
import { inspectUnverifiedGiftBoxPersonalizationIntent } from '../src/gift-box/personalization-intent.js';
const initial = () => ({ version: GIFT_BOX_PERSONALIZATION_INTENT_VERSION,
  photoPrints: [{ uploadId:'0123456789abcdef01234567', printOptionId:'pending-print-option', zone:'inside', x:0.4, y:0.6 }],
  engravings: [{ text:'١٢ أكتوبر 💛', styleId:'lettering-01', colorId:'gold', surfaceOptionId:'pending-engraving-surface' }] });
const invalid = input => assert.throws(() => parseGiftBoxPersonalizationIntent(input), /Invalid gift-box personalization intent/);

test('versioned proposals retain Unicode literals, order and no approval assertions', () => {
  const raw=initial(); const result=inspectUnverifiedGiftBoxPersonalizationIntent(raw);
  assert.deepEqual(result.intent,raw);
  assert.deepEqual([result.uploadOwnershipVerified,result.physicalFitVerified,result.manufacturingApproved,result.priceApproved,result.checkoutAllowed],[false,false,false,false,false]);
  assert.equal(Object.isFrozen(result.intent.photoPrints[0]),true);
});
test('untrusted browser prices, raw files, object URLs, keys and approval claims fail closed', () => {
  for (const extra of [{pricePiastres:0},{approved:true},{photoFiles:[]},{checkoutAllowed:true},{files:[]},{R2Key:'secret'}]) invalid({...initial(),...extra});
  for (const extra of [{url:'blob:secret'},{filename:'private.jpg'},{storageKey:'private/secret'},{file:{}},{pricePiastres:0},{ownerId:'someone'}]) {
    const item=initial(); item.photoPrints[0]={...item.photoPrints[0],...extra}; invalid(item);
  }
  for (const extra of [{unitPricePiastres:0},{fontFamily:'Secret Font'},{approved:true},{material:'gold'}]) {
    const item=initial(); item.engravings[0]={...item.engravings[0],...extra}; invalid(item);
  }
});
test('photo references must be distinct private upload IDs and normalized coordinates', () => {
  for (const patch of [{uploadId:'client-local-id'},{uploadId:'0123456789ABCDEF01234567'},{x:-1},{y:1.1},{x:NaN},{zone:'above'},{printOptionId:'<img>'}]) {
    const item=initial(); item.photoPrints[0]={...item.photoPrints[0],...patch}; invalid(item);
  }
  const duplicate=initial(); duplicate.photoPrints.push({...duplicate.photoPrints[0]}); invalid(duplicate);
  const valid=initial(); valid.photoPrints[0].x=-0;
  assert.equal(Object.is(parseGiftBoxPersonalizationIntent(valid).photoPrints[0].x,0),true);
});
test('engraving selections are constrained; no invented typography or material is authorized', () => {
  for (const patch of [{styleId:'arbitrary-font'},{colorId:'#ff0000'},{surfaceOptionId:''},{text:'\ud800'},{text:'a'.repeat(81)},{text:'  '},{text:'a\u0000b'}]) {
    const item=initial(); item.engravings[0]={...item.engravings[0],...patch}; invalid(item);
  }
  const empty={version:GIFT_BOX_PERSONALIZATION_INTENT_VERSION,photoPrints:[],engravings:[]};
  assert.deepEqual(parseGiftBoxPersonalizationIntent(empty),empty);
});
