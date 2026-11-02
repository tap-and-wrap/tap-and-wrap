import test from 'node:test';
import assert from 'node:assert/strict';
import { GIFT_BOX_PERSONALIZATION_INTENT_VERSION } from '../../shared/gift-box/personalization-intent.mjs';
import { priceGiftBoxPersonalization } from '../src/gift-box/personalization-pricing.mjs';
const owner='guest:'+'a'.repeat(64), id='b'.repeat(24),admin='c'.repeat(24), now=new Date('2026-01-01T00:00:00Z'), future=new Date('2099-01-01T00:00:00Z');
const photo={uploadId:id,printOptionId:'standard-print',zone:'inside',x:0.4,y:0.3};
const intent={version:GIFT_BOX_PERSONALIZATION_INTENT_VERSION,photoPrints:[photo],engravings:[]};
const upload={_id:id,owner,purpose:'gift_box_photo',giftBoxId:'box-2',fieldKey:'gift_box_photo',state:'complete',expiresAt:future};
const option={optionId:'standard-print',kind:'photo_print',enabled:true,available:true,pricePiastres:1200,priceApproval:'paid',priceApprovedBy:admin,priceApprovedAt:now,__v:2};
const quote=changes=>priceGiftBoxPersonalization({intent,boxId:'box-2',owner,uploads:[upload],options:[option],...changes});
test('only verified private photos get server-priced; quote never claims physical approval',()=>{
 const result=quote();assert.equal(result.unitAdjustmentPiastres,1200);assert.deepEqual(result.uploadIds,[id]);
 assert.equal(result.physicallyApproved,false);assert.equal(result.checkoutAuthorized,false);
 assert.equal(JSON.stringify(result).includes('objectKey'),false);
});
test('wrong session, box, purpose and expired photo are rejected',()=>{
 for(const patch of [{owner:'guest:'+'d'.repeat(64)},{giftBoxId:'box-3'},{purpose:'personalization'},{state:'pending'},{expiresAt:new Date('2000-01-01')}])
   assert.throws(()=>quote({uploads:[{...upload,...patch}]}),/not ready/);
});
test('missing and free-unapproved print options cannot become silently complimentary',()=>{
 for(const changes of [[{...option,pricePiastres:null}],[{...option,pricePiastres:0}],[{...option,available:false}],[]])
  assert.throws(()=>quote({options:changes}),/not ready/);
 const free={...option,pricePiastres:0,priceApproval:'complimentary'};
 assert.equal(quote({options:[free]}).unitAdjustmentPiastres,0);
});
test('engraving text retains Unicode but requires its own approved surface price',()=>{
 const engraved={...intent,engravings:[{text:'اسم ٢٠٢٦',styleId:'invalid',colorId:'bad',surfaceOptionId:'engraving-front'}]};
 assert.throws(()=>quote({intent:engraved}),/not ready/);
});
test('duplicate upload receipts and browser price injection fail closed',()=>{
 assert.throws(()=>quote({uploads:[upload,upload]}),/not ready/);
 assert.throws(()=>quote({intent:{...intent,photoPrints:[{...photo,pricePiastres:0}]}}),/not ready/);
});

test('licensed engraving style and surface price are required for a valid Unicode quote',()=>{
 const line={text:'اسم ٢٠٢٦',styleId:'lettering-12',colorId:'black',surfaceOptionId:'engraving-front'};
 const engraved={...intent,engravings:[line]};
 const surface={...option,optionId:'engraving-front',kind:'engraving_surface',fontLicensesConfirmed:true,approvedStyleIds:['lettering-12'],approvedColorIds:['black'],pricePiastres:800};
 const result=quote({intent:engraved,options:[option,surface]});
 assert.equal(result.unitAdjustmentPiastres,2000);assert.equal(result.engravings[0].text,'اسم ٢٠٢٦');
 assert.throws(()=>quote({intent:engraved,options:[option,{...surface,fontLicensesConfirmed:false}]}),/not ready/);
});
test('photos attached to a different cart cannot be reused across cart transactions',()=>{
 assert.throws(()=>quote({uploads:[{...upload,cartId:'d'.repeat(24)}]}),/not ready/);
 assert.equal(quote({uploads:[{...upload,cartId:'d'.repeat(24)}],cartId:'d'.repeat(24)}).unitAdjustmentPiastres,1200);
});

test('saved box restrictions prevent charging an option on a different gift box',()=>{
 assert.throws(()=>quote({options:[{...option,boxIds:['box-1']}]}),/not ready/);
 assert.equal(quote({options:[{...option,boxIds:['box-2']}]}).unitAdjustmentPiastres,1200);
});
