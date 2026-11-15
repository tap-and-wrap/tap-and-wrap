// Seed an actual v1 cart line through the isolated API, then exercise its legacy
// edit path. New customers always use the visual builder.
import { randomUUID } from 'node:crypto';
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
export async function seedLegacyEngraving(context, { mode = 'text', subtype = 'drawing' } = {}) {
  const api = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_API_PORT}/api/v1`, origin = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_WEB_PORT}`;
  async function post(path, data) { const csrf = (await (await context.request.get(`${api}/auth/csrf`)).json()).data.csrfToken; const response = await context.request.post(api + path, { headers: { Origin: origin, 'x-csrf-token': csrf }, data }); if (!response.ok()) throw Error(`Synthetic legacy fixture failed (${response.status()}).`); return (await response.json()).data; }
  const cart = (await (await context.request.get(`${api}/commerce/cart`)).json()).data, options = (await (await context.request.get(`${api}/commerce/engraving/types`)).json()).data, type = options.types.find(value => value.typeId === 'perfume'), itemKey = randomUUID();
  async function upload(role) {
    const signed = await post('/commerce/uploads/sign', { purpose: 'engraving_service', ownerContext: cart.checkoutOwnerKey, engravingItemKey: itemKey, fieldKey: role, mimeType: 'image/png', sizeBytes: bytes.length });
    const put = await context.request.put(signed.uploadUrl, { headers: signed.headers, data: bytes }); if (!put.ok()) throw Error('Synthetic legacy upload failed.');
    await post(`/commerce/uploads/${signed.upload.id}/complete`, {}); return signed.upload.id;
  }
  const specification = { contractVersion: 'engraving-spec-v1', itemKey, typeId: type.typeId, configurationVersion: type.version, description: '', placement: { kind: 'help' }, requestedAppearance: 'black', specialRequests: '', itemPhotoUploadId: await upload('item_photo'), content: mode === 'icons' ? { mode, iconId: type.iconIds[0] } : mode === 'personal' ? { mode, subtype, artworkUploadId: await upload('personal_artwork') } : { mode: 'text', text: 'Saved legacy words', fontId: type.fontIds[0] } };
  const quote = await post('/commerce/engraving/quote', { specification });
  const added = await post('/commerce/cart/items', { kind: 'engraving_service_v1', operationKey: randomUUID(), quantity: 1, specification, reviewFingerprint: quote.reviewFingerprint });
  return added.cart.items.find(value => value.engraving?.itemKey === itemKey).id;
}

// Current eligible purchases retain real pre-order proof authorization. This
// helper runs only against the guarded disposable connected API.
export async function placeConnectedEngraving(context, checkoutKey, paymentMethod = 'instapay') {
  const api = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_API_PORT}/api/v1`, origin = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_WEB_PORT}`;
  async function post(path,data) {
    const csrf=(await(await context.request.get(api+'/auth/csrf')).json()).data.csrfToken;
    const response=await context.request.post(api+path,{headers:{Origin:origin,'x-csrf-token':csrf},data});
    if(!response.ok())throw Error(`Disposable checkout ${path} failed (${response.status()}): ${await response.text()}`);
    return(await response.json()).data;
  }
  const quote=await post('/commerce/checkout/quote',{checkoutKey,paymentMethod,governorate:'cairo'});
  if(typeof quote.fingerprint!=='string')throw Error('Disposable quote fingerprint missing.');
  if(paymentMethod==='instapay') {
    await post('/commerce/checkout/payments',{checkoutKey,paymentMethod,governorate:'cairo'});
    const signed=await post('/commerce/uploads/sign',{purpose:'payment_proof',checkoutKey,mimeType:'image/png',sizeBytes:bytes.length});
    const put=await context.request.put(signed.uploadUrl,{headers:signed.headers,data:bytes});if(!put.ok())throw Error('Disposable payment upload failed.');
    await post(`/commerce/uploads/${signed.upload.id}/complete`,{});
    await post(`/commerce/checkout/payments/${checkoutKey}/proof`,{uploadId:signed.upload.id,senderName:'Fixture Sender'});
  }
  return(await post('/commerce/orders',{checkoutKey,paymentMethod,customer:{name:'Fixture Customer',email:'fixture@example.test',phone:'01012345678',governorate:'cairo',addressVersion:'delivery-address-v3',city:'Fixture Cairo',street:'10 Fixture Return Street',building:'',floor:'',apartment:'',notes:''}})).order;
}
