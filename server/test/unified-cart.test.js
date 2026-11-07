import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {startTestDatabase} from './helpers/database.js';
import {env} from '../src/config/env.js';
import {Cart} from '../src/models/Cart.js';
import {Category} from '../src/models/Category.js';
import {Product} from '../src/models/Product.js';
import {User} from '../src/models/User.js';
import {Upload} from '../src/models/Upload.js';
import {GiftBoxComponentSetting} from '../src/models/GiftBoxComponentSetting.js';
import {EngravingServiceConfiguration} from '../src/models/EngravingServiceConfiguration.js';
import {publishConfiguration} from '../src/engraving/configuration.js';
import {engravingQuote} from '../src/engraving/pricing.js';
import {INITIAL_ENGRAVING_TYPES,FONT_REGISTRY,ICON_REGISTRY} from '../../shared/engraving/definitions.mjs';
import {signUpload,completeUpload} from '../src/commerce/uploads.js';
import {commerceOwnerContext} from '../src/commerce/ownership.js';
import {createMemoryStorage,setStorageForTests} from '../src/commerce/storage.js';
import {addCartItem,cartResponse,quoteCart,updateCartQuantity,removeCartItem} from '../src/commerce/cart.js';
import {prepareCheckout} from '../src/commerce/orders.js';
import {giftCartConfiguration,giftCartInput,seedGiftCartSettings} from './helpers/gift-box-cart-fixtures.js';

