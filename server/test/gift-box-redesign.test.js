import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Upload } from '../src/models/Upload.js';
import { Cart } from '../src/models/Cart.js';
import { Order } from '../src/models/Order.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { GiftBoxPersonalizationOption } from '../src/models/GiftBoxPersonalizationOption.js';
import { startTestDatabase } from './helpers/database.js';
import { giftCartConfiguration, giftCartInput, seedGiftCartSettings } from './helpers/gift-box-cart-fixtures.js';
import { identifyGiftBoxConfiguration, giftBoxV2CommerceInput } from '../src/gift-box/commerce-contract.js';
import { addCartItem, cartResponse } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder, presentOrder } from '../src/commerce/orders.js';
import { updateGiftBoxPersonalizationOption } from '../src/gift-box/personalization-options.js';
import { signUpload, completeUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { giftBoxOrderLineInput } from '../src/gift-box/order-snapshot.js';
import { initialArrangement, changeArrangement } from '../../client/src/gift-box/state.mjs';
import { prepareGiftBoxCommerceConfiguration } from '../../client/src/gift-box/commerce-payload.mjs';
const owner = `guest:${'a'.repeat(64)}`, other = `guest:${'b'.repeat(64)}`;
const keys = ['giftBoxBuilderBackendEnabled','giftBoxDirectCommerceEnabled','giftBoxFlexibleMadeToOrderEnabled','giftBoxPersonalizationOptionsEnabled','giftBoxPersonalizedCheckoutEnabled','checkoutEnabled'];
const previous = Object.fromEntries(keys.map(key => [key,env[key]]));
const customer = { name:'Synthetic design buyer', email:'design@example.test',phone:'01012345678',governorate:'cairo',address:'Isolated test address Cairo' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC','base64');
let database, admin, storage;
before(async () => { database = await startTestDatabase({ models:Object.values(mongoose.models), transactions:true });
  for (const Model of [GiftBoxComponentSetting,GiftBoxPersonalizationOption]) { await Model.createCollection(); await Model.createIndexes(); }
});
beforeEach(async () => {
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  keys.forEach(key => { env[key] = true; }); storage = createMemoryStorage(); setStorageForTests(storage);
  admin = await User.create({name:'Design test admin',email:'design-admin@example.test',passwordHash:'fixture',role:'admin'});
  await seedGiftCartSettings(admin._id);
  for (const [optionId,kind] of [['print','photo_print'],['sticker','box_sticker']]) await updateGiftBoxPersonalizationOption(optionId,{ expectedRevision:0,kind,displayName:kind,boxIds:['box-2'],pricePiastres:2000,enabled:true,available:true,
    ...(kind === 'box_sticker' ? {fontLicensesConfirmed:true,approvedStyleIds:['sticker-amiri-v1'],approvedColorIds:['black','gold']} : {}) },admin);
});
after(async () => { Object.assign(env,previous); setStorageForTests(null); await database?.stop(); });
function configuration() {
  const legacy = giftCartConfiguration({roses:1,plush:false,chocolate:true,card:false});
  return { ...legacy,contractVersion:'gift-box-commerce-v2',placements:legacy.placements.map(item => ({...item,regionId:'workspace',width:.12,height:.14,zone:'beside'})),
    ribbonPlacement:{ x:.74,y:.76,width:.23,height:.16,zone:'beside',layer:110 } };
}
async function personalized({photoOwner=owner}={}) {
  const signed = await signUpload(photoOwner,{purpose:'gift_box_photo',giftBoxId:'box-2',mimeType:'image/png',sizeBytes:PNG.length});
  const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey,PNG); await completeUpload(signed.upload.id,photoOwner);
  return { ...configuration(),personalizationIntent:{version:'gift-box-personalization-intent-v2',photoPrints:[{uploadId:signed.upload.id,printOptionId:'print',zone:'beside',x:.8,y:.5}],engravings:[],
    sticker:{text:'\u0623\u062d\u0645\u062f With love',styleId:'sticker-amiri-v1',colorId:'gold',optionId:'sticker',application:'exterior-front'} } };
}
async function checkout() {
  const input = { checkoutKey:randomUUID(),paymentMethod:'instapay',customer };
  const quote = await prepareCheckout(owner,{...input,governorate:'cairo'}); return { input,quote };
}
test('free placement persists every pose and ribbon; v1 remains unchanged', () => {
  let state = {...initialArrangement(),freePlacement:true};
  state = changeArrangement(state,{type:'box',id:'box-2'});
  state = changeArrangement(state,{type:'add',id:'rose-red',instanceId:randomUUID(),study:true,flexible:true});
  state = changeArrangement(state,{type:'move',id:state.instances[0].id,study:true,position:{x:.82,y:.05},zone:'beside'});
  state = changeArrangement(state,{type:'ribbon',id:'ribbon-navy'});
  state = changeArrangement(state,{type:'ribbon-move',position:{x:.7,y:.7},zone:'beside'});
  const raw = prepareGiftBoxCommerceConfiguration(state), canonical = identifyGiftBoxConfiguration(raw);
  assert.equal(canonical.configuration.placements[0].x,.82); assert.equal(canonical.configuration.placements[0].zone,'beside');
  assert.equal(canonical.configuration.ribbonPlacement.x,.7);
  assert.equal(identifyGiftBoxConfiguration(JSON.parse(JSON.stringify(canonical.configuration))).configurationId,canonical.configurationId);
  assert.ok(giftBoxV2CommerceInput.safeParse(giftCartConfiguration()).success);
  assert.ok(!giftBoxV2CommerceInput.safeParse({...giftCartConfiguration(),ribbonPlacement:null}).success);
  const bad = structuredClone(raw); bad.placements[0].x = 1; assert.ok(!giftBoxV2CommerceInput.safeParse(bad).success);
});
test('verified photo + sticker: mixed cart, exact saved prices, frozen order, retry and admin reconstruction',async () => {
  const category = await Category.create({name:'Design test',slug:'design-test',active:true});
  const product = await Product.create({name:'Ordinary fixture',slug:'ordinary-fixture',categoryId:category._id,mainImageKey:'test.webp',galleryKeys:['test.webp'],visibility:'public',status:'ready',pricePiastres:9000,priceApproved:true,inventory:{mode:'tracked',quantity:5,approved:true,available:true}});
  await addCartItem(owner,{productId:String(product._id),quantity:1});
  const design = await personalized(), input = giftCartInput(design); await addCartItem(owner,input); await addCartItem(owner,input);
  const cart = await cartResponse(owner); assert.equal(cart.cart.items.length,2); assert.equal(cart.cart.subtotalPiastres,51000);
  assert.equal(cart.cart.items[1].giftBox.personalization.sticker.application,'exterior-front');
  assert.ok(!JSON.stringify(cart).includes(design.personalizationIntent.photoPrints[0].uploadId));
  const {input:orderInput} = await checkout(); const first = await placeOrder(owner,orderInput), second = await placeOrder(owner,orderInput);
  assert.equal(first.id,second.id); assert.equal(await Order.countDocuments(),1); assert.equal(first.paymentState,'awaiting_transfer');
  const saved = await Order.findById(first.id).lean(), gift = saved.lines.find(line => line.kind === 'gift_box_v2');
  assert.ok(giftBoxOrderLineInput.safeParse(gift).success);
  assert.equal(gift.giftBox.configuration.ribbonPlacement.x,.74); assert.equal(gift.giftBox.personalization.sticker.pricePiastres,2000);
  assert.equal(gift.giftBox.personalization.photoPrints[0].x,.8);
  assert.equal((await Upload.findById(design.personalizationIntent.photoPrints[0].uploadId)).state,'retained');
  const dto = presentOrder(saved,{admin:true}); assert.equal(dto.lines[1].giftBox.configuration.placements[0].width,.12);
  assert.equal(dto.lines[1].giftBox.personalization.photoPrints.length,1); assert.equal(dto.lines[1].giftBox.personalization.version,'gift-box-personalization-intent-v2'); assert.ok(!JSON.stringify(first).includes('uploadId'));
  await updateGiftBoxPersonalizationOption('sticker',{expectedRevision:2,pricePiastres:3000},admin);
  assert.equal((await Order.findById(first.id).lean()).lines[1].giftBox.personalization.sticker.pricePiastres,2000);
});
test('foreign and expired photos fail closed without orders',async () => {
  await assert.rejects(addCartItem(owner,giftCartInput(await personalized({photoOwner:other}))),error => error.code === 'GIFT_BOX_UPLOAD_INVALID');
  const design = await personalized(); await Upload.updateOne({_id:design.personalizationIntent.photoPrints[0].uploadId},{$set:{expiresAt:new Date(0)}});
  await assert.rejects(addCartItem(owner,giftCartInput(design)),error => error.code === 'GIFT_BOX_UPLOAD_INVALID'); assert.equal(await Order.countDocuments(),0);
});
test('saved repricing and disabling invalidate checkout without changing component prices',async () => {
  await addCartItem(owner,giftCartInput(await personalized())); const {input} = await checkout();
  await updateGiftBoxPersonalizationOption('print',{expectedRevision:1,pricePiastres:2500},admin);
  assert.equal((await cartResponse(owner)).cart.subtotalPiastres,42500);
  await assert.rejects(placeOrder(owner,input),error => error.code === 'CHECKOUT_CHANGED');
  await updateGiftBoxPersonalizationOption('sticker',{expectedRevision:1,available:false},admin);
  assert.equal((await cartResponse(owner)).cart.items[0].valid,false);
  assert.equal((await GiftBoxComponentSetting.findOne({componentId:'box-2'})).pricePiastres,20000); assert.equal(await Order.countDocuments(),0);
});
test('independent personalized and general checkout switches remain closed',async () => {
  await addCartItem(owner,giftCartInput(await personalized())); env.giftBoxPersonalizedCheckoutEnabled = false;
  await assert.rejects(checkout(),error => error.code === 'GIFT_BOX_PERSONALIZED_CHECKOUT_DISABLED'); assert.equal((await cartResponse(owner)).checkoutEnabled,false);
  env.giftBoxPersonalizedCheckoutEnabled = true; env.giftBoxDirectCommerceEnabled = false;
  await assert.rejects(checkout(),error => error.code === 'GIFT_BOX_CHECKOUT_DISABLED'); assert.equal(await Order.countDocuments(),0); assert.equal(await Cart.countDocuments(),1);
});
test('admin immutable sticker kind, style identities and stale revisions are enforced',async () => {
  await assert.rejects(updateGiftBoxPersonalizationOption('sticker',{expectedRevision:0,pricePiastres:2100},admin),error => error.code === 'EDIT_CONFLICT');
  await assert.rejects(updateGiftBoxPersonalizationOption('sticker',{expectedRevision:1,kind:'engraving_surface',displayName:'Changed kind'},admin));
  await assert.rejects(updateGiftBoxPersonalizationOption('sticker',{expectedRevision:1,approvedStyleIds:['lettering-12']},admin));
  assert.equal((await GiftBoxPersonalizationOption.findOne({optionId:'sticker'})).pricePiastres,2000);
});
