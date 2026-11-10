import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { STICKER_PROOFS, defaultStickerPlacement, boundStickerPlacement, validStickerPlacement } from '../../shared/gift-box/sticker-placement.mjs';
import { parseGiftBoxPersonalizationIntent } from '../../shared/gift-box/personalization-intent.mjs';
import { priceGiftBoxPersonalization } from '../src/gift-box/personalization-pricing.mjs';
import { giftCartConfiguration, giftCartPolicy } from './helpers/gift-box-cart-fixtures.js';
import { identifyGiftBoxConfiguration, giftBoxV2CommerceInput } from '../src/gift-box/commerce-contract.js';
import { prepareGiftBoxV2CommerceQuote } from '../src/gift-box/commerce-quote.js';
import { giftBoxOrderLine, giftBoxOrderLineInput } from '../src/gift-box/order-snapshot.js';
import { presentOrder } from '../src/commerce/order-presentation.js';
import { getFixedComponent } from '../../shared/gift-box/definitions.mjs';
const owner='guest:'+'a'.repeat(64), actor='c'.repeat(24);
const option={optionId:'sticker',kind:'box_sticker',enabled:true,available:true,boxIds:['box-2'],pricePiastres:2000,priceApproval:'paid',priceApprovedBy:actor,priceApprovedAt:new Date('2026-01-01'),__v:2,fontLicensesConfirmed:true,approvedStyleIds:['sticker-rochester-v1','sticker-amiri-v1'],approvedColorIds:['black','gold']};
const intent=(boxId='box-2')=>({version:'gift-box-personalization-intent-v3',photoPrints:[],engravings:[],sticker:{text:'With love',styleId:'sticker-rochester-v1',colorId:'gold',optionId:'sticker',application:'exterior',placement:defaultStickerPlacement(boxId)}});
test('all eleven sticker proofs map exact owner images with natural ratio and genuine transparency; Box 12 stays legacy',async()=>{
 assert.equal(Object.keys(STICKER_PROOFS).length,11);assert.equal(defaultStickerPlacement('box-12'),null);
 for(const [id,views]of Object.entries(STICKER_PROOFS)){
  assert.deepEqual(Object.keys(views),['box-1','box-3','box-4','box-5','box-6'].includes(id)?['left','right']:['exterior']);
  for(const proof of Object.values(views)){const file=new URL('../../client/public/assets/gift-box/stickers/v1/'+proof.file,import.meta.url),image=sharp(file.pathname.replace(/^\/([A-Za-z]:)/,'$1'));const metadata=await image.metadata(),stats=await image.stats();assert.equal(metadata.width,proof.width);assert.equal(metadata.height,proof.height);assert.equal(metadata.hasAlpha,true);assert.equal(stats.channels.at(-1).min,0);assert.equal(stats.channels.at(-1).max,255);}
 }
 assert.equal(STICKER_PROOFS['box-3'].left.file,STICKER_PROOFS['box-5'].left.file);assert.equal(STICKER_PROOFS['box-4'].right.file,STICKER_PROOFS['box-6'].right.file);
});
test('placement bounds include alpha margins, side compatibility and finite geometry',()=>{
 for(const [id,views]of Object.entries(STICKER_PROOFS))for(const view of Object.keys(views)){const value=defaultStickerPlacement(id,view);assert.ok(validStickerPlacement(value));const bounded=boundStickerPlacement({...value,x:-1,y:2,width:5,height:4});assert.ok(validStickerPlacement(bounded));assert.equal(validStickerPlacement({...value,view:'top'}),false);assert.equal(validStickerPlacement({...value,x:NaN}),false);assert.equal(validStickerPlacement({...value,x:-.1}),false);}
 const first=defaultStickerPlacement('box-1');assert.ok(validStickerPlacement({...first,view:'right'}));
});
test('new sticker intent is strict and legacy v2 remains unchanged',()=>{
 const raw=intent();assert.deepEqual(parseGiftBoxPersonalizationIntent(raw),raw);
 const old={...raw,version:'gift-box-personalization-intent-v2',sticker:{...raw.sticker,application:'exterior-front'}};delete old.sticker.placement;assert.deepEqual(parseGiftBoxPersonalizationIntent(old),old);
 for(const patch of [{boxId:'box-12'},{view:'left'},{x:-1},{width:1},{version:'invented'},{storageKey:'private'}])assert.throws(()=>parseGiftBoxPersonalizationIntent({...raw,sticker:{...raw.sticker,placement:{...raw.sticker.placement,...patch}}}));
 assert.throws(()=>parseGiftBoxPersonalizationIntent({...raw,sticker:{...raw.sticker,text:'\u062d\u0628'}}));
});
test('placement changes gift identity but never doubles sticker price or authorizes checkout',()=>{
 const raw=intent(),quote=priceGiftBoxPersonalization({intent:raw,boxId:'box-2',owner,uploads:[],options:[option]});assert.equal(quote.unitAdjustmentPiastres,2000);assert.deepEqual(quote.sticker.placement,raw.sticker.placement);assert.equal(quote.checkoutAuthorized,false);
 assert.throws(()=>priceGiftBoxPersonalization({intent:intent('box-1'),boxId:'box-2',owner,uploads:[],options:[option]}));
 const base={...giftCartConfiguration({roses:0,plush:false,chocolate:false,card:false}),contractVersion:'gift-box-commerce-v2',ribbonPlacement:{x:.2,y:.2,width:.1,height:.1,zone:'inside',layer:0},personalizationIntent:raw};
 const a=identifyGiftBoxConfiguration(base),b=identifyGiftBoxConfiguration({...base,personalizationIntent:{...raw,sticker:{...raw.sticker,placement:{...raw.sticker.placement,x:raw.sticker.placement.x+.01}}}});assert.notEqual(a.configurationId,b.configurationId);assert.ok(giftBoxV2CommerceInput.safeParse(a.configuration).success);
});
test('immutable order saves exact sticker pose, rejects tampering and exposes proof to owner/customer',()=>{
 const raw=intent(),configuration=identifyGiftBoxConfiguration({...giftCartConfiguration({roses:0,plush:false,chocolate:false,card:false}),contractVersion:'gift-box-commerce-v2',ribbonPlacement:{x:.2,y:.2,width:.1,height:.1,zone:'inside',layer:0},personalizationIntent:raw});
 const records=['box-2','ribbon-navy'].map(componentId=>({componentId,displayName:componentId,pricePiastres:1000,priceApproval:'paid',priceApprovedBy:actor,priceApprovedAt:new Date('2026-01-01'),enabled:true,available:true,__v:1,inventoryMode:getFixedComponent(componentId).category==='ribbon'?'status_only':'tracked',inventoryQuantity:componentId.startsWith('ribbon-')?null:20}));
 const base=prepareGiftBoxV2CommerceQuote({configuration:configuration.configuration,quantity:1},records,{fulfillmentPolicy:giftCartPolicy(),flexibleMadeToOrder:true});
 const personal=priceGiftBoxPersonalization({intent:raw,boxId:'box-2',owner,uploads:[],options:[option]});
 const line=giftBoxOrderLine({...base,...configuration,giftFulfillment:base.fulfillment,giftComponents:base.components.map(c=>({...c,priceApprovedBy:actor,priceApprovedAt:new Date('2026-01-01')})),giftPersonalization:personal,unitPricePiastres:base.unitPricePiastres+2000,lineTotalPiastres:base.lineTotalPiastres+2000});
 assert.deepEqual(line.giftBox.personalization.sticker.placement,raw.sticker.placement);const broken=structuredClone(line);broken.giftBox.personalization.sticker.placement.x+=.01;assert.equal(giftBoxOrderLineInput.safeParse(broken).success,false);
 const dto=presentOrder({_id:actor,orderNumber:'123456',lines:[line],totals:{subtotalPiastres:4000,totalPiastres:4000},customer:{},history:[]});assert.deepEqual(dto.lines[0].giftBox.personalization.sticker.placement,raw.sticker.placement);
});
