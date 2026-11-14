import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { mockCommerce, cartWithProduct, isolatedImageFile } from './commerce-fixtures.js';
import { FONT_REGISTRY } from '../../shared/engraving/definitions.mjs';
import { publicContacts } from '../../shared/storefront-content.mjs';

async function twist(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box=await page.locator(selector).boundingBox(),session=await page.context().newCDPSession(page);
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const points=(angle,radius)=>[0,1].map(id=>({id,x:cx+Math.cos(angle+id*Math.PI)*radius,y:cy+Math.sin(angle+id*Math.PI)*radius}));
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(0,20)});
  for(let i=1;i<=11;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(i*20*Math.PI/180,20+i)});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
}
for(const width of [320,390,768,1024,1440])test(`sticker and engraving transforms stay aligned and clean at ${width}px`,async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:1000});await mockCatalog(page);
  await page.goto('/e2e/fixtures/sticker-workspace/index.html');
  await page.getByLabel('Write a name, special date, or heartfelt message').fill('With love');
  await expect(page.getByRole('button',{name:'Adjust View',exact:true})).toHaveCount(0);
  await expect(page.locator('.sticker-resize,.sticker-help')).toHaveCount(0);
  const original=await page.evaluate(()=>window.snapshotSticker());
  await twist(page,'.sticker-text-target');
  const transformed=await page.evaluate(()=>window.snapshotSticker().placements['box-1']);
  expect(Math.abs(transformed.rotation)).toBeGreaterThan(35);
  await page.getByRole('button',{name:'Undo sticker change'}).click();
  expect(await page.evaluate(()=>window.snapshotSticker())).toEqual(original);
  await page.getByRole('button',{name:'Redo sticker change'}).click();
  expect(await page.evaluate(()=>window.snapshotSticker().placements['box-1'])).toEqual(transformed);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`sticker-${width}.png`),fullPage:true});
  await page.goto('/e2e/fixtures/visual-engraving/index.html');
  const bytes=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=900;canvas.height=600;const c=canvas.getContext('2d');c.fillStyle='#b0a295';c.fillRect(0,0,900,600);return canvas.toDataURL().split(',')[1];});
  await page.route('**/fixture-product.png',route=>route.fulfill({body:Buffer.from(bytes,'base64'),contentType:'image/png'}));
  await page.evaluate(()=>window.openApprovedProduct());
  await expect(page.locator('.ve-move')).toHaveCount(0);
  await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByLabel('Your text',{exact:true}).fill('With love');
  await expect(page.locator('.ve-resize')).toHaveCount(0);
  const before=await page.evaluate(()=>window.snapshotEditor());
  await twist(page,'.ve-layer-target');
  const after=await page.evaluate(()=>window.snapshotEditor());
  expect(Math.abs(after.design.layers[0].rotation)).toBeGreaterThan(35);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await page.evaluate(()=>window.snapshotEditor())).toEqual(before);
  await page.getByRole('button',{name:'Redo',exact:true}).click();expect(await page.evaluate(()=>window.snapshotEditor())).toEqual(after);
  await expect(page.getByRole('button',{name:/Bring forward|Send backward|Remove design|Center design/i})).toHaveCount(0);
  await page.getByRole('button',{name:'Adjust View',exact:true}).click();await page.getByRole('button',{name:'Zoom in workspace'}).click();
  await expect(page.locator('.ve-viewport')).toHaveCSS('scrollbar-width','none');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>window.snapshotEditor())).toEqual(after);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`engraving-${width}.png`),fullPage:true});
  expect(errors).toEqual([]);
});

