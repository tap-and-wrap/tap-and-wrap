import { chooseOption } from '../e2e/select-option.js';
import { test, expect } from '@playwright/test';
import { chooseImageFiles as chooseSharedImageFiles } from '../e2e/media-helpers.js';
async function chooseImageFiles(page,scope,name,files){const input=scope.getByLabel(name,{exact:true});if(await input.count()&&await input.evaluate(element=>element.tagName==='INPUT'&&element.type==='file'))await input.setInputFiles(files);else await chooseSharedImageFiles(page,scope,name,files);}
const api='http://127.0.0.1:'+process.env.TAP_WRAP_CONTRACT_API_PORT;
const origin='http://127.0.0.1:'+process.env.TAP_WRAP_CONTRACT_WEB_PORT;
const image={name:'isolated.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC','base64')};
test.beforeEach(async({context})=>{await context.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)||['blob:','data:'].includes(url.protocol)?route.continue():route.abort();});});
async function headers(context){const result=await(await context.request.get(api+'/api/v1/auth/csrf')).json();return {Origin:origin,'x-csrf-token':result.data.csrfToken};}
async function post(context,path,data){return context.request.post(api+'/api/v1'+path,{headers:await headers(context),data});}
async function login(page,name,destination){destination=destination.replace('/admin/commerce/orders/','/admin/orders/');await page.goto('/login?returnTo='+encodeURIComponent(destination));await page.getByLabel('Email Address').fill(name+'@connected.example.test');await page.getByLabel('Password',{exact:true}).fill('isolated-fixture-password');await page.getByRole('button',{name:'Log In',exact:true}).click();await expect(page).toHaveURL(destination);}
async function start(page){await page.goto('/customize/laser-engraving');await page.getByRole('radio',{name:/Perfume/}).check();await page.getByRole('radio',{name:/Perfume/}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('radio',{name:/Necklace/})).toBeChecked();await page.keyboard.press('ArrowLeft');await expect(page.getByRole('radio',{name:/Perfume/})).toBeChecked();await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('alert')).toContainText('photograph');await chooseImageFiles(page,page,'Photo of your item',image);}
async function text(page){await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Your engraving text').fill('أحمد\n2026');await page.getByRole('radio',{name:/Amiri/}).check();}
async function screen(page,info,name,width){await expect(page.locator('main')).toBeVisible();await expect(page.locator('main').getByText(/^Loading/)).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);await page.setViewportSize({width,height:1000});await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur();});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(name==='cart')await expect.poll(()=>page.locator('.commerce-engraving-cart-item .commerce-cart-item-content').evaluate(element=>element.getBoundingClientRect().width)).toBeGreaterThan(Math.min(width-100,400));if(name==='admin-custody'||name==='unpaid-order')expect(await page.locator('.engraving-financial-summary dd').evaluateAll(elements=>elements.flatMap(element=>{const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);const wrapped=[];let node;while((node=walker.nextNode()))for(const match of node.textContent.matchAll(/\d+\.\d{2}/g)){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);if(range.getClientRects().length>1)wrapped.push(match[0]);}return wrapped;}))).toEqual([]);await page.screenshot({path:info.outputPath(`${name}-${width}.png`),fullPage:true});}
test('connected builder: nine types, all modes, memory draft, widths, cart and inspection-gated checkout',async({page,context},info)=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});await start(page);await expect(page.locator('.engraving-type')).toHaveCount(6);await page.getByRole('button',{name:/Load More/}).click();await expect(page.locator('.engraving-type')).toHaveCount(9);
  for(const width of [320,390,768,1440])await screen(page,info,'step-1',width);
  await text(page);for(const width of [320,390,768,1440])await screen(page,info,'step-2-text',width);
  await page.getByLabel('Your engraving text').fill('A lasting memory\n2026');await page.getByRole('radio',{name:/Rochester/}).check();await screen(page,info,'step-2-english',1440);await page.getByLabel('Your engraving text').fill('\u0623\u062d\u0645\u062f\n2026');await page.getByRole('radio',{name:/Amiri/}).check();
  await page.getByRole('radio',{name:'Icons',exact:true}).check();await page.getByRole('radio',{name:'Heart',exact:true}).check();await screen(page,info,'step-2-icons',1440);
  await page.getByRole('radio',{name:'Personal',exact:true}).check();
  for(const subtype of ['Photo','Handwriting','Fingerprint']){
    await page.getByRole('radio',{name:subtype,exact:true}).check();await chooseImageFiles(page,page,`${subtype} artwork`,image);
    await screen(page,info,`step-2-${subtype.toLowerCase()}`,390);
  }
  await page.getByRole('radio',{name:'Text',exact:true}).check();
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('link',{name:'Customize',exact:true}).first().click();await page.getByRole('link',{name:/Explore Engraving/}).click();await expect(page.getByLabel('Your engraving text')).toHaveValue('أحمد\n2026');
  await page.getByRole('button',{name:'Continue',exact:true}).click();for(const width of [320,390,768,1440])await screen(page,info,'step-3',width);
  await page.getByRole('button',{name:'Add Engraving to Cart',exact:true}).click();await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible();
  const response=await context.request.get(api+'/api/v1/commerce/cart');const cart=(await response.json()).data.cart;expect(cart.items).toHaveLength(1);expect(cart.items[0].unitPricePiastres).toBe(10000);expect(JSON.stringify(cart)).not.toContain('itemPhotoUploadId');
  await page.getByRole('link',{name:'View cart',exact:true}).click();await expect(page.getByRole('link',{name:'Edit engraving'})).toBeVisible();await screen(page,info,'cart',390);await screen(page,info,'cart',1440);
  await page.getByRole('link',{name:'Edit engraving'}).click();await expect(page.getByRole('heading',{name:'Choose your item',exact:true})).toBeVisible();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByText('Any special requests?',{exact:true}).click();await page.getByLabel('Positioning, orientation, size or handling notes').fill('Keep the cap separate.');await screen(page,info,'step-2-special-requests',390);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Add Engraving to Cart'}).click();await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible();await page.getByRole('link',{name:'View cart',exact:true}).click();expect((await(await context.request.get(api+'/api/v1/commerce/cart')).json()).data.cart.items).toHaveLength(1);
  await page.getByRole('link',{name:'Proceed to Checkout',exact:true}).click();await page.getByLabel('Full name').fill('Isolated Customer');await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Egyptian mobile number').fill('01012345678');await chooseOption(page.getByLabel('Governorate'), 'cairo');await page.getByLabel('Return / contact address',{exact:true}).fill('10 Fixture Return Street Cairo');
  await expect(page.getByText('Initial contact within 12 hours.',{exact:true})).toHaveCount(0);await expect(page.getByRole('radio',{name:'InstaPay after inspection and approval'})).toBeChecked();await expect(page.getByRole('button',{name:'Place engraving order · No payment now'})).toBeEnabled();await screen(page,info,'checkout',390);await screen(page,info,'checkout',1440);
  await page.getByRole('button',{name:'Place engraving order · No payment now'}).click();await expect(page).toHaveURL(/\/orders\/[a-f0-9]+$/);const id=page.url().split('/').at(-1);await expect(page.getByRole('heading',{name:'Your item and engraving progress'})).toBeVisible();
  await expect(page.getByRole('heading',{name:/InstaPay instructions/})).toHaveCount(0);await expect(page.getByRole('button',{name:'Submit proof for this order'})).toHaveCount(0);
  expect((await post(context,'/commerce/uploads/sign',{purpose:'payment_proof',orderId:id,mimeType:'image/png',sizeBytes:image.buffer.length})).status()).toBe(409);
  await screen(page,info,'unpaid-order',390);expect(errors).toEqual([]);
});
test('connected real administration publishes type and placement, preserves conflict draft',async({page,context},info)=>{
  await login(page,'admin','/admin/engraving');await expect(page.getByRole('heading',{name:'Standalone engraving',exact:true})).toBeVisible();await expect(page.locator('.studio-admin-grid>article')).toHaveCount(9);
  for(const width of [320,390,768,1440])await screen(page,info,'admin-overview',width);
  await page.getByRole('button',{name:'Create engraving type',exact:true}).click();
  await page.getByLabel('Stable type ID',{exact:true}).fill('fixture-flask');await page.getByLabel('Display name',{exact:true}).fill('Fixture Flask');
  const nav=page.getByRole('navigation',{name:'Configuration sections'});
  await chooseOption(page.getByRole('combobox',{name:/Type status/}), 'active');await nav.getByRole('button',{name:/Approval/}).click();await page.getByRole('button',{name:'Publish configuration version',exact:true}).click();await expect(nav.getByRole('button',{name:/General/})).toHaveAttribute('aria-invalid','true');await expect(nav.getByRole('button',{name:/General/})).toBeFocused();await nav.getByRole('button',{name:/General/}).click();await chooseOption(page.getByRole('combobox',{name:/Type status/}), 'disabled');
  await nav.getByRole('button',{name:/Placements/}).click();await page.getByLabel('New stable placement ID').fill('base');await page.getByRole('button',{name:'Add placement',exact:true}).click();
  await nav.getByRole('button',{name:/Approval/}).click();await page.getByRole('button',{name:'Publish configuration version',exact:true}).click();
  await expect(page.getByText('Engraving settings saved.',{exact:true})).toBeVisible();
  const saved=(await(await context.request.get(api+'/api/v1/admin/commerce/engraving/types')).json()).data.types.find(value=>value.typeId==='fixture-flask');
  const {revision,version,...configuration}=saved;void version;
  expect((await post(context,'/admin/commerce/engraving/types',{expectedRevision:revision,configuration:{...configuration,name:'Concurrent edit'}})).ok()).toBe(true);
  await nav.getByRole('button',{name:/General/}).click();await page.getByLabel('Display name',{exact:true}).fill('Retained conflict draft');
  await nav.getByRole('button',{name:/Approval/}).click();await page.getByRole('button',{name:'Publish configuration version'}).click();await expect(page.getByText(/Your draft is retained/)).toBeVisible();
  await nav.getByRole('button',{name:/General/}).click();await expect(page.getByLabel('Display name',{exact:true})).toHaveValue('Retained conflict draft');
  for(const width of [320,390,768,1440])await screen(page,info,'admin-configuration',width);
});

