import { test, expect } from '@playwright/test';
import { mockCommerce, cartWithProduct, fillCheckout, isolatedImageFile } from './commerce-fixtures.js';
import { mockCatalog } from './catalog-fixtures.js';
import { chooseImageFiles } from './media-helpers.js';
import { renderEmailTemplate } from '../../server/src/email/templates.js';

const headers = {'Access-Control-Allow-Origin':'http://127.0.0.1:5191','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type,x-csrf-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
async function checkout(page, options = {}) {
  const fixture = await mockCommerce(page,{checkoutEnabled:true,cart:cartWithProduct(),...options});
  const totals={subtotalPiastres:25000,discountPiastres:0,shippingPiastres:null,totalPiastres:25000};
  fixture.state.order.totals=totals;
  let payment=null, preparations=0, proofs=0, release;
  const gate = options.delayed ? new Promise(resolve=>{release=resolve;}) : Promise.resolve();
  const reply=(route,data)=>route.fulfill({headers,json:{ok:true,data}});
  await page.route('**/api/v1/commerce/checkout/**',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/quote')){
      const input=route.request().postDataJSON();
      if(input.paymentMethod==='instapay')await gate;
      const discount=input.discountCode==='ISOLATED'?2500:0;
      return reply(route,{fingerprint:`${input.paymentMethod}:${discount}`,totals:{...totals,discountPiastres:discount,totalPiastres:25000-discount},summaryRows:[{id:'products',label:'Products',amountPiastres:25000}],...(payment&&input.paymentMethod==='instapay'?{payment}:{})});
    }
    if(path.endsWith('/payments')){preparations++;payment={reference:'12345678-1234-4123-8123-123456789012',state:'prepared',destination:'01060673073',amountPiastres:25000,expiresAt:new Date(Date.now()+600000).toISOString(),proofReceived:false};return reply(route,{payment});}
    if(path.endsWith('/proof')){proofs++;payment={...payment,proofReceived:true,state:'proof_received'};return reply(route,{payment});}
    if(path.includes('/payments/'))return reply(route,{payment,paymentMethod:payment?'instapay':null,state:payment?'open':null});
    return route.fallback();
  });
  return {...fixture,release:()=>release?.(),counts:()=>({preparations,proofs})};
}

for(const width of [320,390,768,1024,1440])test(`checkout and clean receipt at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const fixture=await checkout(page,{delayed:true});
  await page.goto('/checkout');await fillCheckout(page);
  await page.getByRole('radio',{name:/InstaPay/}).check();
  await expect(page.getByRole('region',{name:'InstaPay transfer details'})).toBeVisible();
  await expect(page.getByLabel('Transfer sender name *')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'View transfer details',exact:true})).toBeDisabled();
  expect(fixture.counts().preparations).toBe(0);
  await expect(page.getByText('01060673073',{exact:true})).toHaveCount(0);
  fixture.release();await page.getByRole('button',{name:'View transfer details',exact:true}).click();await expect(page.getByText('01060673073',{exact:true})).toBeVisible();
  await page.getByRole('radio',{name:'Cash on Delivery',exact:true}).check();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.checkout-instapay')).toBeHidden();
  await page.getByRole('radio',{name:/InstaPay/}).check();
  await expect(page.getByText('01060673073',{exact:true})).toBeVisible();
  await page.getByLabel('Transfer sender name *').fill('Isolated Sender');
  await chooseImageFiles(page,page,/^InstaPay: Choose screenshot/i,isolatedImageFile());
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
  await expect(page.getByText('Payment reference for support')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Refresh order total'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:info.outputPath(`checkout-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Place Order',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you for your order!'})).toBeVisible();
  await expect(page.getByText(`Order #${fixture.state.order.orderNumber}`,{exact:true})).toBeVisible();
  await expect(page.getByText(/InstaPay.*Awaiting verification/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Submit or replace private payment proof'})).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link',{name:'Track Order',exact:true})).toHaveAttribute('href',`/orders/${fixture.state.order.id}`);
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:info.outputPath(`receipt-${width}.png`),fullPage:true});
  expect(fixture.orders).toHaveLength(1);expect(fixture.counts().proofs).toBe(1);expect(errors).toEqual([]);
});

test('discount totals update automatically and valid transfer re-entry reuses instructions',async({page})=>{
  const fixture=await checkout(page);await page.goto('/checkout');await fillCheckout(page);
  await page.getByText('Have a discount code?').click();await page.getByLabel('Discount code',{exact:true}).fill('ISOLATED');await page.getByRole('button',{name:'Apply code'}).click();
  await expect(page.locator('.commerce-total')).toContainText('225.00');
  await page.getByRole('button',{name:'Remove code'}).click();await expect(page.locator('.commerce-total')).toContainText('250.00');
  await page.getByRole('radio',{name:/InstaPay/}).check();await page.getByRole('button',{name:'View transfer details',exact:true}).click();await expect(page.getByText('01060673073',{exact:true})).toBeVisible();
  const count=fixture.counts().preparations;await page.reload();
  await expect(page.getByRole('radio',{name:/InstaPay/})).toBeChecked();await expect(page.getByText('01060673073',{exact:true})).toBeVisible();
  expect(fixture.counts().preparations).toBe(count);
});

