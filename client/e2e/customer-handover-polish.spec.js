import {test,expect} from '@playwright/test';
import {mockCommerce,cartWithProduct,fillCheckout,isolatedImageFile} from './commerce-fixtures.js';

for(const width of [320,390,1440])for(const method of ['cod','instapay'])test(`${method} confirmed receipt scrolls instantly after bottom submission at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:800});
 const fixture=await mockCommerce(page,{checkoutEnabled:true,cart:cartWithProduct(),loseFirstOrderResponse:method==='instapay'});
 let release;
 await page.route('**/commerce/orders',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  await new Promise(resolve=>{release=resolve;});await route.fallback();
 });
 await page.goto('/checkout');await fillCheckout(page);
 if(method==='instapay'){
  await page.getByRole('radio',{name:/InstaPay/}).check();
  expect(fixture.calls.filter(call=>call.path==='/commerce/checkout/payments'&&call.method==='POST')).toHaveLength(0);
  await page.getByRole('button',{name:'View transfer details',exact:true}).click();
  await page.getByLabel(/^Transfer sender name/).fill('Fixture Sender');
  await page.getByLabel('Transaction screenshot',{exact:true}).setInputFiles(isolatedImageFile());
 }
 const place=page.getByRole('button',{name:'Place Order',exact:true});
 await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(100);
 await place.evaluate(button=>button.click());
 await expect(page.locator('.upload-progress .tw-spinner')).toBeVisible();await expect(page.locator('progress')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Placing your order/})).toBeDisabled();
 expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(100);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('submitting.png'),fullPage:true});await expect.poll(()=>typeof release).toBe('function');release();
 if(method==='instapay')await page.getByRole('button',{name:'Check submission status',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Thank you for your order!',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 const heading=await page.getByRole('heading',{name:'Thank you for your order!',exact:true}).boundingBox();expect(heading.y).toBeLessThan(400);
 expect(fixture.orders).toHaveLength(1);expect(fixture.uploads).toHaveLength(method==='instapay'?1:0);
 await page.screenshot({path:info.outputPath('receipt.png'),fullPage:true});
});

test('shopping before requesting instructions does not issue or persist a payment reference',async({page})=>{
 const fixture=await mockCommerce(page,{checkoutEnabled:true,cart:cartWithProduct()});
 await page.goto('/checkout');await fillCheckout(page);await page.getByRole('radio',{name:/InstaPay/}).check();
 await expect(page.getByRole('button',{name:'View transfer details',exact:true})).toBeEnabled();
 await page.getByRole('link',{name:'Shop',exact:true}).first().click();
 fixture.state.cart.items[0].quantity=2;fixture.state.cart.items[0].lineTotalPiastres=50000;fixture.state.cart.subtotalPiastres=50000;fixture.state.cart.quantity=2;
 await page.goto('/checkout');await fillCheckout(page);await page.getByRole('radio',{name:/InstaPay/}).check();
 await expect(page.locator('.commerce-total')).toContainText('500.00');await expect(page.getByRole('button',{name:'Update payment details',exact:true})).toHaveCount(0);
 expect(fixture.calls.filter(call=>call.path==='/commerce/checkout/payments'&&call.method==='POST')).toHaveLength(0);
});

test('email receipt renders the original transparent PNG at mobile and desktop sizes',async({page},info)=>{
 const {renderEmailTemplate}=await import('../../server/src/email/templates.js');
 const {writeFile}=await import('node:fs/promises');
 const receipt=renderEmailTemplate({event:'order_received',snapshot:{orderNumber:'123456',totalPiastres:251000,paymentMethod:'instapay',paymentState:'awaiting_verification',items:[{name:'Synthetic mixed gift',quantity:1}]}},{clientOrigin:'http://127.0.0.1:5191'});
 await writeFile(info.outputPath('receipt.html'),receipt.html);await writeFile(info.outputPath('receipt.txt'),receipt.text);
 await page.route('**/__email-preview',route=>route.fulfill({contentType:'text/html',body:receipt.html}));
 await page.goto('/__email-preview');
 const response=await page.request.get('/tap-wrap-email-logo.png');expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('image/png');
 const logo=page.getByRole('img',{name:'Tap & Wrap',exact:true});await logo.evaluate(image=>image.decode());
 await expect(logo).toHaveAttribute('src',/tap-wrap-email-logo\.png$/);
 for(const width of [390,800]) {
  await page.setViewportSize({width,height:1000});const bounds=await logo.boundingBox();expect(bounds.width).toBe(180);expect(bounds.height).toBe(60);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`email-${width}.png`),fullPage:true});
 }
});

test('discount conflict refreshes stale recovery eligibility without resetting an issued reference',async({page})=>{
 const fixture=await mockCommerce(page,{checkoutEnabled:true,cart:cartWithProduct()});
 await page.route('**/commerce/checkout/quote',async route=>{
  const body=route.request().postDataJSON();if(!body.discountCode)return route.fallback();
  return route.fulfill({status:409,headers:{'access-control-allow-origin':'http://127.0.0.1:5191','access-control-allow-credentials':'true'},json:{ok:false,error:{code:'CHECKOUT_PAYMENT_CHANGED',message:'Technical fingerprint conflict'}}});
 });
 await page.goto('/checkout');await fillCheckout(page);await page.getByRole('radio',{name:/InstaPay/}).check();
 await page.getByRole('button',{name:'View transfer details',exact:true}).click();await expect(page.getByRole('button',{name:'Copy transfer destination'})).toBeVisible();
 await page.getByText('Have a discount code?',{exact:true}).click();await page.getByLabel('Discount code',{exact:true}).fill('ISOLATED');await page.getByRole('button',{name:'Apply code',exact:true}).click();
 await expect(page.getByRole('button',{name:'Update payment details',exact:true})).toBeVisible();await expect(page.getByText('Technical fingerprint conflict',{exact:true})).toHaveCount(0);await expect(page.locator('.checkout-transfer-placeholder')).toHaveCount(0);
 await expect(page.getByLabel(/^Transfer sender name/)).toHaveCount(0);expect(fixture.calls.filter(call=>call.path.endsWith('/cancel'))).toHaveLength(0);
 const keys=fixture.calls.filter(call=>call.path==='/commerce/checkout/payments'&&call.method==='POST').map(call=>call.body.checkoutKey);expect(new Set(keys).size).toBe(1);
});