test('connected physical inspection, acceptance, reconciled payment, engraving and return',async({page,context,browser},info)=>{
  test.setTimeout(120000);await start(page);await text(page);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Add Engraving to Cart'}).click();await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible();
  const checkoutKey=crypto.randomUUID();expect((await post(context,'/commerce/checkout/quote',{checkoutKey,paymentMethod:'instapay',governorate:'cairo'})).ok()).toBe(true);
  const placed=await post(context,'/commerce/orders',{checkoutKey,paymentMethod:'instapay',customer:{name:'Fixture Customer',email:'fixture@example.test',phone:'01012345678',governorate:'cairo',address:'Fixture return address 10'}});expect(placed.status()).toBe(201);const order=(await placed.json()).data.order;
  const adminContext=await browser.newContext({baseURL:origin});const adminPage=await adminContext.newPage();
  try{
    await login(adminPage,'admin','/admin/commerce/orders/'+order.id);
    async function state(){return(await(await adminContext.request.get(api+'/api/v1/admin/commerce/orders/'+order.id)).json()).data.order;}
    async function action(action,extras={}){const current=await state();const response=await post(adminContext,'/admin/commerce/orders/'+order.id+'/engraving-actions',{revision:current.revision,operationKey:crypto.randomUUID(),itemKey:current.engravingWorkflow.items[0].itemKey,action,...extras});expect(response.ok(),JSON.stringify(await response.json())).toBe(true);}
    await action('receive',{condition:'Intact',accessories:'Cap'});await action('inspect');await action('propose',{placementId:'front'});
    await page.goto('/orders/'+order.id);await page.getByLabel('I accept this final placement and my submitted engraving specification.').check();await page.getByRole('button',{name:'Confirm final engraving design'}).click();await expect.poll(async()=>(await state()).engravingWorkflow.items[0].stage).toBe('final_design_confirmed');
    await action('authorize_payment');await page.reload();await expect(page.getByRole('heading',{name:/InstaPay instructions/})).toBeVisible();
    await chooseImageFiles(page,page,'InstaPay payment proof',image);await page.getByRole('button',{name:'Submit proof for this order'}).click();await expect(page.getByText('Proof submitted. Payment awaits account reconciliation.')).toBeVisible();
    let current=await state();const collection=await post(adminContext,'/admin/commerce/orders/'+order.id+'/accounting',{revision:current.revision,action:'collection',operationKey:crypto.randomUUID(),scope:'merchandise',method:'instapay',amountPiastres:10000,reference:crypto.randomUUID(),reconciled:true,reason:'Actual isolated receiving-account verification'});expect(collection.ok()).toBe(true);
    await action('start');await action('complete');await action('arrange_return',{publicReason:'Customer collection agreed'});
    current=await state();expect((await post(adminContext,'/admin/commerce/orders/'+order.id+'/accounting',{revision:current.revision,action:'quote_charge',chargeId:'shipping',pricing:'free',amountPiastres:0,collectionMethod:'instapay',allowedPaymentMethods:['instapay'],reason:'Fixture customer collection'})).ok()).toBe(true);
    current=await state();expect((await post(adminContext,'/admin/commerce/orders/'+order.id+'/accounting',{revision:current.revision,action:'accept_charge',chargeId:'shipping',accepted:true,customerConfirmed:true,reason:'Actual fixture customer confirmation'})).ok()).toBe(true);
    await action('return_to_customer',{publicReason:'Actual customer handoff confirmed'});current=await state();expect(current.engravingWorkflow.items[0].stage).toBe('returned_to_customer');expect(current.fulfillmentState).toBe('delivered');expect(current.inventoryClaims).toEqual([]);
    await adminPage.reload();await expect(adminPage.getByRole('button',{name:/View item photo/})).toBeVisible();await screen(adminPage,info,'admin-custody',390);await screen(adminPage,info,'admin-custody',1440);const viewer=adminPage.getByRole('button',{name:/View item photo/});await viewer.click();await expect(adminPage.getByRole('dialog')).toBeVisible();await adminPage.keyboard.press('Tab');await expect(adminPage.getByRole('dialog').getByRole('button',{name:'Close private file'})).toBeFocused();await adminPage.keyboard.press('Shift+Tab');await expect(adminPage.getByRole('dialog').getByRole('button',{name:'Close private file'})).toBeFocused();await adminPage.keyboard.press('Escape');await expect(adminPage.getByRole('dialog')).not.toBeVisible();await expect(viewer).toBeFocused();
  }finally{await adminContext.close();}
});
test('lost real Add response recovers one line; a rotated guest cannot recover another owner operation',async({page,context,browser})=>{
  await start(page);await text(page);await page.getByRole('button',{name:'Continue',exact:true}).click();let key;
  await page.route('**/api/v1/commerce/cart/items',async route=>{key=route.request().postDataJSON().operationKey;await route.fetch();await route.abort('failed');});
  await page.getByRole('button',{name:'Add Engraving to Cart'}).click();await expect(page.getByRole('heading',{name:'Check your cart addition'})).toBeVisible();
  await page.getByRole('button',{name:'Check add status'}).click();await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible();
  expect((await(await context.request.get(api+'/api/v1/commerce/cart')).json()).data.cart.items).toHaveLength(1);
  const rotated=await browser.newContext();try{const result=await rotated.request.get(api+'/api/v1/commerce/cart/operations/'+key);expect((await result.json()).data.applied).toBe(false);}finally{await rotated.close();}
});