test('lost order acknowledgement retries the same immutable request and saved proof',async({page})=>{
  const fixture=await checkout(page,{loseFirstOrderResponse:true});await page.goto('/checkout');await fillCheckout(page);
  await page.getByRole('radio',{name:/InstaPay/}).check();await page.getByRole('button',{name:'View transfer details',exact:true}).click();await expect(page.getByText('01060673073',{exact:true})).toBeVisible();
  await page.getByLabel('Transfer sender name *').fill('Isolated Sender');await chooseImageFiles(page,page,/^InstaPay: Choose screenshot/i,isolatedImageFile());
  await page.getByRole('button',{name:'Place Order',exact:true}).click();await page.getByRole('button',{name:'Retry same submission',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you for your order!'})).toBeVisible();
  const requests=fixture.calls.filter(call=>call.path==='/commerce/orders'&&call.method==='POST');
  expect(requests).toHaveLength(2);expect(requests[0].body).toEqual(requests[1].body);expect(fixture.orders).toHaveLength(1);expect(fixture.counts().proofs).toBe(1);
});

for(const width of [320,390,768,1024,1440])test(`canvas movement, fitted engraving and layout at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await mockCatalog(page);
  await page.goto('/e2e/fixtures/sticker-workspace/index.html');
  await page.getByLabel('Write a name, special date, or heartfelt message').fill('AB');
  await expect.poll(()=>page.evaluate(()=>window.snapshotSticker().placements?.['box-1']?.version)).toBe('box-sticker-workspace-v2');
  for(let i=0;i<30;i++)await page.getByRole('button',{name:'Move sticker up',exact:true}).click();
  expect((await page.evaluate(()=>window.snapshotSticker())).placements['box-1'].y).toBeLessThan(.1);
  await expect(page.getByText(/Placement outside the box/)).toHaveCount(0);
  const trash=page.getByRole('button',{name:'Remove sticker',exact:true});await trash.click();await page.getByRole('button',{name:'Keep sticker',exact:true}).click();
  await expect(page.getByLabel('Write a name, special date, or heartfelt message')).toHaveValue('AB');
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:info.outputPath(`sticker-${width}.png`),fullPage:true});
  await trash.click();await page.getByRole('button',{name:'Remove sticker',exact:true}).last().click();
  await expect(page.getByLabel('Write a name, special date, or heartfelt message')).toHaveValue('');
  await page.route('**/fixture-product.png',route=>route.fulfill({body:isolatedImageFile().buffer,contentType:'image/png'}));
  await page.goto('/e2e/fixtures/visual-engraving/index.html');await page.evaluate(()=>window.openApprovedProduct());
  await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByLabel('Your text',{exact:true}).fill('AB');
  const snap=()=>page.evaluate(()=>window.snapshotEditor().design);
  await expect.poll(async()=>(await snap()).layers[0].text).toBe('AB');
  const short=(await snap()).layers[0];
  await page.getByLabel('Your text',{exact:true}).fill('Twenty lovely letters');await expect.poll(async()=>(await snap()).layers[0].width).toBeGreaterThan(short.width);
  await page.getByLabel('Your text',{exact:true}).fill('AB\nCD\nEF');await expect.poll(async()=>(await snap()).layers[0].aspectRatio).toBeLessThan(short.aspectRatio);
  await page.getByLabel('Your text',{exact:true}).fill('\u062d\u0628');await expect(page.locator('.ve-layer text')).toHaveAttribute('direction','rtl');
  const original=await snap();await page.evaluate(()=>window.restoreEditor(window.snapshotEditor()));await expect.poll(snap).toEqual(original);
  await expect(page.getByText(/saved text style is no longer/)).toHaveCount(0);
  await page.locator('.ve-layers button').first().click();
  expect(await page.locator('.ve-layout').evaluate(node=>getComputedStyle(node).display)).toBe(width>=1024?'grid':'flex');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:info.outputPath(`engraving-${width}.png`),fullPage:true});
});

test('customer email renders compactly on mobile with escaped content and no external delivery',async({page},info)=>{
  await mockCatalog(page);
  const message=renderEmailTemplate({event:'order_received',snapshot:{orderNumber:'123456',totalPiastres:61000,paymentMethod:'instapay',paymentState:'awaiting_verification',items:[{name:'Gift Box',kind:'gift_box_v2',quantity:2},{name:'Perfume engraving',quantity:1}]}},{clientOrigin:'http://127.0.0.1:5191'});
  for(const width of [320,390,768]){await page.setViewportSize({width,height:900});await page.setContent(message.html);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('heading',{name:'We received your order'})).toBeVisible();await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:info.outputPath(`email-${width}.png`),fullPage:true});}
});