for(const lost of ['none','proof','order','changed-quote','upload','double-click','cod'])test(`checkout saves private evidence and accepts one unpaid order, lost acknowledgement=${lost}`,async({page},info)=>{
  await page.setViewportSize({width:390,height:900});
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedTransferValue=value;}}}));
  const fixture=await mockCommerce(page,{checkoutEnabled:true,cart:cartWithProduct(),loseFirstOrderResponse:lost==='order'});
  let payment=null,proofAttempts=0,privateCheckoutKey=null,uploadAttempts=0;
  if(lost==='upload')await page.route('**/api/v1/commerce/uploads/sign',route=>{uploadAttempts++;return uploadAttempts===1?route.fulfill({status:503,json:{error:{message:'Temporary upload failure'}}}):route.fallback();});
  const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5191','Access-Control-Allow-Credentials':'true'};
  await page.route('**/api/v1/commerce/checkout/**',async route=>{
    const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():null;
    const reply=data=>route.fulfill({headers,json:{ok:true,data}});
    if(path.endsWith('/config')||path.includes('/submissions/'))return route.fallback();
    if(path.endsWith('/quote'))return reply({fingerprint:body.discountCode?'fixture-changed-price':'fixture-current-price',totals:{subtotalPiastres:25000,discountPiastres:0,totalPiastres:25000},paymentGroups:[{id:'merchandise',method:body.paymentMethod,amountPiastres:25000}]});
    if(path.endsWith('/cancel')){payment=null;return reply({cancelled:true});}
    if(path.endsWith('/payments')&&body.discountCode)return route.fulfill({headers,status:409,json:{ok:false,error:{code:'CHECKOUT_PAYMENT_REVIEW_REQUIRED',message:'Keep the original reference for reconciliation.'}}});
    if(path.endsWith('/payments')){privateCheckoutKey=body.checkoutKey;payment||={reference:'22222222-2222-4222-8222-222222222222',state:'prepared',amountPiastres:25000,destination:'01060673073',expiresAt:new Date(Date.now()+600000).toISOString(),proofReceived:false};return reply({payment});}
    if(path.endsWith('/proof')){proofAttempts++;expect(body.senderName).toBe('Fixture Sender');expect(fixture.uploads).toHaveLength(1);payment={...payment,proofReceived:true,state:'proof_received'};fixture.state.order.checkoutPayment={reference:payment.reference};if(lost==='proof'&&proofAttempts===1)return route.abort('failed');return reply({payment});}
    return reply({payment});
  });
  await page.goto('/checkout');await page.getByRole('radio',{name:/InstaPay/}).check();
  await expect(page.getByRole('button',{name:'Copy transfer destination'})).toBeVisible();
  await page.getByRole('button',{name:'Copy transfer destination'}).click();expect(await page.evaluate(()=>window.copiedTransferValue)).toBe('01060673073');
  await page.getByRole('button',{name:'Copy transfer amount'}).click();expect(await page.evaluate(()=>window.copiedTransferValue)).toBe('250.00');
  await expect(page.getByLabel('Governorate',{exact:true})).toHaveValue('');
  await page.getByLabel('Full name', {exact:true}).fill('Isolated Customer');
  await page.getByLabel('Egyptian mobile number').fill('01012345678');
  await page.getByLabel('Governorate', {exact:true}).selectOption('cairo');
  await page.getByLabel('City / Area', {exact:true}).fill('Isolated City');
  await page.getByLabel('Street address', {exact:true}).fill('Isolated test delivery address');
  await expect(page.getByRole('button',{name:'Copy transfer destination'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeDisabled();
  if(lost==='none'){
    await page.getByText('Have a discount code?',{exact:true}).click();
    for(const width of [320,337,343,390,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      const discount=await page.locator('.commerce-discount').boundingBox(),apply=await page.getByRole('button',{name:'Apply code',exact:true}).boundingBox();
      expect(apply.x).toBeGreaterThanOrEqual(discount.x);expect(apply.x+apply.width).toBeLessThanOrEqual(discount.x+discount.width);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(page.locator('.checkout-proof-drop>.image-upload-area')).toHaveCSS('min-height','210px');
      await page.locator('.checkout-instapay').screenshot({path:info.outputPath(`reference-instapay-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:900});
  }
  if(lost==='changed-quote'){
    await page.getByText('Have a discount code?',{exact:true}).click();await page.getByLabel('Discount code',{exact:true}).fill('CHANGED');await page.getByRole('button',{name:'Apply code',exact:true}).click();
    await expect(page.getByText(/This payment reference requires review/)).toBeVisible();await expect(page.getByRole('button',{name:'Copy transfer destination'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeDisabled();expect(fixture.orders).toHaveLength(0);return;
  }
  if(lost==='cod'){await page.getByRole('radio',{name:'Cash on Delivery',exact:true}).click();await page.getByRole('button',{name:'I have not transferred',exact:true}).click();await page.getByRole('button',{name:'Place Order',exact:true}).click();await expect(page.getByRole('heading',{name:/Thank you/})).toBeVisible();expect(fixture.orders[0].paymentMethod).toBe('cod');expect(fixture.uploads).toHaveLength(0);return;}
  await page.getByLabel('Transfer sender name').fill('Fixture Sender');await page.getByLabel('Transaction screenshot',{exact:true}).setInputFiles(isolatedImageFile());
  await expect(page.getByAltText('Selected transaction screenshot')).toBeVisible();
  await page.screenshot({path:info.outputPath('checkout-instapay-upload-mobile.png'),fullPage:true});
  await expect(page.getByRole('button',{name:'Save payment proof'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
  expect(fixture.uploads).toHaveLength(0);
  await page.screenshot({path:info.outputPath('checkout-instapay-mobile.png'),fullPage:true});
  const place=page.getByRole('button',{name:'Place Order',exact:true});
  if(lost==='upload'){await place.click();await expect(page.getByText('Temporary upload failure',{exact:true}).first()).toBeVisible();expect(fixture.orders).toHaveLength(0);await expect(place).toBeEnabled();}
  await place.click(lost==='double-click'?{clickCount:2}:{});if(lost==='order'){await expect(page.getByRole('heading',{name:'Check your order submission',exact:true})).toBeVisible();await page.getByRole('button',{name:'Check submission status',exact:true}).click();}await expect(page.getByRole('heading',{name:/Thank you/})).toBeVisible();
  expect(fixture.uploads).toHaveLength(1);expect(fixture.uploads[0].checkoutKey).toBe(privateCheckoutKey);expect(fixture.uploads[0].orderId).toBeUndefined();
  expect(fixture.orders).toHaveLength(1);expect(fixture.orders[0].paymentState).toBe('awaiting_verification');
});

test('image layers support pinch and twist without changing colors, insertion order or private asset roles',async({page})=>{
  await mockCatalog(page);await page.setViewportSize({width:390,height:900});await page.goto('/e2e/fixtures/visual-engraving/index.html');
  await page.route('**/fixture-product.png',route=>route.fulfill({body:isolatedImageFile().buffer,contentType:'image/png'}));await page.evaluate(()=>window.openApprovedProduct());
  await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByLabel('Your text',{exact:true}).fill('Under artwork');
  await page.getByLabel('Image artwork',{exact:true}).setInputFiles(isolatedImageFile());await expect(page.locator('.ve-layer img')).toBeVisible();
  const before=await page.evaluate(()=>window.snapshotEditor());expect(before.design.layers.map(layer=>layer.type)).toEqual(['text','image']);
  await twist(page,'.ve-layer-target >> nth=1');const after=await page.evaluate(()=>window.snapshotEditor());expect(Math.abs(after.design.layers[1].rotation)).toBeGreaterThan(35);
  await expect(page.locator('.ve-layer img')).toHaveCSS('filter','none');await expect(page.locator('.ve-layer img')).toHaveCSS('opacity','1');
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await page.evaluate(()=>window.snapshotEditor())).toEqual(before);
  await page.getByRole('button',{name:'Redo',exact:true}).click();expect(await page.evaluate(()=>window.snapshotEditor())).toEqual(after);
  await page.locator('.ve-layers').getByRole('button',{name:'1. Under artwork',exact:true}).click();
  expect((await page.evaluate(()=>window.snapshotEditor())).design.layers.map(layer=>layer.id)).toEqual(before.design.layers.map(layer=>layer.id));
});

test('cart design disclosure toggles, revokes preview URLs and keeps type and font appearance without font labels',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await page.addInitScript(()=>{window.revocationCount=0;const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revocationCount++;revoke(url);};});
  const surface='710000000000000000000111',art='710000000000000000000112',font=FONT_REGISTRY.find(font=>font.language==='en');
  const design={version:'visual-engraving-v1',surface:{assetId:surface,aspectRatio:1},layers:[{id:'text',type:'text',text:'A memory',fontId:font.id,color:'black',x:.5,y:.3,width:.3,aspectRatio:3},{id:'image',type:'image',assetId:art,x:.5,y:.7,width:.2,aspectRatio:1,rotation:90}]};
  const line={id:'11111111-1111-4111-8111-111111111111',kind:'engraving_service_v2',name:'Perfume Engraving',quantity:1,valid:true,unitPricePiastres:10000,lineTotalPiastres:10000,engraving:{typeName:'Perfume',placementLabel:'Help me choose the best placement',layers:design.layers.map(({assetId,...layer})=>{void assetId;return layer;})}};
  await mockCommerce(page,{checkoutEnabled:true,cart:{items:[line],quantity:1,subtotalPiastres:10000}});
  const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5191','Access-Control-Allow-Credentials':'true'};
  await page.route('**/api/v1/commerce/engraving/cart/*',route=>route.fulfill({headers,json:{ok:true,data:{specification:{contractVersion:'engraving-spec-v2',surfacePhotoUploadId:surface,design}}}}));
  let artworkReads=0;
  await page.route('**/api/v1/commerce/uploads/*/content',route=>{if(route.request().url().includes(art))artworkReads++;return route.fulfill({headers,contentType:'image/png',body:isolatedImageFile().buffer});});
  await page.goto('/cart');await page.getByRole('button',{name:'View Design Details',exact:true}).click();
  await expect(page.locator('.cart-v2-details')).toContainText('Perfume');
  await expect(page.locator('.cart-v2-details')).not.toContainText('Position guidance');
  await expect(page.locator('.cart-v2-details')).not.toContainText(font.label);
  await expect(page.getByRole('link',{name:'Edit engraving',exact:true})).toHaveCount(0);expect(artworkReads).toBe(0);
  await page.getByRole('button',{name:'View design',exact:true}).click();await expect(page.locator('.saved-visual-preview .ve-composite')).toBeVisible();expect(artworkReads).toBe(1);
  const revocations=await page.evaluate(()=>window.revocationCount),button=page.getByRole('button',{name:'Hide design',exact:true});await button.click();
  await expect(page.getByRole('button',{name:'View design',exact:true})).toBeFocused();await expect(page.locator('.saved-visual-preview .ve-composite')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.revocationCount)).toBeGreaterThan(revocations);
});

test('Contact actions use approved destinations and all 64 review ratings occupy a separate row',async({page},info)=>{
  await mockCatalog(page);
  for(const width of [320,390]){
    await page.setViewportSize({width,height:900});await page.goto('/contact');
    const actions=page.locator('.contact-page-actions');await expect(actions.getByRole('link')).toHaveCount(3);
    await expect(actions.getByRole('link',{name:'WhatsApp',exact:true})).toHaveAttribute('href',`https://wa.me/${publicContacts.whatsapp.replace(/\D/g,'')}`);
    await expect(actions.getByRole('link',{name:'Instagram',exact:true})).toHaveAttribute('href',publicContacts.instagram);
    await expect(actions.getByRole('link',{name:'Email',exact:true})).toHaveAttribute('href',`mailto:${publicContacts.email}`);
    await page.goto('/reviews');await expect(page.locator('.testimonial-card')).toHaveCount(64);
    const card=page.locator('.testimonial-card').first();await card.scrollIntoViewIfNeeded();
    const name=await card.locator('.testimonial-author').boundingBox(),stars=await card.locator('.customer-words-stars').boundingBox();
    expect(stars.y).toBeGreaterThanOrEqual(name.y+name.height);
    await expect(card.locator('.testimonial-author .review-confirmed')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`review-layout-${width}.png`),fullPage:true});
  }
});
