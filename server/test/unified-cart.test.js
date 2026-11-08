import {Order} from '../src/models/Order.js';
import {OrderSettlement} from '../src/models/OrderSettlement.js';
import {mutateOrderAccounting,orderAccounting} from '../src/commerce/order-accounting.js';
import {engravingAction} from '../src/engraving/workflow.js';
import {presentOrder} from '../src/commerce/order-presentation.js';
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
import {prepareCheckout,placeOrder,changeOrderState} from '../src/commerce/orders.js';
import {giftCartConfiguration,giftCartInput,seedGiftCartSettings} from './helpers/gift-box-cart-fixtures.js';

const owner=`guest:${'a'.repeat(64)}`,previous={...env};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC','base64');
let database,product,storage,config,actor;
before(async()=>{database=await startTestDatabase({transactions:true,models:Object.values(mongoose.models)});await GiftBoxComponentSetting.createCollection();await GiftBoxComponentSetting.createIndexes();await EngravingServiceConfiguration.createCollection();await EngravingServiceConfiguration.createIndexes();});
after(async()=>{Object.assign(env,previous);setStorageForTests();await database?.stop();});
beforeEach(async()=>{
  for(const Model of Object.values(mongoose.models))await Model.deleteMany({});
  Object.assign(env,{checkoutEnabled:true,giftBoxBuilderBackendEnabled:true,giftBoxDirectCommerceEnabled:true,giftBoxFlexibleMadeToOrderEnabled:true,engravingEnabled:true,engravingConfigurationEnabled:true});
  const admin=await User.create({name:'Synthetic admin',email:'unified-cart@example.test',passwordHash:'fixture',role:'admin'});
  actor=admin;
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
const customer={name:'Isolated Customer',email:'release3@example.test',phone:'01012345678',governorate:'cairo',address:'Disposable test address 10 Cairo'};
async function create(kinds,method='instapay') {
  await fill(kinds);const checkoutKey=randomUUID();await prepareCheckout(owner,{checkoutKey,paymentMethod:method,governorate:'cairo'});
  const request={checkoutKey,paymentMethod:method,customer};
  const result=await placeOrder(owner,request);
  return {order:await Order.findById(result.id).lean(),request};
}
async function account(order,input,who=actor) {
  const current=await Order.findById(order._id).lean();
  return mutateOrderAccounting(String(order._id),owner,{revision:current.revision,...input},who);
}
async function work(order,action,extra={},who=actor) {
  const current=await Order.findById(order._id).lean();
  return engravingAction(String(order._id),{revision:current.revision,operationKey:randomUUID(),itemKey:current.engraving.items[0].itemKey,action,...extra},who,owner);
}
async function proof(order,scope) {
  const signed=await signUpload(owner,{purpose:'payment_proof',orderId:String(order._id),paymentScope:scope,mimeType:'image/png',sizeBytes:png.length});
  const record=await Upload.findById(signed.upload.id).select('+temporaryKey');storage.put(record.temporaryKey,png);await completeUpload(record._id,owner);
  await account(order,{action:'submit_proof',scope,uploadId:String(record._id)},null);return String(record._id);
}
async function freeCharge(order,chargeId) {
  await account(order,{action:'quote_charge',chargeId,pricing:'free',collectionMethod:'cod',codAuthorized:true});
  await account(order,{action:'accept_charge',chargeId,accepted:true,customerConfirmed:true,reason:'Actual disposable customer agreement'});
}
for(const kinds of [['product'],['gift'],['engraving'],['product','gift'],['product','engraving'],['gift','engraving'],['product','gift','engraving']]) for(const method of ['cod','instapay']) {
  test(`one immutable ${method} order: ${kinds.join(' + ')}`,async()=>{
    const {order,request}=await create(kinds,method);
    assert.equal(order.lines.length,kinds.length);assert.equal(order.paymentState,method==='instapay'&&!kinds.includes('engraving')?'awaiting_transfer':'unpaid');
    assert.equal((await placeOrder(owner,request)).id,String(order._id));assert.equal(await Order.countDocuments(),1);
    assert.equal((await Product.findById(product._id)).inventory.quantity,kinds.includes('product')?2:3);
    if(order.accountingVersion===2){
      assert.equal(order.paymentGroups.reduce((sum,group)=>sum+group.amountPiastres,0),order.totals.totalPiastres);
      assert.equal(order.inventoryClaims.some(claim=>claim.kind==='engraving_service_v1'),false);
      if(kinds.includes('engraving'))assert.equal((await orderAccounting(order)).groups.find(group=>group.id==='engraving').status,'deferred');
    }
    await assert.rejects(placeOrder(owner,{...request,customer:{...customer,name:'Changed request'}}),{code:'IDEMPOTENCY_CONFLICT'});
  });
}
test('mixed obligations: merchandise payment never authorizes engraving; COD commitment is not collected cash',async()=>{
  let {order}=await create(['product','gift','engraving']);
  const merchandise=order.paymentGroups.find(group=>group.id==='merchandise').amountPiastres;
  await assert.rejects(account(order,{action:'collection',scope:'engraving',operationKey:randomUUID(),amountPiastres:10000,method:'instapay',reference:'EARLY',reconciled:true,exceptionConfirmed:true,reason:'Must never bypass inspection'}),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  assert.deepEqual(presentOrder(order).paymentInstructionsByGroup.map(group=>group.scope),['merchandise']);
  await proof(order,'merchandise');
  const collection={revision:(await Order.findById(order._id)).revision,action:'collection',scope:'merchandise',operationKey:randomUUID(),amountPiastres:merchandise,method:'instapay',reference:'MERCHANDISE-TRANSFER',reconciled:true,reason:'Actual fixture transfer reconciled'};
  await account(order,collection);await account(order,collection);assert.equal(await OrderSettlement.countDocuments(),1);
  order=await Order.findById(order._id).lean();assert.equal(order.paymentState,'partially_paid');
  await assert.rejects(work(order,'start'),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
  await freeCharge(order,'shipping');
  for(const fulfillmentState of ['confirmed','preparing','out_for_delivery','delivered']) {
    const current=await Order.findById(order._id).lean();await changeOrderState(String(order._id),null,{revision:current.revision,fulfillmentState},actor);
  }
  order=await Order.findById(order._id).lean();assert.equal(order.merchandiseFulfillment,'delivered');assert.notEqual(order.fulfillmentState,'delivered');
  await work(order,'receive',{condition:'Intact customer-owned item'});await work(order,'inspect');await work(order,'propose',{placementId:'front'});
  await work(order,'accept',{proposalVersion:1,customerConfirmed:true,internalNote:'Actual customer approved final design'});
  await work(order,'authorize_payment',{collectionMethod:'cod',codAuthorized:true,internalNote:'Owner authorizes cash at agreed handoff'});
  await assert.rejects(work(order,'start'),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
  await work(order,'accept_cod',{customerConfirmed:true},null);
  order=await Order.findById(order._id).lean();assert.equal((await orderAccounting(order)).groups.find(group=>group.id==='engraving').status,'cod_committed');assert.equal(await OrderSettlement.countDocuments(),1);
  await work(order,'start');await work(order,'complete');await freeCharge(order,'return_shipping');await work(order,'arrange_return',{publicReason:'Agreed customer handoff'});
  const cash={action:'collection',scope:'engraving',operationKey:randomUUID(),amountPiastres:10000,method:'cod',reference:'ACTUAL-CASH-RECEIPT',reconciled:true,reason:'Cash physically received on return'};
  await assert.rejects(account(order,cash),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  await work(order,'dispatch_return');await account(order,cash);
  await assert.rejects(account(order,{...cash,operationKey:randomUUID(),reference:'EXCESS-CASH',amountPiastres:1}),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  await work(order,'return_to_customer',{publicReason:'Actually handed back to customer'});
  order=await Order.findById(order._id).lean();assert.equal(order.fulfillmentState,'delivered');assert.equal(order.paymentState,'paid');
  const source=await OrderSettlement.findOne({reference:'ACTUAL-CASH-RECEIPT'}).lean();
  const refund={revision:(await Order.findById(order._id)).revision,action:'refund',operationKey:randomUUID(),amountPiastres:2500,allocations:[{scope:'engraving',amountPiastres:2500}],method:'cod',reference:'ACTUAL-PARTIAL-REFUND',refundOf:String(source._id),reconciled:true,reason:'Actual agreed remedy',reducePayable:true};
  await account(order,refund);await account(order,refund);
  const financial=await orderAccounting(await Order.findById(order._id).lean());assert.equal(financial.refundedPiastres,2500);assert.equal(financial.overpaymentPiastres,0);assert.equal(financial.outstandingPiastres,0);
});
test('post-inspection InstaPay proof is obligation-bound, single-use and cannot overcollect',async()=>{
  const {order}=await create(['engraving']);
  await work(order,'receive',{condition:'Intact'});await work(order,'inspect');await work(order,'propose',{placementId:'front'});await work(order,'accept',{proposalVersion:1,customerConfirmed:true,internalNote:'Customer accepted'});await work(order,'authorize_payment',{collectionMethod:'instapay'});
  const uploadId=await proof(order,'engraving');
  const input={action:'collection',scope:'engraving',operationKey:randomUUID(),amountPiastres:4000,method:'instapay',reference:'PARTIAL-ENGRAVING',reconciled:true,reason:'Actual partial transfer'};
  await account(order,input);
  await assert.rejects(account(order,{...input,operationKey:randomUUID(),reference:'REUSED-PROOF'}),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  await assert.rejects(account(order,{action:'submit_proof',scope:'merchandise',uploadId},null),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  await proof(order,'engraving');await account(order,{...input,operationKey:randomUUID(),reference:'ENGRAVING-BALANCE',amountPiastres:6000});
  await work(order,'start');assert.equal((await Order.findById(order._id)).engraving.items[0].stage,'engraving_in_progress');
});
test('concurrent mixed submissions claim stock once and preserve one order identity',async()=>{
  await fill(['product','gift','engraving']);const checkoutKey=randomUUID();await prepareCheckout(owner,{checkoutKey,paymentMethod:'cod',governorate:'cairo'});
  const request={checkoutKey,paymentMethod:'cod',customer};
  const results=await Promise.all([placeOrder(owner,request),placeOrder(owner,request)]);
  assert.equal(results[0].id,results[1].id);assert.equal(await Order.countDocuments(),1);assert.equal((await Product.findById(product._id)).inventory.quantity,2);
});
test('mixed cancellation restores merchant stock once and preserves received customer-property custody',async()=>{
  const {order}=await create(['product','gift','engraving'],'cod');await work(order,'receive',{condition:'Customer item received intact'});
  await account(order,{action:'cancel',reconciled:true,reason:'Actual cancellation before any work'});
  const cancelled=await Order.findById(order._id).lean();assert.equal(cancelled.fulfillmentState,'cancelled');assert.equal(cancelled.engraving.items[0].inCustody,true);assert.equal((await Product.findById(product._id)).inventory.quantity,3);
  await assert.rejects(account(order,{action:'cancel',reconciled:true,reason:'Duplicate cancellation'}),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  assert.equal((await Product.findById(product._id)).inventory.quantity,3);
  await work(order,'arrange_return',{publicReason:'Return unengraved customer property'});await work(order,'return_to_customer',{publicReason:'Actually returned safely'});
  assert.equal((await Order.findById(order._id)).engraving.items[0].inCustody,false);
});
test('group accounting never exposes private acceptance evidence and rejects stale concurrent collections',async()=>{
  const {order}=await create(['gift']);await freeCharge(order,'shipping');await proof(order,'merchandise');
  const current=await Order.findById(order._id).lean(),amount=current.paymentGroups[0].amountPiastres;
  const base={revision:current.revision,action:'collection',scope:'merchandise',amountPiastres:amount,method:'instapay',reconciled:true,reason:'Verified account transfer'};
  const results=await Promise.allSettled([account(order,{...base,operationKey:randomUUID(),reference:'CONCURRENT-A'}),account(order,{...base,operationKey:randomUUID(),reference:'CONCURRENT-B'})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(await OrderSettlement.countDocuments(),1);
  const financial=await orderAccounting(await Order.findById(order._id).lean());assert.equal(financial.collectedPiastres,amount);assert.equal(JSON.stringify(financial).includes('Actual disposable customer agreement'),false);
});
test('returned merchandise can be reconciled while customer engraving custody stays separate',async()=>{
  const {order}=await create(['product','engraving'],'cod');await freeCharge(order,'shipping');
  for(const fulfillmentState of ['confirmed','preparing','out_for_delivery','delivered','returned']) {
    const current=await Order.findById(order._id).lean();await changeOrderState(String(order._id),null,{revision:current.revision,fulfillmentState,publicReason:'Actual disposable delivery / return'},actor);
  }
  const current=await Order.findById(order._id).lean();assert.notEqual(current.fulfillmentState,'delivered');
  assert.equal((await orderAccounting(current)).groups.find(group=>group.id==='merchandise').authorized,false);
  await assert.rejects(account(order,{action:'collection',scope:'merchandise',operationKey:randomUUID(),amountPiastres:25000,method:'cod',reference:'RETURNED-NOT-PAYABLE',reconciled:true,reason:'Must not request returned merchandise payment'}),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  await account(order,{action:'inventory_return',inspected:true,quantities:current.inventoryClaims.map(claim=>claim.quantity),reason:'Inspected actual resellable return'});
  assert.equal((await Product.findById(product._id)).inventory.quantity,3);
});
test('unsuitable unengraved property returns without a service charge or fictitious delivery',async()=>{
  const {order}=await create(['engraving']);await work(order,'receive',{condition:'Actually received'});await work(order,'inspect');await work(order,'unsuitable',{publicReason:'Material unsuitable for safe engraving'});
  await freeCharge(order,'return_shipping');await work(order,'arrange_return',{publicReason:'Agreed safe return without work'});await work(order,'return_to_customer',{publicReason:'Actually returned unengraved'});
  const saved=await Order.findById(order._id).lean(),financial=await orderAccounting(saved);
  assert.equal(saved.totals.totalPiastres,10000);assert.equal(saved.fulfillmentState,'completed_with_changes');assert.equal(saved.paymentState,'unpaid');assert.equal(saved.engraving.items[0].inCustody,false);
  assert.equal(financial.groups[0].status,'not_provided');assert.equal(financial.groups[0].payablePiastres,0);assert.equal(financial.collectedPiastres,0);assert.equal(financial.outstandingPiastres,0);assert.deepEqual(presentOrder(saved).paymentInstructionsByGroup,[]);
});
for(const [label,kinds,allowed] of [
  ['product only',['product'],true],['Gift Box only',['gift'],true],['product + Gift Box',['product','gift'],true],
  ['multiple Gift Boxes',['gift','gift'],true],['engraving only',['engraving'],true],
  ['product + engraving',['product','engraving'],true],['Gift Box + engraving',['gift','engraving'],true],
  ['product + Gift Box + engraving',['product','gift','engraving'],true],
])test(`${label}: real cart and quote agree with the unified checkout policy`,async()=>{
  await fill(kinds);const result=await cartResponse(owner),before=await Cart.findOne({owner}).lean();
  assert.equal(result.checkoutEnabled,allowed);assert.equal(result.mixedCheckout,kinds.includes('engraving') && kinds.some(kind=>kind!=='engraving'));
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
