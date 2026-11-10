import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { startTestDatabase } from './helpers/database.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { env } from '../src/config/env.js';
import { signUpload, completeUpload, openPrivateUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { addCartItem, readCart, cartResponse, mergeGuestCart, removeCartItem } from '../src/commerce/cart.js';
import { quoteCartLine } from '../src/commerce/pricing.js';
import { photoEditFingerprint, photoSelectionInput } from '../src/commerce/product-photos.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { updateProduct } from '../src/catalog/service.js';
import { publicProductDetail } from '../src/catalog/public-presentation.js';
import { productBusinessState } from '../../shared/product-business-state.mjs';
const owner = `guest:${'a'.repeat(64)}`, stranger = `guest:${'b'.repeat(64)}`, prior = { ...env }, actor = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');

let database, product, storage;
before(async () => { database = await startTestDatabase({ transactions: true }); });
after(async () => { Object.assign(env, prior); setStorageForTests(); await database?.stop(); });
beforeEach(async () => { for (const model of Object.values(mongoose.models)) await model.deleteMany({}); env.checkoutEnabled = true; storage = createMemoryStorage(); setStorageForTests(storage); const category = await Category.create({ name: 'Synthetic', slug: 'synthetic' }); product = await Product.create({ name: 'Synthetic ready-made photo product', slug: 'synthetic-photo-product', categoryId: category._id, visibility: 'public', status: 'ready', mainImageKey: 'fixtures/photos.webp', galleryKeys: ['fixtures/photos.webp'], pricePiastres: 35000, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, personalization: { requiredBeforePurchase: false, fields: [], acceptCustomerPhotos: true, customerPhotosVersion: 1 } }); });
async function image(key, who = owner) { const signed = await signUpload(who, { purpose: 'personalization', productId: String(product._id), fieldKey: key, mimeType: 'image/png', sizeBytes: png.length }); const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, png); await completeUpload(upload._id, who); return String(upload._id); }
async function entry(count = 2) { const ids=[]; for(let index=0;index<count;index++) ids.push(await image('customer_photos')); return { kind:'product',operationKey:randomUUID(),productId:String(product._id),variantKey:null,quantity:1,personalization:count ? {customer_photos:ids} : {},photoSelection:{contractVersion:'product-photos-v2',mode:count ? 'photos':'as_is',configurationVersion:1} }; }
const customer = { name: 'Synthetic Photo Customer', email: 'photo@example.test', phone: '01012345678', governorate: 'cairo', address: 'Disposable test address' };
async function order(value, paymentMethod = 'instapay') { await addCartItem(owner, value); const checkoutKey = randomUUID(); await prepareCheckout(owner, { checkoutKey, paymentMethod, governorate: 'cairo' }); const request = { checkoutKey, paymentMethod, customer }; const dto = await placeOrder(owner, request); return { saved: await Order.findById(dto.id).lean(), request }; }