test('wrong owners cannot access engraving resources; cancelled late arrivals can be received and returned in admin',async({page,context,browser},info)=>{
  test.setTimeout(120000);await start(page);await text(page);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Add Engraving to Cart'}).click();await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible();
  const cart=(await(await context.request.get(api+'/api/v1/commerce/cart')).json()).data.cart;
  const saved=(await(await context.request.get(api+'/api/v1/commerce/engraving/cart/'+cart.items[0].id)).json()).data;
  const outsider=await browser.newContext({baseURL:origin}),adminContext=await browser.newContext({baseURL:origin});
  try{
    const outsiderPage=await outsider.newPage();await login(outsiderPage,'bob','/my-orders');
    expect((await outsider.request.get(api+'/api/v1/commerce/engraving/cart/'+cart.items[0].id)).status()).toBe(404);
    expect((await outsider.request.get(api+'/api/v1/commerce/uploads/'+saved.specification.itemPhotoUploadId+'/content')).status()).toBe(404);
    expect((await post(outsider,'/commerce/uploads/'+saved.specification.itemPhotoUploadId+'/complete',{})).status()).toBe(404);
    const checkoutKey=crypto.randomUUID();expect((await post(context,'/commerce/checkout/quote',{checkoutKey,paymentMethod:'instapay',governorate:'cairo'})).ok()).toBe(true);
    const placed=await post(context,'/commerce/orders',{checkoutKey,paymentMethod:'instapay',customer:{name:'Fixture Customer',email:'fixture@example.test',phone:'01012345678',governorate:'cairo',address:'Fixture return address 10'}});expect(placed.status()).toBe(201);const order=(await placed.json()).data.order;
    for(const path of ['/commerce/orders/'+order.id,'/commerce/orders/'+order.id+'/engraving-files'])expect((await outsider.request.get(api+'/api/v1'+path)).status()).toBe(404);
    expect((await post(outsider,'/commerce/orders/'+order.id+'/engraving/accept',{revision:order.revision,operationKey:crypto.randomUUID(),itemKey:saved.specification.itemKey,action:'accept',proposalVersion:1,customerConfirmed:true})).status()).toBe(404);
    const adminPage=await adminContext.newPage();await login(adminPage,'admin','/admin/commerce/orders/'+order.id);
    expect((await post(adminContext,'/admin/commerce/orders/'+order.id+'/accounting',{revision:order.revision,action:'cancel',reconciled:true,reason:'Cancelled before arrival'})).ok()).toBe(true);
    await adminPage.reload();await chooseOption(adminPage.getByLabel('Engraving operation'), 'receive');await adminPage.getByLabel('Condition on receipt').fill('Intact late arrival');await adminPage.getByRole('button',{name:'Save engraving operation'}).click();
    async function stage(){return(await(await adminContext.request.get(api+'/api/v1/admin/commerce/orders/'+order.id)).json()).data.order;}
    await expect.poll(async()=>(await stage()).engravingWorkflow.items[0].stage).toBe('item_received');
    await chooseOption(adminPage.getByLabel('Engraving operation'), 'arrange_return');await adminPage.getByLabel('Customer-visible details',{exact:true}).fill('Actual customer collection agreed');await adminPage.getByRole('button',{name:'Save engraving operation'}).click();await expect.poll(async()=>(await stage()).engravingWorkflow.items[0].stage).toBe('return_arranged');
    await chooseOption(adminPage.getByLabel('Engraving operation'), 'return_to_customer');await adminPage.getByRole('button',{name:'Save engraving operation'}).click();await expect.poll(async()=>(await stage()).engravingWorkflow.items[0].stage).toBe('returned_to_customer');
    const returned=await stage();expect(returned.fulfillmentState).toBe('cancelled');expect(returned.collectionAuthorized).toBe(false);expect(returned.engravingWorkflow.items[0].inCustody).toBe(false);expect(returned.inventoryClaims).toEqual([]);await screen(adminPage,info,'cancelled-late-arrival-return',390);
  }finally{await outsider.close();await adminContext.close();}
});
