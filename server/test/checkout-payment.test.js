import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { startTestDatabase } from './helpers/database.js';
import { env } from '../src/config/env.js';
import { Category } from '../src/models/Category.js';
import { DiscountCode } from '../src/models/DiscountCode.js';
import { Product } from '../src/models/Product.js';
import { CheckoutIntent } from '../src/models/CheckoutIntent.js';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { OrderSettlement } from '../src/models/OrderSettlement.js';
import { addCartItem } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder, findOwnedCheckoutSubmission } from '../src/commerce/orders.js';
import { prepareCheckoutPayment, submitCheckoutPaymentProof, ownedCheckoutPayment, cancelCheckoutPayment, presentCheckoutPayment } from '../src/commerce/checkout-payment.js';
import { approvedInstaPayDestination } from '../src/commerce/order-presentation.js';
import { signUpload, completeUpload, openPrivateUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { initialPaymentGroups } from '../src/commerce/payment-groups.js';
import { publishConfiguration } from '../src/engraving/configuration.js';
import { engravingQuote } from '../src/engraving/pricing.js';
import { commerceOwnerContext } from '../src/commerce/ownership.js';
import { INITIAL_ENGRAVING_TYPES, FONT_REGISTRY, ICON_REGISTRY, UPFRONT_ENGRAVING_POLICY } from '../../shared/engraving/definitions.mjs';
import { mutateOrderAccounting, accountingSummary } from '../src/commerce/order-accounting.js';

const owner=`guest:${'a'.repeat(64)}`, other=`guest:${'b'.repeat(64)}`;
const customer={name:'Isolated Customer',phone:'01012345678',governorate:'cairo',address:'Disposable local fixture address'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC','base64');
let database,product,storage;const previous={...env};
before(async()=>{database=await startTestDatabase({models:Object.values(mongoose.models),transactions:true});});
after(async()=>{Object.assign(env,previous);setStorageForTests();await database?.stop();});
beforeEach(async()=>{
 for(const model of Object.values(mongoose.models))await model.deleteMany({});
 env.checkoutEnabled=true;storage=createMemoryStorage();setStorageForTests(storage);
 const category=await Category.create({name:'Fixture category',slug:'fixture-category'});
 product=await Product.create({name:'Fixture product',slug:'fixture-product',description:'Isolated test',categoryId:category._id,mainImageKey:'fixture/item.webp',galleryKeys:['fixture/item.webp'],visibility:'public',status:'ready',pricePiastres:12000,priceApproved:true,inventory:{mode:'tracked',quantity:5,approved:true,available:true}});
 await addCartItem(owner,{productId:String(product._id),quantity:1});
});
async function prepared(overrides={}){const input={checkoutKey:randomUUID(),paymentMethod:'instapay',governorate:'cairo',...overrides},quote=await prepareCheckout(owner,input);const payment=await prepareCheckoutPayment(owner,input.checkoutKey,quote.fingerprint,quote.paymentGroups);return {...input,quote,payment};}
async function proof(value,who=owner){const signed=await signUpload(who,{purpose:'payment_proof',checkoutKey:value.checkoutKey,mimeType:'image/png',sizeBytes:png.length});const row=await Upload.findById(signed.upload.id).select('+temporaryKey');storage.put(row.temporaryKey,png);await completeUpload(row._id,who);return String(row._id);}
const request=value=>({checkoutKey:value.checkoutKey,paymentMethod:value.paymentMethod,customer,...(value.discountCode?{discountCode:value.discountCode}:{})});

test('durable payment intent snapshots authoritative amount, destination and allocation without stock reservation',async()=>{
 const value=await prepared();assert.equal(value.payment.amountPiastres,12000);assert.equal(value.payment.destination,approvedInstaPayDestination);
 assert.deepEqual((await ownedCheckoutPayment(owner,value.checkoutKey)).payment.allocations,[{scope:'merchandise',amountPiastres:12000}]);
 assert.equal((await Product.findById(product._id)).inventory.quantity,5);
 assert.deepEqual(await prepareCheckoutPayment(owner,value.checkoutKey,value.quote.fingerprint,value.quote.paymentGroups),value.payment);
 await assert.rejects(ownedCheckoutPayment(other,value.checkoutKey),error=>error.code==='CHECKOUT_PAYMENT_NOT_FOUND');
 await assert.rejects(prepareCheckoutPayment(owner,value.checkoutKey,value.quote.fingerprint,[{id:'engraving',amountPiastres:1,method:'instapay'}]));
});
test('private proof validates sender, exact reference, completion and owner; repeated submission is immutable',async()=>{
 const value=await prepared(),id=await proof(value),second=await prepared();
 await assert.rejects(submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:id,senderName:'x'}));
 await assert.rejects(submitCheckoutPaymentProof(other,value.checkoutKey,{uploadId:id,senderName:'Fixture Sender'}));
 await assert.rejects(submitCheckoutPaymentProof(owner,second.checkoutKey,{uploadId:id,senderName:'Fixture Sender'}));
 await assert.rejects(openPrivateUpload(id,other));
 const body={uploadId:id,senderName:'Fixture Sender'},saved=await submitCheckoutPaymentProof(owner,value.checkoutKey,body);
 assert.equal(saved.proofReceived,true);assert.deepEqual(await submitCheckoutPaymentProof(owner,value.checkoutKey,body),saved);
 await assert.rejects(submitCheckoutPaymentProof(owner,value.checkoutKey,{...body,senderName:'Other Sender'}));
 await assert.rejects(cancelCheckoutPayment(owner,value.checkoutKey));
});
test('order acceptance retains proof atomically, stays awaiting verification and retries return the same order',async()=>{
 const value=await prepared(),id=await proof(value);await submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:id,senderName:'Fixture Sender'});
 const [a,b]=await Promise.all([placeOrder(owner,request(value)),placeOrder(owner,request(value))]);
 assert.equal(a.id,b.id);assert.equal(await Order.countDocuments(),1);assert.equal(a.paymentState,'awaiting_verification');assert.equal(await OrderSettlement.countDocuments(),0);
 assert.equal(String((await Upload.findById(id)).orderId),a.id);
 assert.equal(String((await findOwnedCheckoutSubmission(value.checkoutKey,owner))._id),a.id);
 await assert.rejects(placeOrder(owner,{...request(value),customer:{...customer,name:'Changed sender'}}),error=>error.code==='IDEMPOTENCY_CONFLICT');
});
test('expired instructions suppress destination; expired or changed checkout keeps evidence for reconciliation',async()=>{
 const value=await prepared(),id=await proof(value);
 await CheckoutIntent.updateOne({owner,checkoutKey:value.checkoutKey},{$set:{'payment.expiresAt':new Date(Date.now()-1)}});
 assert.equal(presentCheckoutPayment(await ownedCheckoutPayment(owner,value.checkoutKey),{actionable:true}).destination,undefined);
 await assert.rejects(signUpload(owner,{purpose:'payment_proof',checkoutKey:value.checkoutKey,mimeType:'image/png',sizeBytes:png.length}));
 await submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:id,senderName:'Fixture Sender'});
 await assert.rejects(placeOrder(owner,request(value)),error=>error.code==='CHECKOUT_PAYMENT_REVIEW_REQUIRED');
 assert.equal((await Upload.findById(id)).state,'retained');assert.equal(await Order.countDocuments(),0);
});
test('price and cart changes do not replace a possible transfer or destroy uploaded evidence',async()=>{
 const value=await prepared(),id=await proof(value);await submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:id,senderName:'Fixture Sender'});
 await Product.updateOne({_id:product._id},{$set:{pricePiastres:13000}});
 await assert.rejects(prepareCheckout(owner,value),error=>error.code==='CHECKOUT_PAYMENT_REVIEW_REQUIRED');
 await assert.rejects(placeOrder(owner,request(value)),error=>error.code==='CHECKOUT_PAYMENT_REVIEW_REQUIRED');
 assert.equal((await ownedCheckoutPayment(owner,value.checkoutKey)).payment.amountPiastres,12000);
 assert.equal((await Upload.findById(id)).state,'retained');
});
test('missing proof cannot place a prepared InstaPay order; explicit no-transfer cancellation allows a new COD checkout',async()=>{
 const value=await prepared();await assert.rejects(placeOrder(owner,request(value)),error=>error.code==='CHECKOUT_PAYMENT_REVIEW_REQUIRED');
 await cancelCheckoutPayment(owner,value.checkoutKey);assert.deepEqual(await cancelCheckoutPayment(owner,value.checkoutKey),{cancelled:true});await assert.rejects(prepareCheckout(owner,value));
 const cod={checkoutKey:randomUUID(),paymentMethod:'cod',governorate:'cairo'};await prepareCheckout(owner,cod);
 const accepted=await placeOrder(owner,request(cod));assert.equal(accepted.paymentState,'unpaid');assert.equal(accepted.paymentMethod,'cod');
});
test('expired file and changed cart are rejected without replacing the original transfer reference',async()=>{
 const value=await prepared(),id=await proof(value);
 await Upload.updateOne({_id:id},{$set:{expiresAt:new Date(Date.now()-1)}});
 await assert.rejects(submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:id,senderName:'Fixture Sender'}),error=>error.code==='INVALID_PAYMENT_PROOF');
 const valid=await proof(value);await submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:valid,senderName:'Fixture Sender'});
 await addCartItem(owner,{productId:String(product._id),quantity:1});
 await assert.rejects(placeOrder(owner,request(value)),error=>error.code==='CHECKOUT_PAYMENT_REVIEW_REQUIRED');
 assert.equal((await ownedCheckoutPayment(owner,value.checkoutKey)).payment.amountPiastres,12000);
});
test('failed acceptance rolls back stock and proof binding; the same reference remains recoverable',async()=>{
 const value=await prepared(),id=await proof(value);await submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:id,senderName:'Fixture Sender'});
 const save=Order.prototype.save;Order.prototype.save=async function(){throw Error('Synthetic order save outage');};
 try{await assert.rejects(placeOrder(owner,request(value)),/Synthetic order save outage/);}finally{Order.prototype.save=save;}
 assert.equal((await Product.findById(product._id)).inventory.quantity,5);
 assert.equal((await Upload.findById(id)).orderId,undefined);
 assert.equal((await Upload.findById(id)).state,'retained');assert.equal(await Order.countDocuments(),0);
 const accepted=await placeOrder(owner,request(value));assert.equal(accepted.paymentState,'awaiting_verification');
});
for(const discounted of [false,true])test(`mixed checkout allocations reconcile one actual transfer once, discounted=${discounted}`,async()=>{
 const groups=initialPaymentGroups([{kind:'product',lineTotalPiastres:12000},{kind:'engraving_service_v2',lineTotalPiastres:10000}],{totalPiastres:20000},'instapay',UPFRONT_ENGRAVING_POLICY);
 assert.deepEqual(groups.map(group=>group.amountPiastres),[10000,10000]);
 const actor={_id:new mongoose.Types.ObjectId(),role:'admin'};
 Object.assign(env,{engravingEnabled:true,engravingConfigurationEnabled:true});
 const config=await publishConfiguration({...INITIAL_ENGRAVING_TYPES[0],pricePiastres:10000,status:'active',assetsApproved:true,fontIds:FONT_REGISTRY.map(font=>font.id),iconIds:[ICON_REGISTRY[0].id],placements:[{id:'front',label:'Front',status:'active',displayOrder:0}]},0,actor);
 const itemKey=randomUUID(),signed=await signUpload(owner,{purpose:'engraving_service',ownerContext:commerceOwnerContext(owner),engravingItemKey:itemKey,fieldKey:'surface_photo',mimeType:'image/png',sizeBytes:png.length});
 const image=await Upload.findById(signed.upload.id).select('+temporaryKey');storage.put(image.temporaryKey,png);await completeUpload(image._id,owner);const surface=String(image._id);
 const spec={contractVersion:'engraving-spec-v2',itemKey,typeId:INITIAL_ENGRAVING_TYPES[0].typeId,configurationVersion:config.version,description:'',placement:{kind:'help'},surfacePhotoUploadId:surface,itemPhotoUploadIds:[],design:{version:'visual-engraving-v1',surface:{assetId:surface,aspectRatio:1},layers:[{id:'text',type:'text',text:'Fixture',fontId:FONT_REGISTRY.find(font=>font.language==='en').id,color:'black',x:.5,y:.5,width:.3,aspectRatio:3,rotation:120}]},specialRequests:''};
 await addCartItem(owner,{kind:'engraving_service_v2',operationKey:randomUUID(),quantity:1,specification:spec,reviewFingerprint:(await engravingQuote(spec,owner)).reviewFingerprint});
 if(discounted)await DiscountCode.create({code:'ISOLATED',name:'Isolated full merchandise discount',active:true,kind:'percentage',value:10000});
 const value=await prepared(discounted?{discountCode:'ISOLATED'}:{}),id=await proof(value);await submitCheckoutPaymentProof(owner,value.checkoutKey,{uploadId:id,senderName:'Fixture Sender'});const accepted=await placeOrder(owner,request(value));
 assert.equal(accepted.checkoutPayment.amountPiastres,discounted?10000:22000);assert.equal(accepted.lines.find(line=>line.kind==='engraving_service_v2').engraving.layers[0].rotation,120);
 const operation={action:'collection',revision:0,scope:'checkout',method:'instapay',amountPiastres:discounted?10000:22000,reference:'ISOLATED-TRANSFER-1',operationKey:randomUUID(),reconciled:true,reason:'Isolated receiving account reconciliation'};
 const result=await mutateOrderAccounting(accepted.id,null,operation,actor);assert.equal(result.paymentState,'paid');
 await mutateOrderAccounting(accepted.id,null,operation,actor);assert.equal(await OrderSettlement.countDocuments(),1);
 const entries=await OrderSettlement.find({orderId:accepted.id}).lean(),row=await Order.findById(accepted.id).lean();assert.equal(accountingSummary(row,entries).outstandingPiastres,0);
 await assert.rejects(mutateOrderAccounting(accepted.id,null,{...operation,revision:row.revision,operationKey:randomUUID()},actor));
});
