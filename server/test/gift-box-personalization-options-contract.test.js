import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGiftBoxPersonalizationOptionPatch as parse, giftBoxOptionIsOrderPriced as ready } from '../../shared/gift-box/personalization-option-contract.mjs';
const adminId='507f1f77bcf86cd799439011';
const approved={optionId:'standard-print',kind:'photo_print',displayName:'Photo Print',enabled:true,available:true,
  pricePiastres:1500,priceApproval:'paid',priceApprovedBy:adminId,priceApprovedAt:new Date(),boxIds:['box-1']};
test('merchant can save a pending photo print but cannot forge approval metadata',()=>{
  const value=parse({expectedRevision:0,kind:'photo_print',displayName:'Standard Print',boxIds:['box-1']},{optionId:'standard-print'});
  assert.equal(value.pricePiastres,undefined);
  assert.throws(()=>parse({expectedRevision:0,kind:'photo_print',displayName:'Test',priceApprovedBy:adminId},{optionId:'standard-print'}));
});
test('approved paid or explicitly complimentary options require a real box',()=>{
  assert.equal(ready(approved),true);
  assert.equal(ready({...approved,pricePiastres:null}),false);
  assert.equal(ready({...approved,boxIds:[]}),false);
  assert.equal(ready({...approved,pricePiastres:0,priceApproval:'complimentary'}),true);
  assert.equal(ready({...approved,pricePiastres:0,priceApproval:'paid'}),false);
  assert.throws(()=>parse({expectedRevision:0,kind:'photo_print',pricePiastres:0},{optionId:'standard-print'}));
  assert.doesNotThrow(()=>parse({expectedRevision:0,kind:'photo_print',pricePiastres:0,confirmComplimentary:true},{optionId:'standard-print'}));
});
test('engraving requires an explicitly licensed style and color eligibility',()=>{
  const sample={...approved,optionId:'engraving-front',kind:'engraving_surface',fontLicensesConfirmed:true,approvedStyleIds:['lettering-12'],approvedColorIds:['gold']};
  assert.equal(ready(sample),true);
  assert.equal(ready({...sample,fontLicensesConfirmed:false}),false);
  assert.equal(ready({...sample,approvedStyleIds:[]}),false);
  assert.throws(()=>parse({expectedRevision:0,kind:'engraving_surface',approvedStyleIds:['unlicensed']},{optionId:'engraving-front'}));
  assert.throws(()=>parse({expectedRevision:0,kind:'engraving_surface',approvedColorIds:['#123456']},{optionId:'engraving-front'}));
});
test('no duplicate box identities, unknown boxes, extra fields, or kind changes',()=>{
  assert.throws(()=>parse({expectedRevision:0,kind:'photo_print',boxIds:['box-1','box-1']},{optionId:'standard-print'}));
  assert.throws(()=>parse({expectedRevision:0,kind:'photo_print',boxIds:['not-a-box']},{optionId:'standard-print'}));
  assert.throws(()=>parse({expectedRevision:0,kind:'photo_print',total:1},{optionId:'standard-print'}));
  assert.throws(()=>parse({expectedRevision:0,kind:'engraving_surface',available:true},{optionId:'standard-print',existingKind:'photo_print'}));
});
test('a photo print never accepts engraving licensing fields',()=>{
  assert.throws(()=>parse({expectedRevision:1,available:true,fontLicensesConfirmed:true},{optionId:'standard-print',existingKind:'photo_print'}));
  assert.doesNotThrow(()=>parse({expectedRevision:1,available:true},{optionId:'standard-print',existingKind:'photo_print'}));
});
