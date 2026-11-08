import {test,expect} from '@playwright/test';
import {mockCatalog} from './catalog-fixtures.js';
import {mockCommerce,cartWithProduct,commerceOrder} from './commerce-fixtures.js';

for (const width of [390,1440]) test(`full-card navigation keeps purchase actions independent at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await mockCommerce(page,{checkoutEnabled:true});await page.goto('/shop');
  const card=page.locator('.catalog-card').first(),link=card.locator('.catalog-card-link');
  await expect(card).toBeVisible();const href=await link.getAttribute('href');
  const box=await card.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(400);
  expect(Math.abs((await card.boundingBox()).y-box.y)).toBeLessThan(0.5);
  await page.mouse.click(box.x+4,box.y+box.height/2);await expect(page).toHaveURL(href);
  await page.goto('/shop');await card.locator('.catalog-card-link').focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(href);
  await page.goto('/shop');await card.getByRole('button',{name:/Add to Cart/}).click();await expect(page).toHaveURL('/shop');
  await page.screenshot({path:info.outputPath(`product-cards-${width}.png`),fullPage:true});
});

test('WhatsApp remains a separate action from its full-card product link',async({page})=>{
  await mockCatalog(page);await page.goto('/shop');const card=page.locator('.catalog-card').nth(2);
  const action=card.getByRole('link',{name:/Enquire on WhatsApp/});await expect(action).toHaveAttribute('href',/^https:\/\/wa.me\//);
  const popup=page.waitForEvent('popup');await action.click();const opened=await popup;await opened.close();await expect(page).toHaveURL('/shop');
});

for (const width of [390,768,1440]) test(`mixed checkout presents deferred engraving and both methods at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:950});
  const cart=cartWithProduct();cart.items.push({id:'engraving-fixture',kind:'engraving_service_v1',name:'Watch Engraving',valid:true,quantity:1,unitPricePiastres:10000,lineTotalPiastres:10000});cart.quantity++;cart.subtotalPiastres+=10000;
  await mockCommerce(page,{cart,checkoutEnabled:true,mixedCheckout:true});await page.goto('/checkout');
  await expect(page.getByText('One order, separate payment arrangements.')).toBeVisible();
  await expect(page.getByRole('radio',{name:'Cash on Delivery',exact:true})).toBeVisible();await expect(page.getByRole('radio',{name:'InstaPay',exact:true})).toBeVisible();
  await expect(page.getByText(/Engraving is unpaid until physical inspection/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`mixed-checkout-${width}.png`),fullPage:true});
});

async function prerenderFixture(page,{delay=2500,fail=false}={}){
  await mockCatalog(page);
  await page.route('http://127.0.0.1:5191/',async route=>{
    const response=await route.fetch();let html=await response.text();
    html=html.replace('<div id="root"></div>','<div id="root"><main data-prerender="true"><h1>Meaningful crawlable homepage</h1><p>Accessible without JavaScript.</p></main></div>');
    await route.fulfill({response,body:html});
  });
  await page.route(/\/src\/main\.jsx(?:\?|$)/,async route=>{if(fail)return route.abort();await new Promise(resolve=>setTimeout(resolve,delay));await route.continue();});
}
test('first paint uses one held ribbon before delayed React, then a seamless single reveal',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await prerenderFixture(page);await page.goto('/',{waitUntil:'commit'});
  await expect(page.getByTestId('ribbon-opening')).toBeVisible();await expect(page.locator('.tw-ribbon-opening')).toHaveCount(1);
  await expect(page.locator('.tw-ribbon-opening')).not.toHaveClass(/is-playing/);
  await page.screenshot({path:info.outputPath('first-paint-held-ribbon.png')});
  await expect(page.locator('.tw-ribbon-opening')).toHaveClass(/is-playing/);await expect(page.getByRole('heading',{name:'Make their heart flutter.'})).toBeVisible();
  await expect(page.locator('.tw-ribbon-opening')).toHaveCount(0);await page.screenshot({path:info.outputPath('homepage-after-ribbon.png')});
  await page.reload();await expect(page.locator('.tw-ribbon-opening')).toHaveCount(0);
});
test('failed React initialization releases the original static homepage within the bounded deadline',async({page})=>{
  await prerenderFixture(page,{fail:true});await page.goto('/');await expect(page.getByTestId('ribbon-opening')).toBeVisible();
  await page.evaluate(async()=>{const {initializePrerender}=await import('/src/seo/boot.js');initializePrerender(document.getElementById('root'));});
  await expect(page.getByTestId('ribbon-opening')).toHaveCount(0,{timeout:8000});await expect(page.getByRole('heading',{name:'Meaningful crawlable homepage'})).toBeVisible();
});
test('reduced motion exposes the prerender immediately without an opening blocker',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await prerenderFixture(page);await page.goto('/',{waitUntil:'commit'});
  await expect(page.getByRole('heading',{name:'Meaningful crawlable homepage'})).toBeVisible();await expect(page.getByTestId('ribbon-opening')).toHaveCount(0);
});
test('JavaScript-disabled visitors keep the complete static homepage',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
  await prerenderFixture(page);await page.goto('http://127.0.0.1:5191/');
  await expect(page.getByRole('heading',{name:'Meaningful crawlable homepage'})).toBeVisible();await expect(page.getByTestId('ribbon-opening')).toHaveCount(0);await context.close();
});