const owner=`guest:${'a'.repeat(64)}`,previous={...env};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC','base64');
let database,product,storage,config;
before(async()=>{database=await startTestDatabase({transactions:true,models:Object.values(mongoose.models)});await GiftBoxComponentSetting.createCollection();await GiftBoxComponentSetting.createIndexes();await EngravingServiceConfiguration.createCollection();await EngravingServiceConfiguration.createIndexes();});
after(async()=>{Object.assign(env,previous);setStorageForTests();await database?.stop();});
beforeEach(async()=>{
  for(const Model of Object.values(mongoose.models))await Model.deleteMany({});
  Object.assign(env,{checkoutEnabled:true,giftBoxBuilderBackendEnabled:true,giftBoxDirectCommerceEnabled:true,giftBoxFlexibleMadeToOrderEnabled:true,engravingEnabled:true,engravingConfigurationEnabled:true});
  const admin=await User.create({name:'Synthetic admin',email:'unified-cart@example.test',passwordHash:'fixture',role:'admin'});
  const category=await Category.create({name:'Synthetic category',slug:'unified-cart-fixture',active:true});
  product=await Product.create({name:'Synthetic product',slug:'unified-product',categoryId:category._id,mainImageKey:'fixtures/unified.webp',galleryKeys:['fixtures/unified.webp'],status:'ready',visibility:'public',pricePiastres:25000,priceApproved:true,inventory:{mode:'tracked',quantity:3,approved:true,available:true}});
  await seedGiftCartSettings(admin._id);
  storage=createMemoryStorage();setStorageForTests(storage);
  config=await publishConfiguration({...INITIAL_ENGRAVING_TYPES[0],status:'active',assetsApproved:true,fontIds:[FONT_REGISTRY[0].id],iconIds:[ICON_REGISTRY[0].id],placements:[{id:'front',label:'Front',status:'active',displayOrder:0}]},0,admin);
});
async function engraving(){
  const itemKey=randomUUID();
  const signed=await signUpload(owner,{purpose:'engraving_service',ownerContext:commerceOwnerContext(owner),engravingItemKey:itemKey,fieldKey:'item_photo',mimeType:'image/png',sizeBytes:png.length});
  const record=await Upload.findById(signed.upload.id).select('+temporaryKey');storage.put(record.temporaryKey,png);await completeUpload(record._id,owner);
  const specification={contractVersion:'engraving-spec-v1',itemKey,typeId:config.typeId,configurationVersion:config.version,description:'',placement:{kind:'help'},content:{mode:'text',text:'For Nour',fontId:FONT_REGISTRY[0].id},requestedAppearance:'black',specialRequests:'',itemPhotoUploadId:String(record._id)};
  return {kind:'engraving_service_v1',quantity:1,operationKey:randomUUID(),specification,reviewFingerprint:(await engravingQuote(specification,owner)).reviewFingerprint};
}
async function fill(kinds){for(const [index,kind] of kinds.entries()){await addCartItem(owner,kind==='product'?{kind,productId:String(product._id),quantity:1}:kind==='gift'?giftCartInput(giftCartConfiguration({x:.3+index*.03})):await engraving());}}
const quote=()=>prepareCheckout(owner,{checkoutKey:randomUUID(),paymentMethod:'instapay',governorate:'cairo'});
for(const [label,kinds,allowed] of [
  ['product only',['product'],true],['Gift Box only',['gift'],true],['product + Gift Box',['product','gift'],true],
  ['multiple Gift Boxes',['gift','gift'],true],['engraving only',['engraving'],true],
  ['product + engraving',['product','engraving'],false],['Gift Box + engraving',['gift','engraving'],false],
  ['product + Gift Box + engraving',['product','gift','engraving'],false],
])test(`${label}: real cart and quote agree without changing cart or payment policy`,async()=>{
  await fill(kinds);const result=await cartResponse(owner),before=await Cart.findOne({owner}).lean();
  assert.equal(result.checkoutEnabled,allowed);assert.equal(result.mixedCheckout,!allowed);
  assert.ok(result.cart.items.every(item=>item.valid));
  for(const item of result.cart.items.filter(item=>item.kind==='product'))assert.equal(Object.hasOwn(item,'checkoutAllowed'),false);
  if(allowed){const prepared=await quote();assert.equal(prepared.totalPiastres,result.cart.subtotalPiastres);}
  else await assert.rejects(quote(),error=>error.code==='ENGRAVING_MIXED_CHECKOUT');
  const after=await Cart.findOne({owner}).lean();assert.deepEqual(after.items,before.items);
  assert.equal(await mongoose.connection.collection('orders').countDocuments(),0);
});
test('invalid product blocks a valid Gift Box and strict quote',async()=>{
  await fill(['product','gift']);await Product.updateOne({_id:product._id},{$set:{'inventory.quantity':0}});
  const result=await cartResponse(owner);assert.equal(result.checkoutEnabled,false);assert.equal(result.cart.items.find(i=>i.kind==='gift_box_v2').valid,true);
  await assert.rejects(quote(),error=>error.code==='INSUFFICIENT_STOCK'||error.code==='PRODUCT_UNAVAILABLE');
});
test('expired private upload blocks otherwise valid lines without extending retention',async()=>{
  await fill(['engraving']);await Upload.updateMany({},{$set:{expiresAt:new Date(Date.now()-1000)}});
  const result=await cartResponse(owner);assert.equal(result.checkoutEnabled,false);assert.equal(result.cart.items[0].attachments.replacementRequired,true);
  await assert.rejects(quote(),error=>error.code==='INVALID_UPLOAD_REFERENCES');
});
test('aggregate Gift Box stock limits are exposed and revalidated for updates and strict quotes',async()=>{
  await fill(['gift','gift']);let result=await cartResponse(owner);
  assert.equal(result.cart.items[0].maxQuantity,5);
  await assert.rejects(updateCartQuantity(owner,result.cart.items[0].id,6),error=>error.code==='GIFT_BOX_STOCK_EXCEEDED');
  await GiftBoxComponentSetting.updateOne({componentId:'rose-red'},{$set:{inventoryQuantity:5}});
  result=await cartResponse(owner);assert.equal(result.checkoutEnabled,false);assert.ok(result.cart.items.every(item=>!item.valid));
  await assert.rejects(quote());
});
test('product bounds and fixed engraving quantity retain server fences; removal is idempotent',async()=>{
  await fill(['product']);const result=await cartResponse(owner),item=result.cart.items[0];assert.equal(item.maxQuantity,3);
  await assert.rejects(updateCartQuantity(owner,item.id,4),error=>error.code==='INSUFFICIENT_STOCK');
  await removeCartItem(owner,item.id);await removeCartItem(owner,item.id);assert.equal((await cartResponse(owner)).cart.items.length,0);
  await fill(['engraving']);await assert.rejects(updateCartQuantity(owner,(await cartResponse(owner)).cart.items[0].id,2),error=>error.code==='ENGRAVING_QUANTITY_FIXED');
});
test('global and service capabilities fail closed without deleting saved items',async()=>{
  await fill(['product','gift']);env.checkoutEnabled=false;assert.equal((await cartResponse(owner)).checkoutEnabled,false);await assert.rejects(quote(),error=>error.code==='CHECKOUT_DISABLED');
  env.checkoutEnabled=true;env.giftBoxDirectCommerceEnabled=false;assert.equal((await cartResponse(owner)).checkoutEnabled,false);await assert.rejects(quote(),error=>error.code==='GIFT_BOX_CHECKOUT_DISABLED');
  assert.equal((await Cart.findOne({owner})).items.length,2);
  await Cart.deleteMany({});await fill(['engraving']);env.engravingEnabled=false;
  assert.equal((await cartResponse(owner)).checkoutEnabled,false);await assert.rejects(quote());
});
test('Gift Box component snapshots and legacy technical names remain unchanged by presentation',async()=>{
  await addCartItem(owner,giftCartInput(giftCartConfiguration()));const stored=await Cart.findOne({owner}).lean();assert.equal(stored.items[0].name,'Build Your Gift Box');
  assert.equal((await cartResponse(owner)).cart.items[0].name,'Gift Box');assert.equal((await quoteCart(owner)).items[0].name,'Build Your Gift Box');
});

for(const mode of ['tracked','made_to_order'])test(`${mode}: other configured product lines do not reduce the per-line cap when stock is ample or untracked`,async()=>{
  await Product.updateOne({_id:product._id},{$set:{'inventory.mode':mode,'inventory.quantity':1000,'personalization.fields':[{key:'note',label:'Gift note',type:'short_text',required:false,maxLength:40}]}});
  for(const note of ['First recipient','Second recipient'])await addCartItem(owner,{kind:'product',productId:String(product._id),quantity:1,personalization:{note}});
  const result=await cartResponse(owner);assert.equal(result.cart.items.length,2);
  for(const item of result.cart.items){assert.equal(item.maxQuantity,99);assert.equal(Object.hasOwn(item,'stockQuantityLimit'),false);}
  assert.equal((await Product.findById(product._id)).inventory.quantity,1000);
});
