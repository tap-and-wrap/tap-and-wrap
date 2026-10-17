import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_API_PORT || 4092);
test.beforeEach(async ({ context }) => {
  // Real API validation/serializers are used; only external network is denied.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
});
async function state(request) {
  const response = await request.get(`${api}/__fixture/state`, { headers: { 'x-fixture-key': 'connected-fixture-only' } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function csrf(context) {
  const response = await context.request.get(`${api}/api/v1/auth/csrf`); expect(response.ok()).toBeTruthy();
  return { Origin: 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192), 'x-csrf-token': (await response.json()).data.csrfToken };
}

test('real Gift Box and Engraving are guest request-first services; retries retain requests without stock or cart claims', async ({ page, context, request, browser }) => {
  const before = await state(request), errors=[], signed=[]; page.on('pageerror',e=>errors.push(e.message));
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/commerce/uploads/sign')) signed.push(request.postDataJSON()); });
  await page.setViewportSize({width:390,height:844});
  for (const service of ['gift-box','laser-engraving']) {
    await page.goto('/customize/' + service);
    await expect(page.getByRole('heading',{name:service==='gift-box'?'Build Your Gift Box':'Laser Engraving',exact:true})).toBeVisible();
    await expect(page.getByLabel('Gift box type / size',{exact:true})).toHaveCount(0);
    if (service === 'gift-box') {
      await page.getByLabel('Occasion',{exact:true}).fill('Synthetic birthday');
      await page.getByLabel('Desired contents',{exact:true}).fill('Synthetic bespoke contents');
      await page.getByRole('checkbox',{name:'Connected synthetic chocolates',exact:true}).check();
      await page.getByLabel('Connected synthetic chocolates quantity',{exact:true}).fill('2');
      await expect(page.getByText(/Known subtotal estimate:/)).toContainText('31.00');
      await expect(page.getByRole('checkbox',{name:/Connected unavailable flowers/})).toHaveCount(0);
    } else { await page.getByLabel('Item description or product reference',{exact:true}).fill('Manual item needing suitability review'); await page.getByLabel('Engraving text',{exact:true}).fill('Synthetic name'); }
    await page.getByLabel('Your name',{exact:true}).fill('Synthetic guest'); await page.getByLabel('Egyptian WhatsApp number',{exact:true}).fill('01012345678');
    const submittedAt=Date.now(), submitted=page.waitForResponse(r=>r.url().endsWith('/commerce/service-requests')&&r.request().method()==='POST');
    await page.getByRole('button',{name:/Submit request/}).click(); const response=await submitted; expect(response.status()).toBe(201);
    const receipt=(await response.json()).data.request; expect(receipt.reference).toMatch(/^TW-/); expect(receipt.state).toBe('submitted');
    // A network observation bounds submission time; controlled-clock exact
    // 0/9/12-hour checks remain in operational-readiness.test.js.
    expect(Date.parse(receipt.followUpDueAt)).toBeGreaterThanOrEqual(submittedAt+12*3600000);
    expect(Date.parse(receipt.followUpDueAt)).toBeLessThanOrEqual(Date.now()+12*3600000);
    const body=response.request().postDataJSON();
    const retried=await context.request.post(api+'/api/v1/commerce/service-requests',{headers:await csrf(context),data:body});
    expect(retried.status()).toBe(201); expect((await retried.json()).data.request.id).toBe(receipt.id);
    const outsider=await browser.newContext(); try {
      const lookup=await outsider.request.get(api+'/api/v1/commerce/service-requests/submissions/'+body.requestKey);
      expect((await lookup.json()).data.request).toBeNull();
    } finally { await outsider.close(); }
    await expect(page.getByRole('button',{name:'Add to Cart',exact:true})).toHaveCount(0);
  }
  const after=await state(request); expect(after.requests).toHaveLength(before.requests.length+2);
  expect(after.orderCount).toBe(before.orderCount); expect(after.giftBox.componentQuantity).toBe(20); expect(signed).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('retained approved template API still validates component quantities, unavailable selections and required fields', async ({ context,request }) => {
  const before=await state(request), headers=await csrf(context);
  const response=await context.request.get(api+'/api/v1/commerce/customization/products/connected-gift-box-product');
  expect(response.status()).toBe(409); expect((await response.json()).error.code).toBe('QUOTATION_REQUIRED');
  const generic=await context.request.get(api+'/api/v1/commerce/customization/products/connected-generic-product'); expect(generic.status()).toBe(200); const normalized=(await generic.json()).data;
  expect(normalized.template.kind).toBe('generic'); expect(normalized.template.groups[0].options.find(o=>o.key==='chocolates')).toMatchObject({available:true,componentPricePiastres:1550,maxQuantity:3});
  expect(normalized.template.groups[0].options.find(o=>o.key==='flowers').available).toBe(false);
  const quote=selections=>context.request.post(api+'/api/v1/commerce/customization/quote',{headers,data:{productId:before.giftBox.genericProductId,customization:{templateId:before.giftBox.genericTemplateId,version:1,selections,fields:{'gift-message':'Synthetic template validation'}}}});
  expect((await quote([{groupKey:'contents',optionKey:'chocolates',quantity:4}])).status()).toBe(400);
  expect((await quote([{groupKey:'contents',optionKey:'unconfigured',quantity:1}])).status()).toBe(400);
  const unavailable=await quote([{groupKey:'contents',optionKey:'flowers',quantity:1}]); expect(unavailable.status()).toBe(409); expect((await unavailable.json()).error.code).toBe('COMPONENT_UNAVAILABLE');
  const missing=await context.request.post(api+'/api/v1/commerce/cart/items',{headers,data:{productId:before.giftBox.genericProductId,quantity:1,customization:{templateId:before.giftBox.genericTemplateId,version:1,selections:[{groupKey:'contents',optionKey:'chocolates',quantity:1}],fields:{}}}});
  expect(missing.status()).toBe(400); expect((await state(request)).orderCount).toBe(before.orderCount);
});
