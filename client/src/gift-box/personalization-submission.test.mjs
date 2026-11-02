import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleGiftBoxOptions, estimateGiftBoxPersonalizationChoices, assertGiftBoxPersonalizationPriceUnchanged, giftBoxPersonalDraftSignature, giftBoxConfigurationWithPersonalization, verifyGiftBoxPersonalDraft } from './personalization-submission.mjs';
import { initialArrangement } from './state.mjs';
import { GIFT_BOX_PERSONALIZATION_INTENT_VERSION } from '../../../shared/gift-box/personalization-intent.mjs';
const photoId='10000000-0000-4000-8000-000000000001';
const options=[{optionId:'print-1',kind:'photo_print',enabled:true,available:true,pricePiastres:250,boxIds:['box-2']},
  {optionId:'surface-1',kind:'engraving_surface',enabled:true,available:true,pricePiastres:300,boxIds:['box-2'],approvedStyleIds:['lettering-12'],approvedColorIds:['black']},
  {optionId:'other-box',kind:'photo_print',enabled:true,available:true,pricePiastres:300,boxIds:['box-3']}];
const photo={id:photoId,fileKey:'opaque-local-key',file:{type:'image/png',size:1024},name:'private-family-photo.png',url:'blob:private'};
const personal={hasContent:true,photos:[photo],photoPositions:{},engravings:[{id:'line-1',text:'أحمد ٢٠٢٦',styleId:'lettering-12',colorId:'black'}]};
const prints={[photoId]:'print-1'},surfaces={'line-1':'surface-1'};
const verifiedQuote={unitAdjustmentPiastres:550,photoPrints:[{}],engravings:[{}],checkoutAuthorized:false,physicallyApproved:false};
const base={boxId:'box-2',personal,ownerKey:'guest:'.concat('a'.repeat(64)),options,
 printOptionsByPhoto:prints,surfaceOptionsByEngraving:surfaces,ownerIsCurrent:()=>true,draftIsCurrent:()=>true,
 cache:new Map(),uploadedIds:[],uploadFile:async()=> 'b'.repeat(24),quote:async()=>verifiedQuote};
test('only approved, priced and box-compatible options are selectable',()=>{
 assert.deepEqual(eligibleGiftBoxOptions(options,'box-2','photo_print').map(o=>o.optionId),['print-1']);
 assert.deepEqual(eligibleGiftBoxOptions(options,'box-2','engraving_surface',personal.engravings[0]).map(o=>o.optionId),['surface-1']);
 assert.deepEqual(eligibleGiftBoxOptions(options,'box-2','engraving_surface',{styleId:'lettering-7',colorId:'black'}),[]);
});
test('draft signatures change with photo order, positions, surfaces, or owner-selected options',()=>{
 const original=giftBoxPersonalDraftSignature('box-2',personal,prints,surfaces);
 assert.notEqual(original,giftBoxPersonalDraftSignature('box-3',personal,prints,surfaces));
 assert.notEqual(original,giftBoxPersonalDraftSignature('box-2',personal,{[photoId]:'other-box'},surfaces));
 assert.notEqual(original,giftBoxPersonalDraftSignature('box-2',{...personal,photoPositions:{[photoId]:{x:0.5,y:0.4,placementZone:'inside'}}},prints,surfaces));
});
test('explicit verification uploads to private storage, quotes server-side and never sends Files or names',async()=>{
 let uploadCalled=0,quoted;
 const result=await verifyGiftBoxPersonalDraft({...base,uploadFile:async(file,ctx)=>{uploadCalled++;assert.equal(file,photo.file);assert.equal(ctx.purpose,'gift_box_photo');assert.equal(ctx.giftBoxId,'box-2');return 'b'.repeat(24);}, quote:async (boxId,intent)=>{assert.equal(boxId,'box-2');quoted=intent;return verifiedQuote;}});
 assert.equal(uploadCalled,1);assert.equal(result.quote.unitAdjustmentPiastres,550);
 assert.equal(quoted.version,GIFT_BOX_PERSONALIZATION_INTENT_VERSION);
 assert.equal(quoted.engravings[0].text,'أحمد ٢٠٢٦');
 for(const secret of ['private-family-photo','blob:','pricePiastres','fileKey'])assert.equal(JSON.stringify(quoted).includes(secret),false);
});
test('missing option and stale owner fail before cart authorization or quote',async()=>{
 let called=0;
 await assert.rejects(verifyGiftBoxPersonalDraft({...base,printOptionsByPhoto:{},uploadFile:async()=>{called++;return 'b'.repeat(24);}}),/priced print/);
 assert.equal(called,0);
 await assert.rejects(verifyGiftBoxPersonalDraft({...base,ownerIsCurrent:()=>false,quote:async()=>{called++;}}),/session or Gift Box changed/);
 assert.equal(called,0);
 await assert.rejects(verifyGiftBoxPersonalDraft({...base,quote:async()=>({...verifiedQuote,checkoutAuthorized:true})}),/could not be verified/);
});
test('stale drafts after upload are rejected without quoting or adding a cart line',async()=>{
 let checks=0,quotes=0;
 await assert.rejects(verifyGiftBoxPersonalDraft({...base,draftIsCurrent:()=>++checks===1,quote:async()=>{quotes++;return verifiedQuote;}}),/changed during upload/);
 assert.equal(quotes,0);
});
test('unpersonalized configuration stays legacy and a personalized one carries the strict intent',()=>{
 const state={...initialArrangement(),boxId:'box-2',ribbonId:'ribbon-cream-ivory'};
 const intent={version:GIFT_BOX_PERSONALIZATION_INTENT_VERSION,photoPrints:[],engravings:[]};
 const without=giftBoxConfigurationWithPersonalization(state,{});
 assert.equal('personalizationIntent' in without,false);
 const withPersonal=giftBoxConfigurationWithPersonalization(state,{intent});
 assert.deepEqual(withPersonal.personalizationIntent,intent);
});

test('selection estimate is display-only, invalidates on missing or incompatible options and cannot be forged',()=>{
 const args={boxId:'box-2',personal,options,printOptionsByPhoto:prints,surfaceOptionsByEngraving:surfaces};
 assert.equal(estimateGiftBoxPersonalizationChoices(args),550);
 assert.equal(estimateGiftBoxPersonalizationChoices({...args,printOptionsByPhoto:{}}),null);
 assert.equal(estimateGiftBoxPersonalizationChoices({...args,boxId:'box-3'}),null);
 assert.equal(estimateGiftBoxPersonalizationChoices({...args,personal:{...personal,engravings:[{...personal.engravings[0],colorId:'white'}]}}),null);
});

test('server quote must match visible approved-option estimate before Add to Cart',()=>{
 assert.equal(assertGiftBoxPersonalizationPriceUnchanged(verifiedQuote,550),true);
 assert.throws(()=>assertGiftBoxPersonalizationPriceUnchanged({...verifiedQuote,unitAdjustmentPiastres:551},550),/prices changed/);
 assert.throws(()=>assertGiftBoxPersonalizationPriceUnchanged(verifiedQuote,null),/prices changed/);
});
