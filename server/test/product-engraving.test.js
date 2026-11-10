import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { startTestDatabase } from './helpers/database.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { SiteContent } from '../src/models/SiteContent.js';
import { Order } from '../src/models/Order.js';
import { Upload } from '../src/models/Upload.js';
import { addCartItem, cartResponse, readCart, mergeGuestCart, removeCartItem, updateCartQuantity } from '../src/commerce/cart.js';
import { quoteCartLine } from '../src/commerce/pricing.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { quoteProductEngraving, productEngravingPrice, productEditFingerprint } from '../src/product-engraving/service.js';
import { productEngravingCartInput } from '../src/product-engraving/contracts.js';
import { productSurfaceId } from '../../shared/product-engraving.mjs';
import { EngravingServiceConfiguration } from '../src/models/EngravingServiceConfiguration.js';
import { publishConfiguration } from '../src/engraving/configuration.js';
import { engravingQuote } from '../src/engraving/pricing.js';
import { updateProduct } from '../src/catalog/service.js';
import { INITIAL_ENGRAVING_TYPES, ICON_REGISTRY, FONT_REGISTRY } from '../../shared/engraving/definitions.mjs';
import { signUpload, completeUpload, openPrivateUpload } from '../src/commerce/uploads.js';
import { commerceOwnerContext } from '../src/commerce/ownership.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { publicProductEngraving } from '../src/catalog/public-presentation.js';
import { presentOrder } from '../src/commerce/order-presentation.js';
const owner = `guest:${'a'.repeat(64)}`, other = `guest:${'b'.repeat(64)}`, previous = { ...env };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
let database, product, storage;
before(async () => { database = await startTestDatabase({ transactions: true }); await SiteContent.createCollection(); await SiteContent.createIndexes(); await EngravingServiceConfiguration.createCollection(); await EngravingServiceConfiguration.createIndexes(); });
after(async () => { Object.assign(env, previous); setStorageForTests(); await database?.stop(); });
beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  env.checkoutEnabled = true; process.env.CATALOG_MEDIA_BASE_URL = 'https://media.example.test';
  storage = createMemoryStorage(); setStorageForTests(storage);
  const category = await Category.create({ name: 'Synthetic', slug: 'synthetic' });
  product = await Product.create({ name: 'Synthetic product', slug: 'synthetic-product', categoryId: category._id, mainImageKey: 'fixture/item.webp', galleryKeys: ['fixture/item.webp', 'fixture/other.webp'], visibility: 'public', status: 'ready', reviewRequired: false, priceApproved: true, pricePiastres: 35000, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, productEngraving: { version: 1, imageKey: 'fixture/item.webp', width: 900, height: 600, fontIds: FONT_REGISTRY.map(font => font.id), materials: ['Wood'], placements: ['Front'] } });
});
async function entry({ artwork = false, who = owner, variantKey = null } = {}) {
  const designKey = randomUUID(), layers = [{ id: 'words', type: 'text', text: 'For Nour', fontId: FONT_REGISTRY[0].id, color: 'grey', x: .5, y: .4, width: .4, aspectRatio: 3 }];
  if (artwork) {
    const signed = await signUpload(who, { purpose: 'artwork', productId: String(product._id), fieldKey: 'product_engraving_artwork', designKey, ownerContext: commerceOwnerContext(who), mimeType: 'image/png', sizeBytes: png.length });
    const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, png); await completeUpload(upload._id, who);
    layers.push({ id: 'art', type: 'image', assetId: String(upload._id), x: .6, y: .7, width: .2, aspectRatio: 1 });
  }
  const spec = { contractVersion: 'product-engraving-v1', designKey, configurationVersion: 1, material: 'Wood', placement: 'Front', design: { version: 'visual-engraving-v1', surface: { assetId: productSurfaceId(product._id, 1), aspectRatio: 1.5 }, layers } };
  const basePricePiastres = product.variants.find(value => value.key === variantKey)?.pricePiastres ?? product.pricePiastres;
  const quote = await quoteProductEngraving(product.toObject(), spec, who, { preview: true, variantKey, basePricePiastres });
  return { kind: 'product', operationKey: randomUUID(), productId: String(product._id), variantKey, quantity: 1, productEngraving: { ...spec, reviewFingerprint: quote.reviewFingerprint } };
}
const customer = { name: 'Synthetic Customer', email: 'synthetic@example.test', phone: '01012345678', governorate: 'cairo', address: 'Disposable fixture address' };
async function orderFor(value) { await addCartItem(owner, value); const checkoutKey = randomUUID(); await prepareCheckout(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' }); const request = { checkoutKey, paymentMethod: 'instapay', customer }; const dto = await placeOrder(owner, request); return { dto, request, saved: await Order.findById(dto.id).lean() }; }
test('ordinary purchase is unchanged; complete gallery setup creates capability without runtime flags', async () => {
  const plain = await quoteCartLine({ productId: product._id, quantity: 1 }, owner); assert.equal(plain.unitPricePiastres, 35000); assert.equal(plain.productEngravingSnapshot, undefined);
  assert.ok(publicProductEngraving(product)); assert.equal(publicProductEngraving({ ...product.toObject(), galleryKeys: [] }), null);
  const value = await entry(); const quote = await quoteCartLine(value, owner); assert.equal(quote.unitPricePiastres, 45000); assert.equal(quote.inventoryClaims[0].quantity, 1); assert.equal((await productEngravingPrice()).pricePiastres, 10000);
});
test('strict contract rejects injected prices, URLs, icons, wrong geometry and unapproved lettering', async () => {
  const value = await entry();
  for (const mutate of [s => s.price = 1, s => s.design.layers[0].x = -1, s => s.design.layers[0].fontId = 'fake', s => s.design.layers[0].type = 'icon', s => s.design.layers[0].url = 'https://private.invalid']) { const spec = structuredClone(value.productEngraving); mutate(spec); assert.equal(productEngravingCartInput.safeParse(spec).success, false); }
  for (const mutate of [s => s.configurationVersion++, s => s.design.surface.assetId = 'another-product', s => s.design.surface.aspectRatio = 1, s => s.material = 'Fake', s => s.placement = 'Fake']) { const spec = structuredClone(value.productEngraving); mutate(spec); await assert.rejects(quoteCartLine({ ...value, productEngraving: spec }, owner)); }
});
test('price changes invalidate old quotes, base and selected variant are fingerprinted', async () => {
  const value = await entry(); await SiteContent.create({ productEngravingPricePiastres: 15000, productEngravingPriceVersion: 1 });
  await assert.rejects(addCartItem(owner, value), { code: 'PRODUCT_ENGRAVING_REVIEW_REQUIRED' }); const fresh = await entry(); assert.equal((await quoteCartLine(fresh, owner)).unitPricePiastres, 50000);
  product.pricePiastres = 36000; await product.save(); await assert.rejects(addCartItem(owner, fresh), { code: 'PRODUCT_ENGRAVING_REVIEW_REQUIRED' });
});
test('variant pricing and genuine stock remain authoritative; unpriced, withdrawn and unapproved stock cannot order', async () => {
  product.variants = [{ key: 'gold', attributes: [{ name: 'Color', value: 'Gold' }], pricePiastres: 42000, priceApproved: true, inventory: { mode: 'tracked', quantity: 2, approved: true, available: true } }]; await product.save();
  const value = await entry({ variantKey: 'gold' }); assert.equal((await quoteCartLine(value, owner)).unitPricePiastres, 52000); await assert.rejects(quoteCartLine({ ...value, quantity: 3 }, owner), { code: 'INSUFFICIENT_STOCK' });
  for (const patch of [{ visibility: 'withdrawn' }, { priceApproved: false, variants: [] }, { inventory: { mode: 'tracked', quantity: 10, approved: false, available: true }, variants: [] }]) { const old = product.toObject(); await Product.updateOne({ _id: product._id }, { $set: patch }); await assert.rejects(addCartItem(owner, value)); await Product.replaceOne({ _id: product._id }, old); }
});
test('private artwork is exact product, design, owner and role scoped; originals retain their bytes', async () => {
  const value = await entry({ artwork: true }), id = value.productEngraving.design.layers[1].assetId, original = await Upload.findById(id).lean();
  await assert.rejects(addCartItem(other, value));
  for (const patch of [{ fieldKey: 'personal_artwork' }, { designKey: randomUUID() }, { productId: new mongoose.Types.ObjectId() }, { purpose: 'personalization' }, { expiresAt: new Date(0) }]) { await Upload.updateOne({ _id: id }, { $set: patch }); await assert.rejects(addCartItem(owner, value)); await Upload.updateOne({ _id: id }, { $set: Object.fromEntries(Object.keys(patch).map(key => [key, original[key]])) }); }
  await addCartItem(owner, value); const opened = await openPrivateUpload(id, owner); assert.ok(opened); assert.equal((await Upload.findById(id)).expiresAt.getTime(), original.expiresAt.getTime());
  assert.deepEqual(storage.objects.get((await Upload.findById(id).select('+objectKey')).objectKey).bytes, png);
});
test('cart retains separate artwork, exact geometry and immutable operation retries without duplicate units', async () => {
  const value = await entry({ artwork: true }); await addCartItem(owner, value); await addCartItem(owner, value); const stored = (await readCart(owner)).items[0];
  assert.deepEqual(stored.productEngraving, value.productEngraving); assert.equal(stored.quantity, 1); await assert.rejects(addCartItem(owner, { ...value, operationKey: randomUUID() }), { code: 'ENGRAVING_ITEM_EXISTS' });
  const safe = (await cartResponse(owner)).cart.items[0]; assert.equal(safe.productEngraving.contractVersion, undefined); assert.equal(safe.uploadIds, undefined);
  await assert.rejects(addCartItem(owner, { ...value, quantity: 2 }), { code: 'CART_OPERATION_CONFLICT' });
});
test('safe cart replacement detects another tab, keeps line identity and detaches removed artwork', async () => {
  const value = await entry({ artwork: true }); await addCartItem(owner, value); const old = (await readCart(owner)).items[0];
  const edit = { ...value, operationKey: randomUUID(), replaceLineId: old.id, replaceFingerprint: productEditFingerprint(old), productEngraving: structuredClone(value.productEngraving) }; edit.productEngraving.design.layers.pop(); edit.productEngraving.design.layers[0].text = 'New words';
  await addCartItem(owner, edit); assert.equal((await readCart(owner)).items[0].id, old.id); await assert.rejects(addCartItem(owner, { ...edit, operationKey: randomUUID() }), { code: 'ENGRAVING_EDIT_CONFLICT' });
  assert.equal((await Upload.findById(value.productEngraving.design.layers[1].assetId)).cartId, undefined); await updateCartQuantity(owner, old.id, 2); assert.equal((await cartResponse(owner)).cart.subtotalPiastres, 90000); await removeCartItem(owner, old.id); assert.equal((await readCart(owner)).items.length, 0);
});
test('orders snapshot product, design and surcharge as merchandise; no standalone inspection group', async () => {
  const value = await entry({ artwork: true }), { dto, request, saved } = await orderFor(value);
  assert.equal(saved.lines[0].kind, 'product'); assert.equal(saved.lines[0].productEngraving.surchargePiastres, 10000); assert.equal(saved.engraving, null); assert.equal(saved.accountingVersion, 1); assert.equal(saved.personalized, true); assert.deepEqual(saved.allowedPaymentMethods, ['instapay']);
  assert.equal((await Upload.findById(value.productEngraving.design.layers[1].assetId)).state, 'retained'); assert.equal((await Product.findById(product._id)).inventory.quantity, 9);
  await SiteContent.updateOne({ key: 'website-v1' }, { $set: { productEngravingPricePiastres: 20000, productEngravingPriceVersion: 1 } }); assert.equal((await placeOrder(owner, request)).id, dto.id); assert.equal((await addCartItem(owner, value)).alreadyOrdered, dto.id); assert.equal((await Order.findById(dto.id)).lines[0].productEngraving.surchargePiastres, 10000);
  const publicLine = presentOrder(saved).lines[0]; assert.equal(publicLine.productEngraving.surchargePiastres, 10000); assert.equal(JSON.stringify(publicLine.productEngraving).includes('imageKey'), false);
});
test('global checkout and personalized COD protections remain enforced', async () => {
  const value = await entry(); await addCartItem(owner, value); const checkoutKey = randomUUID(); env.checkoutEnabled = false; await assert.rejects(prepareCheckout(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' }), { code: 'CHECKOUT_DISABLED' }); env.checkoutEnabled = true;
  await prepareCheckout(owner, { checkoutKey, paymentMethod: 'cod', governorate: 'cairo' }); await assert.rejects(placeOrder(owner, { checkoutKey, paymentMethod: 'cod', customer })); assert.equal(await Order.countDocuments(), 0); assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
});
test('guest attachment transfer renews owner binding atomically without discarding personalized content', async () => {
  const value = await entry({ artwork: true }); await addCartItem(owner, value); const account = `user:${new mongoose.Types.ObjectId()}`; await mergeGuestCart(owner, account); assert.equal((await cartResponse(account)).cart.items[0].valid, true); assert.equal((await Upload.findById(value.productEngraving.design.layers[1].assetId)).owner, account); assert.equal(await readCart(owner), null);
});

test('configuration removal and re-approval never reuse an old version, and another product image is rejected', async () => {
  const actor = { _id: new mongoose.Types.ObjectId(), role: 'admin' }, { version, ...config } = product.productEngraving; void version;
  await assert.rejects(updateProduct(product._id, { expectedRevision: product.__v, productEngraving: { ...config, imageKey: 'unrelated/other.webp' } }, { actor }), { code: 'INVALID_ENGRAVING_SURFACE' });
  const removed = await updateProduct(product._id, { expectedRevision: product.__v, productEngraving: null }, { actor });
  const restored = await updateProduct(product._id, { expectedRevision: removed.revision, productEngraving: config }, { actor });
  assert.equal(restored.productEngraving.version, 3); assert.equal(restored.pricePiastres, 35000); assert.equal(restored.inventory.quantity, 10);
});
test('mixed standalone/product order keeps the product and surcharge entirely in merchandise', async () => {
  Object.assign(env, { engravingEnabled: true, engravingConfigurationEnabled: true });
  const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', active: true };
  const configuration = await publishConfiguration({ ...INITIAL_ENGRAVING_TYPES[0], pricePiastres: 13750, status: 'active', assetsApproved: true, fontIds: FONT_REGISTRY.map(font => font.id), iconIds: [ICON_REGISTRY[0].id], placements: [] }, 0, admin);
  const itemKey = randomUUID(), signed = await signUpload(owner, { purpose: 'engraving_service', ownerContext: commerceOwnerContext(owner), engravingItemKey: itemKey, fieldKey: 'item_photo', mimeType: 'image/png', sizeBytes: png.length });
  const photo = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(photo.temporaryKey, png); await completeUpload(photo._id, owner);
  const specification = { contractVersion: 'engraving-spec-v1', itemKey, typeId: configuration.typeId, configurationVersion: configuration.version, description: '', placement: { kind: 'help' }, content: { mode: 'icons', iconId: ICON_REGISTRY[0].id }, requestedAppearance: 'black', specialRequests: '', itemPhotoUploadId: String(photo._id) };
  await addCartItem(owner, { kind: 'engraving_service_v1', operationKey: randomUUID(), quantity: 1, specification, reviewFingerprint: (await engravingQuote(specification, owner)).reviewFingerprint });
  await addCartItem(owner, await entry());
  const codKey = randomUUID(); await prepareCheckout(owner, { checkoutKey: codKey, paymentMethod: 'cod', governorate: 'cairo' });
  await assert.rejects(placeOrder(owner, { checkoutKey: codKey, paymentMethod: 'cod', customer }), { code: 'QUOTATION_REQUIRED' });
  const checkoutKey = randomUUID(); await prepareCheckout(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' }); const dto = await placeOrder(owner, { checkoutKey, paymentMethod: 'instapay', customer }); const saved = await Order.findById(dto.id).lean();
  assert.equal(saved.accountingVersion, 2); assert.equal(saved.paymentGroups.find(group => group.id === 'engraving').amountPiastres, 13750); assert.equal(saved.paymentGroups.find(group => group.id === 'merchandise').amountPiastres, 45000); assert.equal(saved.engraving.items.length, 1);
});

async function textEntry({ variantKey = null, text = 'For Nour', fontId = 'engraving-rochester-v1', colorId = 'black' } = {}) {
  const specification = { contractVersion: 'product-engraving-v2', designKey: randomUUID(), configurationVersion: product.productEngraving.version, material: 'Wood', text, fontId, colorId };
  const basePricePiastres = product.variants.find(v => v.key === variantKey)?.pricePiastres ?? product.pricePiastres;
  const quote = await quoteProductEngraving(product.toObject(), specification, owner, { preview: true, variantKey, basePricePiastres });
  return { kind: 'product', operationKey: randomUUID(), productId: String(product._id), variantKey, quantity: 1, productEngraving: { ...specification, reviewFingerprint: quote.reviewFingerprint } };
}
async function textConfiguration() { product.productEngraving = { version: 2, mode: 'text', materials: ['Wood'], fontIds: ['engraving-rochester-v1','engraving-amiri-v1'], colorIds: ['black','white'] }; await product.save(); }
test('text-only approved configuration needs no gallery surface; v2 snapshots as merchandise', async () => {
  await textConfiguration(); assert.ok(publicProductEngraving(product)); assert.equal(publicProductEngraving(product).surface, undefined);
  const value = await textEntry(), { saved } = await orderFor(value), snapshot = saved.lines[0].productEngraving;
  assert.equal(snapshot.snapshotVersion, 'product-engraving-order-v2'); assert.deepEqual(snapshot.specification, value.productEngraving);
  assert.equal(snapshot.surchargePiastres, 10000); assert.equal(saved.lines[0].unitPricePiastres, 45000); assert.equal(saved.engraving, null);
  const dto = presentOrder(saved, { admin: true }); assert.equal(dto.lines[0].productEngraving.text, 'For Nour'); assert.equal(dto.lines[0].productEngraving.layers, undefined);
});
test('text-only spec rejects invalid text, unapproved fonts/colors and canvas/artwork injection', async () => {
  await textConfiguration(); const value = await textEntry();
  for (const patch of [{text:''},{text:'  '},{text:'a\u0000b'},{text:'x'.repeat(501)},{fontId:'fake'},{colorId:'#ffffff'},{design:{}},{artworkUploadIds:['a'.repeat(24)]},{surchargePiastres:0}]) assert.equal(productEngravingCartInput.safeParse({...value.productEngraving,...patch}).success,false);
  for (const patch of [{fontId:'engraving-allura-v1'},{colorId:'grey'},{material:'Metal'},{configurationVersion:1},{text:'\u062d\u0628',fontId:'engraving-rochester-v1'}]) await assert.rejects(quoteCartLine({...value,productEngraving:{...value.productEngraving,...patch}},owner));
  const arabic = await textEntry({text:'\u0628\u0643\u0644 \u0627\u0644\u062d\u0628',fontId:'engraving-amiri-v1',colorId:'white'}); assert.equal((await quoteCartLine(arabic,owner)).unitPricePiastres,45000);
});
test('v2 supports existing approved visual configurations without reinterpreting v1', async () => {
  const old = await entry({artwork:true}), modern = await textEntry(); await addCartItem(owner,old); await addCartItem(owner,modern);
  const lines=(await readCart(owner)).items; assert.equal(lines.length,2); assert.deepEqual(lines[0].productEngraving,old.productEngraving); assert.equal(lines[1].productEngraving.design,undefined);
});
test('text-only safe replacement and immutable retries preserve one item and exact text', async () => {
  await textConfiguration(); const value=await textEntry(); await addCartItem(owner,value); await addCartItem(owner,value);
  const line=(await readCart(owner)).items[0], edit={...value,operationKey:randomUUID(),replaceLineId:line.id,replaceFingerprint:productEditFingerprint(line),productEngraving:{...value.productEngraving,text:'Edited words'}};
  await addCartItem(owner,edit); await addCartItem(owner,edit); const result=(await readCart(owner)).items; assert.equal(result.length,1); assert.equal(result[0].id,line.id); assert.equal(result[0].productEngraving.text,'Edited words');
  await assert.rejects(addCartItem(owner,{...edit,operationKey:randomUUID()}),{code:'ENGRAVING_EDIT_CONFLICT'});
});
test('text-only surcharge changes reject stale quotes and preserve accepted snapshot amounts', async () => {
  await textConfiguration(); const value=await textEntry(),{saved}=await orderFor(value); await SiteContent.updateOne({key:'website-v1'},{$set:{productEngravingPricePiastres:12500,productEngravingPriceVersion:1}},{upsert:true});
  const stale={...value,operationKey:randomUUID(),productEngraving:{...value.productEngraving,designKey:randomUUID()}}; await assert.rejects(addCartItem(owner,stale),{code:'PRODUCT_ENGRAVING_REVIEW_REQUIRED'});
  assert.equal((await quoteCartLine(await textEntry(),owner)).unitPricePiastres,47500); assert.equal((await Order.findById(saved._id)).lines[0].productEngraving.surchargePiastres,10000);
});
test('text-only variant totals and stock remain ordinary merchandise rules', async () => {
  await textConfiguration(); product.variants=[{key:'gold',attributes:[{name:'Finish',value:'Gold'}],pricePiastres:42000,inventory:{mode:'tracked',quantity:2,approved:true,available:true}}]; await product.save();
  const value=await textEntry({variantKey:'gold'}); assert.equal((await quoteCartLine({...value,quantity:2},owner)).lineTotalPiastres,104000); await assert.rejects(quoteCartLine({...value,quantity:3},owner),{code:'INSUFFICIENT_STOCK'});
  await Product.updateOne({_id:product._id},{$set:{visibility:'withdrawn'}}); await assert.rejects(addCartItem(owner,value));
});
test('owner saves text-only configuration without changing price or stock',async()=>{
  const previous=product.toObject(); await updateProduct(String(product._id),{expectedRevision:product.__v,productEngraving:{mode:'text',fontIds:['engraving-amiri-v1'],colorIds:['black'],materials:['Wood']}},{actor:{_id:new mongoose.Types.ObjectId(),role:'admin'}});
  const record=await Product.findById(product._id); assert.equal(record.productEngraving.mode,'text'); assert.equal(record.pricePiastres,previous.pricePiastres); assert.equal(record.inventory.quantity,previous.inventory.quantity);
});
