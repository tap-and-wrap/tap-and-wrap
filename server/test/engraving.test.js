import { commerceOwnerContext } from '../src/commerce/ownership.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startTestDatabase } from './helpers/database.js';
import { env } from '../src/config/env.js';
import { EngravingServiceConfiguration as Config } from '../src/models/EngravingServiceConfiguration.js';
import { publishConfiguration } from '../src/engraving/configuration.js';
import { engravingQuote } from '../src/engraving/pricing.js';
import { engravingAction } from '../src/engraving/workflow.js';
import { INITIAL_ENGRAVING_TYPES, FONT_REGISTRY, ICON_REGISTRY } from '../../shared/engraving/definitions.mjs';
import { configurationInput, engravingCartInput } from '../src/engraving/contracts.js';
import { validEngravingLine } from '../src/engraving/contracts.js';
import { STUDIO_PLACEMENTS } from '../../shared/engraving/studio-placements.mjs';
import { addCartItem, cartResponse, mergeGuestCart, updateCartQuantity, readCart } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { mutateOrderAccounting, orderAccounting } from '../src/commerce/order-accounting.js';
import { signUpload, completeUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { Cart } from '../src/models/Cart.js';
import { fingerprint } from '../src/commerce/pricing.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { presentOrder } from '../src/commerce/order-presentation.js';
import { renderEmailTemplate } from '../src/email/templates.js';
import { whatsappQuotation } from '../src/commerce/whatsapp-quotation.js';
import { operationMessages } from '../src/commerce/operations.js';
const owner = `guest:${'a'.repeat(64)}`, other = `guest:${'b'.repeat(64)}`;
const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', active: true };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
let database, storage, config;
const settings = { ...env };
before(async () => { database = await startTestDatabase({ transactions: true }); await Config.createCollection(); await Config.createIndexes(); });
after(async () => { Object.assign(env, settings); setStorageForTests(); await database?.stop(); });
beforeEach(async () => {
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  Object.assign(env, { engravingEnabled: true, engravingConfigurationEnabled: true, checkoutEnabled: true });
  storage = createMemoryStorage(); setStorageForTests(storage);
  config = await publishConfiguration({ ...INITIAL_ENGRAVING_TYPES[0], status: 'active', assetsApproved: true, fontIds: FONT_REGISTRY.map(value => value.id), iconIds: ICON_REGISTRY.map(value => value.id), placements: [{ id: 'front', label: 'Front', status: 'active', displayOrder: 0 }] }, 0, admin);
});
async function image(itemKey, role, who = owner) {
  const signed = await signUpload(who, { purpose: 'engraving_service', ownerContext: commerceOwnerContext(who), engravingItemKey: itemKey, fieldKey: role, mimeType: 'image/png', sizeBytes: png.length });
  const record = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(record.temporaryKey, png);
  await completeUpload(record._id, who); return String(record._id);
}
async function input(mode = 'text', subtype = 'photo', who = owner) {
  const itemKey = randomUUID(), itemPhotoUploadId = await image(itemKey, 'item_photo', who);
  const content = mode === 'text' ? { mode, text: 'أحمد\n2026', fontId: FONT_REGISTRY[0].id } : mode === 'icons' ? { mode, iconId: ICON_REGISTRY[0].id } : { mode, subtype, artworkUploadId: await image(itemKey, 'personal_artwork', who) };
  const specification = { contractVersion: 'engraving-spec-v1', itemKey, typeId: 'perfume', configurationVersion: config.version, description: '', placement: { kind: 'help' }, content, requestedAppearance: 'black', specialRequests: '', itemPhotoUploadId };
  const quote = await engravingQuote(specification, who);
  return { kind: 'engraving_service_v1', operationKey: randomUUID(), quantity: 1, specification, reviewFingerprint: quote.reviewFingerprint };
}
async function orderFor(lines = 1) {
  const entries = [];
  for (let n=0;n<lines;n++) { const entry = await input(); entries.push(entry); await addCartItem(owner, entry); }
  const checkoutKey = randomUUID(); await prepareCheckout(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' });
  const dto = await placeOrder(owner, { checkoutKey, paymentMethod: 'instapay', customer: { name: 'Fixture Customer', email: 'fixture@example.test', phone: '01012345678', governorate: 'cairo', address: 'Fixture return address 10' } });
  return { order: await Order.findById(dto.id).lean(), entries };
}
async function act(order, action, extras = {}) {
  const current = await Order.findById(order._id).lean();
  return engravingAction(String(order._id), { revision: current.revision, operationKey: randomUUID(), action, itemKey: current.engraving.items[0].itemKey, ...extras }, admin);
}

test('an item arriving after cancellation retains receipt and safe return obligations without reopening work', async () => {
  const { order } = await orderFor();
  await mutateOrderAccounting(String(order._id), null, { revision: order.revision, action: 'cancel', reconciled: true, reason: 'Cancelled before arrival' }, admin);
  // Exhausted clarification receipts must not prevent recording actual custody.
  await Order.updateOne({ _id: order._id }, { $set: { 'engraving.operations': Array.from({length:1000},()=>({key:randomUUID(),hash:'a'.repeat(64)})) } });
  const received = await act(order, 'receive', { condition: 'Arrived intact after cancellation', accessories: 'Cap' });
  assert.equal(received.fulfillmentState, 'cancelled');
  assert.equal(received.engraving.items[0].inCustody, true);
  for (const action of ['inspect', 'authorize_payment', 'start']) await assert.rejects(act(order, action), { code: 'ENGRAVING_WORKFLOW_CONFLICT' });
  await act(order, 'arrange_return', { publicReason: 'Customer collection agreed' });
  await assert.rejects(act(order, 'arrange_return', { publicReason: 'Duplicate return stage' }), { code: 'ENGRAVING_WORKFLOW_CONFLICT' });
  const returned = await act(order, 'return_to_customer', { publicReason: 'Actual customer handoff' });
  assert.equal(returned.engraving.items[0].inCustody, false);
  assert.equal(returned.fulfillmentState, 'cancelled');
  assert.equal(returned.engraving.collectionAuthorized, false);
  assert.deepEqual(returned.inventoryClaims, []);
  assert.equal(returned.charges[0].state, 'pending'); // physical return does not forgive or invent financial terms
});
test('nine reviewable definitions are disabled and exactly EGP 100; config never has option prices', () => {
  assert.equal(INITIAL_ENGRAVING_TYPES.length,9);
  for (const definition of INITIAL_ENGRAVING_TYPES) { assert.equal(definition.pricePiastres,10000); assert.equal(definition.status,'disabled'); }
  assert.equal(configurationInput.safeParse({ ...Config, placementPrice: 1 }).success,false);
});
test('versioned standalone font binaries retain their licensed original bytes',async()=>{
  const approvedBytes={amiri:'ab391c4147d054c48976e98322ad0eefe1427aa0e0502a12a4c75d80a70cfcd7',rochester:'38657df5e357e841a39995592970ac14ea96a1376f178f0d8e0231fd5d630b2b'};
  for(const font of ['amiri','rochester']){
    const versioned=await readFile(new URL(`../../client/public/assets/engraving/fonts/v1/${font}.ttf`,import.meta.url));
    assert.equal(createHash('sha256').update(versioned).digest('hex'),approvedBytes[font]);
    const provenance=await readFile(new URL('../../client/public/assets/engraving/fonts/v1/SOURCE.txt',import.meta.url),'utf8');
    assert.ok(provenance.includes(createHash('sha256').update(versioned).digest('hex')));
    assert.match(await readFile(new URL(`../../client/public/assets/engraving/fonts/v1/${font}-LICENSE.txt`,import.meta.url),'utf8'),font==='amiri'?/SIL OPEN FONT LICENSE/:/Apache License[\s\S]*Version 2\.0/);
  }
});
test('published versions, stale revisions and retired placement identifiers are protected', async () => {
  const { version, revision, ...old } = config; void version;
  const next = await publishConfiguration({ ...old, name: 'Renamed', pricePiastres: 12500, placements: [{ ...old.placements[0], status: 'retired' }] },revision,admin);
  assert.equal(next.version,2); assert.equal((await Config.findOne({ version:1 })).configuration.pricePiastres,10000);
  await assert.rejects(publishConfiguration(old,revision,admin),{ code:'EDIT_CONFLICT' });
  await assert.rejects(publishConfiguration(old,next.revision,admin),{ code:'PLACEMENT_HISTORY_REQUIRED' });
});
for (const [mode,subtype] of [['text','photo'],['icons','photo'],...['photo','drawing','handwriting','fingerprint'].map(value=>['personal',value])]) test(`private ${mode}/${subtype} add preserves EGP 100 and never generates stock claims`, async () => {
  const entry = await input(mode,subtype); const quote = await engravingQuote(entry.specification,owner);
  assert.equal(quote.unitPricePiastres,10000); assert.deepEqual(quote.inventoryClaims,[]);
  const response = await addCartItem(owner,entry); assert.equal(response.cart.items[0].unitPricePiastres,10000);
  assert.ok(!JSON.stringify(response).includes(entry.specification.itemPhotoUploadId));
  const checkoutKey=randomUUID();await prepareCheckout(owner,{checkoutKey,paymentMethod:'instapay',governorate:'cairo'});
  const ordered=await placeOrder(owner,{checkoutKey,paymentMethod:'instapay',customer:{name:'Fixture Customer',email:'fixture@example.test',phone:'01012345678',governorate:'cairo',address:'Fixture return address 10'}});
  assert.equal(ordered.lines[0].engraving.content.mode,mode);assert.equal(ordered.totals.totalPiastres,10000);
});
test('appearance, font and placement do not change price; mode payloads and quantity are strict', async () => {
  const entry = await input();
  for (const color of ['black','white','grey']) for (const font of FONT_REGISTRY) {
    const quote = await engravingQuote({ ...entry.specification, requestedAppearance:color, content:{ ...entry.specification.content,fontId:font.id, text:font.language==='en'?'English 2026':entry.specification.content.text },placement:{kind:'selected',placementId:'front'} },owner); assert.equal(quote.unitPricePiastres,10000);
  }
  assert.equal(engravingCartInput.safeParse({ ...entry,quantity:2 }).success,false);
  assert.equal(engravingCartInput.safeParse({ ...entry,specification:{...entry.specification,content:{...entry.specification.content,iconId:ICON_REGISTRY[0].id}} }).success,false);
});
test('lost response retry inserts once; identical physical items remain separate; conflicting key rejected', async () => {
  const entry = await input(); await addCartItem(owner,entry); await addCartItem(owner,entry);
  await addCartItem(owner,await input()); assert.equal((await readCart(owner)).items.length,2);
  await assert.rejects(addCartItem(owner,{...entry,specification:{...entry.specification,specialRequests:'changed'}}),{code:'CART_OPERATION_CONFLICT'});
  await assert.rejects(updateCartQuantity(owner,(await readCart(owner)).items[0].id,2),{code:'ENGRAVING_QUANTITY_FIXED'});
});
test('wrong owner, item role and expired upload fail without extending retention', async () => {
  await assert.rejects(signUpload(other,{purpose:'engraving_service',ownerContext:commerceOwnerContext(owner),engravingItemKey:randomUUID(),fieldKey:'item_photo',mimeType:'image/png',sizeBytes:png.length}),{code:'ENGRAVING_OWNER_CHANGED'});
  const entry = await input(); await assert.rejects(addCartItem(other,entry),{code:'INVALID_UPLOAD_REFERENCES'});
  await Upload.updateOne({_id:entry.specification.itemPhotoUploadId},{$set:{fieldKey:'personal_artwork'}});
  await assert.rejects(addCartItem(owner,entry),{code:'ENGRAVING_REVIEW_REQUIRED'});
  await Upload.updateOne({_id:entry.specification.itemPhotoUploadId},{$set:{fieldKey:'item_photo',expiresAt:new Date(0)}});
  await assert.rejects(addCartItem(owner,entry),{code:'INVALID_UPLOAD_REFERENCES'});
});
test('guest merge transfers exact private owner and cart binding; rotated guest cannot read', async () => {
  const entry = await input(); await addCartItem(owner,entry); const account=`user:${new mongoose.Types.ObjectId()}`;
  await mergeGuestCart(owner,account); assert.equal((await cartResponse(account)).cart.items.length,1);
  assert.equal((await Upload.findById(entry.specification.itemPhotoUploadId)).owner,account);
  assert.equal((await cartResponse(other)).cart.items.length,0);
});
test('configuration change invalidates cart; mixed checkout rejects without mutation', async () => {
  const entry=await input(); await addCartItem(owner,entry);
  const {version,revision,...old}=config;void version; await publishConfiguration({...old,pricePiastres:15000},revision,admin);
  assert.equal((await cartResponse(owner)).cart.items[0].valid,false);
  const cart=await Cart.findOne({owner}); cart.items.push({id:randomUUID(),kind:'product',identity:'fixture',productId:new mongoose.Types.ObjectId(),quantity:1}); await cart.save();
  await assert.rejects(prepareCheckout(owner,{checkoutKey:randomUUID(),paymentMethod:'instapay',governorate:'cairo'}),{code:'ENGRAVING_MIXED_CHECKOUT'}); assert.equal((await readCart(owner)).items.length,2);
});
test('checkout preserves priced unpaid snapshot and blocks every early payment/work path', async () => {
  const {order}=await orderFor(); assert.equal(order.totals.totalPiastres,10000); assert.equal(order.paymentState,'unpaid'); assert.deepEqual(order.inventoryClaims,[]);
  assert.equal(presentOrder(order).paymentInstructions,null); assert.equal((await orderAccounting(order)).amountDueNowPiastres,0);
  await assert.rejects(mutateOrderAccounting(String(order._id),null,{revision:order.revision,action:'quote_charge',kind:'addon',label:'Font surcharge',pricing:'quoted',amountPiastres:500,collectionMethod:'instapay'},admin),{code:'ACCOUNTING_REVIEW_REQUIRED'});
  await assert.rejects(signUpload(owner,{purpose:'payment_proof',orderId:String(order._id),mimeType:'image/png',sizeBytes:png.length}),{code:'ENGRAVING_PAYMENT_NOT_AUTHORIZED'});
  for(const action of ['submit_proof','collection']) await assert.rejects(mutateOrderAccounting(String(order._id),owner,{revision:0,action},action==='collection'?admin:null),{code:'ENGRAVING_PAYMENT_NOT_AUTHORIZED'});
  await assert.rejects(act(order,'start'),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
  await assert.rejects(act(order,'authorize_payment'),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
  const event=await NotificationEvent.findOne({orderId:order._id,event:'order_received'}).lean();
  assert.equal(event.snapshot.engravingReviewPending,true);
  const email=renderEmailTemplate(event).text;
  assert.ok(email.includes('Do not transfer payment yet')); assert.ok(!email.includes('01060673073'));
  assert.ok(!email.includes('within 12 hours')); assert.ok(email.includes('Item handoff, return arrangements'));
  assert.ok(!whatsappQuotation(order,await orderAccounting(order)).text.includes('01060673073'));
  assert.ok((await operationMessages('order',order)).every(message=>!message.text.includes('01060673073')));
});
test('inspection, current acceptance, payment authorization and safe unengraved return preserve custody', async () => {
  const {order}=await orderFor(); await act(order,'receive',{condition:'Intact',accessories:'Cap'}); await act(order,'inspect'); await act(order,'propose',{placementId:'front'});
  await assert.rejects(act(order,'accept',{proposalVersion:1,customerConfirmed:true}),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
  await act(order,'accept',{proposalVersion:1,customerConfirmed:true,internalNote:'Actual fixture customer confirmation'});
  const authorized=await act(order,'authorize_payment'); assert.equal(authorized.paymentState,'awaiting_transfer'); assert.ok(presentOrder(authorized).paymentInstructions);
  await assert.rejects(act(order,'start'),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
  await mutateOrderAccounting(String(order._id),null,{revision:authorized.revision,action:'cancel',reconciled:true,reason:'Actual fixture cancellation'},admin);
  const cancelled=await Order.findById(order._id).lean(); assert.equal(cancelled.engraving.items[0].inCustody,true);
  await act(order,'arrange_return',{publicReason:'Customer will collect the unengraved item'});
  assert.equal((await Order.findById(order._id)).engraving.items[0].stage,'return_arranged');
});
test('multi-item payment authorization requires inspection and acceptance of every item',async()=>{
  const {order}=await orderFor(2); await act(order,'receive',{condition:'Intact'}); await act(order,'inspect'); await act(order,'propose',{placementId:'front'}); await act(order,'accept',{proposalVersion:1,customerConfirmed:true,internalNote:'Customer accepted'});
  await assert.rejects(act(order,'authorize_payment'),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
});
test('cart replacement is atomic, revision-safe, and never reuses a changed operation payload',async()=>{
  const entry=await input();await addCartItem(owner,entry);const line=(await readCart(owner)).items[0];
  const replaceFingerprint=fingerprint({specification:line.specification,reviewFingerprint:line.reviewFingerprint});
  const edited={...entry,operationKey:randomUUID(),replaceLineId:line.id,replaceFingerprint,specification:{...entry.specification,specialRequests:'Keep cap separate'}};
  await addCartItem(owner,edited);assert.equal((await readCart(owner)).items.length,1);
  await assert.rejects(addCartItem(owner,{...edited,operationKey:randomUUID(),specification:{...edited.specification,specialRequests:'Stale tab'}}),{code:'ENGRAVING_EDIT_CONFLICT'});
  assert.equal((await readCart(owner)).items[0].specification.specialRequests,'Keep cap separate');
});
test('add retries remain idempotent after another tab has consumed the cart into an order',async()=>{
  const {order,entries}=await orderFor();const response=await addCartItem(owner,entries[0]);
  assert.equal(response.alreadyOrdered,String(order._id));assert.equal((await readCart(owner)).items.length,0);assert.equal(await Order.countDocuments({}),1);
});
test('disabling intake preserves owned order operations and never opens payment',async()=>{
  const {order}=await orderFor();env.engravingEnabled=false;
  await assert.rejects(engravingQuote(order.lines[0].engraving.specification,owner),{code:'ENGRAVING_DISABLED'});
  await act(order,'receive',{condition:'Intact'});await act(order,'inspect');await act(order,'unsuitable',{publicReason:'Material is unsuitable'});
  assert.equal((await Order.findById(order._id)).engraving.items[0].inCustody,true);
  assert.equal(presentOrder(await Order.findById(order._id).lean()).paymentInstructions,null);
});
test('clarification never reuses an accepted/proposed specification version',async()=>{
  const {order}=await orderFor();await act(order,'receive',{condition:'Intact'});await act(order,'inspect');await act(order,'propose',{placementId:'front'});
  await act(order,'clarify',{publicReason:'Clarify the location'});await act(order,'propose',{placementLabel:'Inspected flat base'});
  await assert.rejects(act(order,'accept',{proposalVersion:1,customerConfirmed:true,internalNote:'Stale acceptance'}),{code:'ENGRAVING_WORKFLOW_CONFLICT'});
  const current=await act(order,'accept',{proposalVersion:2,customerConfirmed:true,internalNote:'Actual current acceptance'});assert.equal(current.engraving.items[0].proposal.placementLabel,'Inspected flat base');
});


test('studio assets are twelve licensed fonts, 48 safe versioned icons and eight placement sets', async()=>{
  assert.equal(FONT_REGISTRY.length,12);assert.equal(ICON_REGISTRY.length,48);
  assert.equal(FONT_REGISTRY.filter(font=>font.language==='ar').length,6);
  assert.equal(new Set(ICON_REGISTRY.map(icon=>icon.id)).size,48);
  for(const font of FONT_REGISTRY){
    const bytes=await readFile(new URL('../../client/public'+font.source,import.meta.url));assert.ok(bytes.length>1000);
    assert.ok((await readFile(new URL('../../client/public'+font.license,import.meta.url),'utf8')).length>500);
  }
  for(const icon of ICON_REGISTRY){
    const svg=await readFile(new URL('../../client/public'+icon.asset,import.meta.url),'utf8');
    assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|<!ENTITY/i);
  }
  assert.equal(STUDIO_PLACEMENTS.perfume.length,6);assert.deepEqual(STUDIO_PLACEMENTS.other,[]);
  for(const placements of Object.values(STUDIO_PLACEMENTS))assert.equal(new Set(placements.map(value=>value.id)).size,placements.length);
});
test('unchanged publication preserves version and audit count; stale no-op still conflicts',async()=>{
  const {revision,version,...same}=config;
  const before=await mongoose.models.AdminAudit.countDocuments({action:'engraving.configuration_published'});
  const result=await publishConfiguration(same,revision,admin);
  assert.equal(result.version,version);assert.equal(result.revision,revision);
  assert.equal(await mongoose.models.AdminAudit.countDocuments({action:'engraving.configuration_published'}),before);
  await assert.rejects(publishConfiguration(same,revision-1,admin),{code:'EDIT_CONFLICT'});
});
test('studio publication preserves historical two-font Drawing and text order snapshots',async()=>{
  const {version,revision,...base}=config;void version;
  config=await publishConfiguration({...base,fontIds:FONT_REGISTRY.slice(0,2).map(font=>font.id),iconIds:ICON_REGISTRY.slice(0,3).map(icon=>icon.id)},revision,admin);
  const entry=await input('personal','drawing');await addCartItem(owner,entry);
  const checkoutKey=randomUUID();await prepareCheckout(owner,{checkoutKey,paymentMethod:'instapay',governorate:'cairo'});
  const placed=await placeOrder(owner,{checkoutKey,paymentMethod:'instapay',customer:{name:'Historical Fixture',email:'fixture@example.test',phone:'01012345678',governorate:'cairo',address:'Disposable return fixture'}});
  const old=await Order.findById(placed.id).lean(), snapshot=JSON.stringify(old.lines);
  const {version:oldVersion,revision:oldRevision,...oldConfig}=config;void oldVersion;
  await publishConfiguration({...oldConfig,fontIds:FONT_REGISTRY.map(font=>font.id),iconIds:ICON_REGISTRY.map(icon=>icon.id),placements:STUDIO_PLACEMENTS.perfume},oldRevision,admin);
  const after=await Order.findById(placed.id).lean();assert.equal(JSON.stringify(after.lines),snapshot);assert.equal(validEngravingLine(after.lines[0]),true);
  assert.equal(after.lines[0].engraving.specification.content.subtype,'drawing');
});