test('simple capability, single and variable collections use the ordinary price and preserve ordered IDs',async()=>{
  for(const count of [0,1,3]){const value=await entry(count);const quote=await quoteCartLine(value,owner);assert.equal(quote.unitPricePiastres,35000);assert.equal(quote.photoPurchase.contractVersion,'product-photos-v2');assert.equal(quote.photoPurchase.slots,undefined);assert.deepEqual(quote.personalization.customer_photos||[],value.personalization.customer_photos||[]);await addCartItem(owner,value);}
  assert.equal((await readCart(owner)).items.length,3);const dto=publicProductDetail(product);assert.equal(dto.personalization.acceptCustomerPhotos,true);assert.equal(dto.personalization.photoSpaces,undefined);
});
test('selected mode needs at least one image, rejects extra fields, foreign/expired/duplicate refs and wrong product roles',async()=>{
  const value=await entry(1),id=value.personalization.customer_photos[0];await assert.rejects(addCartItem(owner,{...value,personalization:{}}),{code:'INVALID_PHOTOS'});await assert.rejects(addCartItem(stranger,value),{code:'INVALID_UPLOAD_REFERENCES'});await assert.rejects(addCartItem(owner,{...value,personalization:{customer_photos:[id,id]}}));
  await assert.rejects(addCartItem(owner,{...value,photoSelection:{...value.photoSelection,mode:'as_is'}}),{code:'INVALID_PERSONALIZATION'});const original=await Upload.findById(id).lean();for(const patch of [{expiresAt:new Date(0)},{fieldKey:'photo_left'},{purpose:'artwork'},{productId:new mongoose.Types.ObjectId()}]){await Upload.updateOne({_id:id},{$set:patch});await assert.rejects(addCartItem(owner,value));await Upload.updateOne({_id:id},{$set:Object.fromEntries(Object.keys(patch).map(key=>[key,original[key]]))});}
});
test('ten-image total accounts for existing required image fields and never changes their requirements',async()=>{
  await Product.updateOne({_id:product._id},{$set:{'personalization.requiredBeforePurchase':true,'personalization.fields':[{key:'reference',label:'Required reference',type:'image',required:true,minFiles:1,maxFiles:2,maxBytes:8388608}]}});
  const value=await entry(9);await assert.rejects(addCartItem(owner,value),{code:'INVALID_PHOTOS'});const id=await image('reference');await addCartItem(owner,{...value,personalization:{...value.personalization,reference:[id]}});const overflow=await entry(10);await assert.rejects(addCartItem(owner,{...overflow,personalization:{...overflow.personalization,reference:[id]}}),{code:'INVALID_PHOTOS'});
});
test('capability off, missing price, unapproved stock and withdrawal refuse uploads and purchases',async()=>{
  const value=await entry(1);for(const patch of [{'personalization.acceptCustomerPhotos':false},{pricePiastres:null},{'inventory.approved':false},{visibility:'withdrawn'}]){const original=product.toObject();await Product.updateOne({_id:product._id},{$set:patch});await assert.rejects(addCartItem(owner,value));await assert.rejects(image('customer_photos'));await Product.replaceOne({_id:product._id},original);}
});
test('cart reorder, edit, immutable retry and original bytes remain exact',async()=>{
  const value=await entry(3);await addCartItem(owner,value);await addCartItem(owner,value);const old=(await readCart(owner)).items[0];const reversed=[...value.personalization.customer_photos].reverse();const replacement={...value,operationKey:randomUUID(),replaceLineId:old.id,replaceFingerprint:photoEditFingerprint(old),personalization:{customer_photos:reversed}};await addCartItem(owner,replacement);const line=(await readCart(owner)).items[0];assert.equal(line.id,old.id);assert.deepEqual(line.personalization.customer_photos,reversed);await assert.rejects(addCartItem(owner,{...replacement,operationKey:randomUUID()}),{code:'ENGRAVING_EDIT_CONFLICT'});const upload=await Upload.findById(reversed[0]).select('+objectKey');assert.deepEqual(storage.objects.get(upload.objectKey).bytes,png);
});
test('order snapshots retain collection order and original files after capability removal; accepted retries cannot duplicate',async()=>{
  const value=await entry(3),{saved,request}=await order(value);assert.equal(saved.lines[0].photoPurchase.collectionKey,'customer_photos');assert.deepEqual(saved.lines[0].personalization.customer_photos,value.personalization.customer_photos);assert.equal(saved.totals.totalPiastres,35000);assert.equal(saved.engraving,null);
  const current=await Product.findById(product._id);const changed=await updateProduct(product._id,{expectedRevision:current.__v,personalization:{fields:[],acceptCustomerPhotos:false}},{actor});assert.equal(changed.personalization.customerPhotosVersion,2);assert.equal((await placeOrder(owner,request)).id,String(saved._id));assert.equal((await addCartItem(owner,value)).alreadyOrdered,String(saved._id));assert.ok(await openPrivateUpload(value.personalization.customer_photos[0],owner));await assert.rejects(openPrivateUpload(value.personalization.customer_photos[0],stranger));
});
test('version changes cannot be forged or revive stale collections; legacy spaces are preserved rather than migrated',async()=>{
  const value=await entry(1);let current=await updateProduct(product._id,{expectedRevision:product.__v,personalization:{fields:[],acceptCustomerPhotos:false}},{actor});current=await updateProduct(product._id,{expectedRevision:current.revision,personalization:{fields:[],acceptCustomerPhotos:true,customerPhotosVersion:999}},{actor});assert.equal(current.personalization.customerPhotosVersion,3);await assert.rejects(addCartItem(owner,value),{code:'CUSTOMER_PHOTOS_CHANGED'});
  const legacy=[{key:'photo_old',label:'Historical label',instructions:'Earlier instruction'}];await Product.updateOne({_id:product._id},{$set:{'personalization.photoSpaces':legacy,'personalization.photoSpacesVersion':1}});current=await updateProduct(product._id,{expectedRevision:current.revision,personalization:{fields:[],acceptCustomerPhotos:false}},{actor});assert.deepEqual(current.personalization.photoSpaces,legacy);
});
