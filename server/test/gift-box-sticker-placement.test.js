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
test('rotated text stays inside every canonical surface and historical poses remain unchanged',()=>{
 for(const [boxId,views]of Object.entries(STICKER_PROOFS))for(const [view,proof]of Object.entries(views)){
  const legacy=defaultStickerPlacement(boxId,view);
  assert.deepEqual(boundStickerPlacement(legacy),legacy);
  for(const rotation of [-180,-135,-90,-35,0,35,90,135,180]){
   const pose=boundStickerPlacement({...legacy,rotation,x:-1,y:2,width:1,height:1});
   assert.ok(validStickerPlacement(pose));
   const r=rotation*Math.PI/180,c=Math.abs(Math.cos(r)),s=Math.abs(Math.sin(r));
   const w=c*pose.width+s*pose.height*proof.height/proof.width,h=s*pose.width*proof.width/proof.height+c*pose.height;
   assert.ok(pose.x-w/2>=(proof.usableSurface || proof.surface).x-1e-7&&pose.x+w/2<=(proof.usableSurface || proof.surface).x+(proof.usableSurface || proof.surface).width+1e-7);
   assert.ok(pose.y-h/2>=(proof.usableSurface || proof.surface).y-1e-7&&pose.y+h/2<=(proof.usableSurface || proof.surface).y+(proof.usableSurface || proof.surface).height+1e-7);
  }
  for(const rotation of [NaN,Infinity,181,-181,null,'5'])assert.equal(validStickerPlacement({...legacy,rotation}),false);
 }
 const raw=intent();raw.sticker.placement=boundStickerPlacement({...raw.sticker.placement,rotation:25});
 assert.deepEqual(parseGiftBoxPersonalizationIntent(JSON.parse(JSON.stringify(raw))),raw);
});
test('expanded round faces contain all rotated rectangle corners including lower shoulders',()=>{
 for(const [boxId,views]of Object.entries(STICKER_PROOFS))for(const [view,proof]of Object.entries(views)){
  if(!proof.face)continue;
  for(const rotation of [-175,-120,-65,-15,0,40,95,150])for(const x of [-1,.5,2])for(const y of [-1,.5,2]){
   const pose=boundStickerPlacement({...defaultStickerPlacement(boxId,view),rotation,x,y,width:.7,height:.4});
   assert.ok(validStickerPlacement(pose));
   const r=rotation*Math.PI/180;
   for(const sx of [-1,1])for(const sy of [-1,1]){
    const dx=sx*pose.width*proof.width/2,dy=sy*pose.height*proof.height/2;
    const px=pose.x*proof.width+dx*Math.cos(r)-dy*Math.sin(r),py=pose.y*proof.height+dx*Math.sin(r)+dy*Math.cos(r);
    proof.face.forEach(([ax,ay],i)=>{const [bx,by]=proof.face[(i+1)%proof.face.length];assert.ok((bx-ax)*proof.width*(py-ay*proof.height)-(by-ay)*proof.height*(px-ax*proof.width)>=-1e-5,`${boxId}: rotated corner must stay inside photographed face`);});
   }
  }
  const edge=boundStickerPlacement({...defaultStickerPlacement(boxId,view),x:1,y:.5,width:.06,height:.04});
  assert.ok(edge.x>.88,'short text reaches the visible right edge');
 }
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
 const raw=intent();raw.sticker.placement=boundStickerPlacement({...raw.sticker.placement,rotation:-20});
 const configuration=identifyGiftBoxConfiguration({...giftCartConfiguration({roses:0,plush:false,chocolate:false,card:false}),contractVersion:'gift-box-commerce-v2',ribbonPlacement:{x:.2,y:.2,width:.1,height:.1,zone:'inside',layer:0},personalizationIntent:raw});
 const records=['box-2','ribbon-navy'].map(componentId=>({componentId,displayName:componentId,pricePiastres:1000,priceApproval:'paid',priceApprovedBy:actor,priceApprovedAt:new Date('2026-01-01'),enabled:true,available:true,__v:1,inventoryMode:getFixedComponent(componentId).category==='ribbon'?'status_only':'tracked',inventoryQuantity:componentId.startsWith('ribbon-')?null:20}));
 const base=prepareGiftBoxV2CommerceQuote({configuration:configuration.configuration,quantity:1},records,{fulfillmentPolicy:giftCartPolicy(),flexibleMadeToOrder:true});
 const personal=priceGiftBoxPersonalization({intent:raw,boxId:'box-2',owner,uploads:[],options:[option]});
 const line=giftBoxOrderLine({...base,...configuration,giftFulfillment:base.fulfillment,giftComponents:base.components.map(c=>({...c,priceApprovedBy:actor,priceApprovedAt:new Date('2026-01-01')})),giftPersonalization:personal,unitPricePiastres:base.unitPricePiastres+2000,lineTotalPiastres:base.lineTotalPiastres+2000});
 assert.deepEqual(line.giftBox.personalization.sticker.placement,raw.sticker.placement);const broken=structuredClone(line);broken.giftBox.personalization.sticker.placement.x+=.01;assert.equal(giftBoxOrderLineInput.safeParse(broken).success,false);
 const dto=presentOrder({_id:actor,orderNumber:'123456',lines:[line],totals:{subtotalPiastres:4000,totalPiastres:4000},customer:{},history:[]});assert.deepEqual(dto.lines[0].giftBox.personalization.sticker.placement,raw.sticker.placement);
});