function mixedOrder() {
  const itemKey='cbd69d07-df4b-4aab-9fef-b8f02c241d72';
  const groups=[{id:'merchandise',label:'Products & Gift Boxes',amountPiastres:25000,outstandingPiastres:25000,method:'instapay',authorized:true,status:'unpaid'}, {id:'engraving',label:'Engraving after inspection',amountPiastres:10000,outstandingPiastres:10000,method:'cod',authorized:false,status:'deferred'}];
  return {...structuredClone(commerceOrder),accountingVersion:2,orderChannel:'website',merchandiseFulfillment:'received',paymentMethod:'instapay',paymentInstructions:null,collectionAuthorized:true,
    totals:{subtotalPiastres:35000,totalPiastres:35000,discountPiastres:0,shippingPiastres:null,applied:[]},
    lines:[...commerceOrder.lines,{kind:'engraving_service_v1',name:'Watch Engraving',quantity:1,unitPricePiastres:10000,lineTotalPiastres:10000,engraving:{itemKey,placementLabel:'Front',placements:[],content:{mode:'text',text:'Nour',fontId:'engraving-amiri-v1'},requestedAppearance:'black',fileRoles:['itemPhotoUploadId']}}],
    engravingWorkflow:{collectionAuthorized:false,items:[{itemKey,stage:'awaiting_customer_item',inCustody:false,history:[],proposal:null}]},
    paymentInstructionsByGroup:[{scope:'merchandise',label:'Products & Gift Boxes',destination:'01060673073',amountPiastres:25000}],
    paymentObligations:groups,accounting:{groups,charges:[{id:'shipping',label:'Delivery',state:'pending',amountPiastres:null,kind:'shipping'},{id:'return_shipping',label:'Item handoff / return',state:'pending',amountPiastres:null,kind:'shipping'}],settlements:[],merchandisePiastres:35000,agreedTotalPiastres:35000,collectedPiastres:0,refundedPiastres:0,outstandingPiastres:35000,overpaymentPiastres:0,unresolvedCharges:2,collectionAuthorized:true},inventoryClaims:[{kind:'product',quantity:1,mode:'tracked'}]};
}
for(const width of [390,768,1440]) test(`unified customer and owner order obligations remain readable at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:950});const order=mixedOrder();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const fixture=await mockCommerce(page,{order,role:'admin'});
  await page.goto('/orders/'+order.id);await expect(page.getByRole('heading',{name:'Order #681243',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Products & Gift Boxes · InstaPay'})).toBeVisible();
  await expect(page.getByText('Currently authorized:')).toContainText('250');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`mixed-order-customer-${width}.png`),fullPage:true});
  await page.goto('/admin/orders/'+order.id);await expect(page.getByRole('heading',{name:'Customer item custody & engraving'})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Merchandise fulfillment'})).toBeVisible();
  expect(fixture.calls.filter(call=>/\/files\/|\/proof$/.test(call.path))).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`mixed-order-owner-${width}.png`),fullPage:true});expect(errors).toEqual([]);
});
