import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {giftBoxFixture} from './gift-box-fixtures.js';
import {cartWithProduct,mockCommerce,isolatedImageFile} from './commerce-fixtures.js';
import {ASSET_VERSION} from '../../shared/gift-box/definitions.mjs';

const widths=[320,390,440,768,1024,1440];
async function shot(page,info,name){const viewportOnly=await page.getByRole('dialog').count()>0||name.includes('focus-enlarge');if(!viewportOnly)await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:info.outputPath(`${name}.png`),fullPage:!viewportOnly,animations:'disabled'});}
async function decoded(image){await image.evaluate(node=>node.decode());}
async function overflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
const gift=()=>({id:'gift-fixture',kind:'gift_box_v2',name:'Build Your Gift Box',quantity:1,maxQuantity:2,valid:true,unitPricePiastres:96000,lineTotalPiastres:96000,giftBox:{
  box:{componentId:'box-2',displayName:'Heart gift box'},items:[{componentId:'rose-red',category:'flower',quantity:3,displayName:'Red rose'},{componentId:'plush-1',category:'plush',quantity:1,displayName:'Soft toy'},{componentId:'chocolate-1',category:'chocolate',quantity:1,displayName:'Chocolate'}],ribbon:{componentId:'ribbon-navy',displayName:'Navy ribbon',colorHex:'#203356'},giftCard:{selected:true,message:'With love, always.'},artwork:{assetVersion:ASSET_VERSION},design:{presentationVersion:'gift-box-presentation-v2',placements:[{componentId:'rose-red',x:.3,y:.4,width:.12,height:.12,zone:'inside',layer:0},{componentId:'plush-1',x:.5,y:.3,width:.2,height:.25,zone:'inside',layer:1}]},personalization:{photoCount:2,sticker:{text:'For Nour',styleId:'amiri',colorId:'gold'},unitAdjustmentPiastres:6000}}});
const engraving=()=>({id:'engraving-fixture',kind:'engraving_service_v1',name:'Watch engraving',quantity:1,valid:true,unitPricePiastres:10000,lineTotalPiastres:10000,engraving:{typeName:'Watch',placementLabel:'Back of watch',content:{mode:'text',text:'Always together',fontId:'engraving-rochester-v1'},requestedAppearance:'grey',specialRequests:'Please align with the clasp.',files:{item:true,surface:true,artwork:false}}});
async function cartFixture(page){
  const product={...cartWithProduct().items[0],maxQuantity:3};
  const items=[product,gift(),engraving()];
  const fixture=await mockCommerce(page,{cart:{items,quantity:3,subtotalPiastres:131000},checkoutEnabled:false,mixedCheckout:true});
  await page.route('**/api/v1/commerce/engraving/cart/engraving-fixture',route=>route.fulfill({json:{ok:true,data:{specification:{itemPhotoUploadId:'a'.repeat(24),surfacePhotoUploadId:'b'.repeat(24),content:{}}}}}));
  await page.route(/\/commerce\/uploads\/[ab]{24}\/content/,route=>route.fulfill({contentType:'image/png',body:isolatedImageFile().buffer}));
  return fixture;
}
for(const width of widths)test(`premium photos select separately from inspection at ${width}`,async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:900});await giftBoxFixture(page,{componentOverrides:{'box-3':{inventoryQuantity:0}}});await page.goto('/customize/gift-box');
  await page.getByRole('button',{name:'Show 6 more',exact:true}).click();
  const photos=page.locator('.gb-box-choice-photo img');await expect(photos).toHaveCount(12);
  for(const photo of await photos.all()){await photo.scrollIntoViewIfNeeded();await decoded(photo);expect(await photo.evaluate(node=>node.naturalWidth>0&&/thumbnail\/(320|640)\//.test(node.currentSrc))).toBe(true);}
  await page.evaluate(()=>scrollTo(0,0));await shot(page,info,`${width}-box-grid`);
  const card=page.getByRole('button',{name:'Choose Fixture box-2',exact:true});
  await card.locator('img').evaluate(node=>node.scrollIntoView({block:'center'}));await card.locator('img').click();await expect(card).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('dialog')).toHaveCount(0);
  const enlarge=page.getByRole('button',{name:'Enlarge Fixture box-3 photo',exact:true});await enlarge.focus();await shot(page,info,`${width}-focus-enlarge`);await enlarge.click();
  const viewer=page.getByRole('dialog',{name:'Fixture box-3',exact:true});await decoded(viewer.getByRole('img'));await expect(card).toHaveAttribute('aria-pressed','true');
  const image=viewer.locator('img'),stage=viewer.locator('.gb-lightbox-stage');
  expect(await image.evaluate(node=>node.naturalWidth)).toBe(960);
  const bounds=await stage.boundingBox(),fit=await image.boundingBox();expect(fit.width).toBeLessThanOrEqual(bounds.width+.1);expect(fit.height).toBeLessThanOrEqual(bounds.height+.1);
  await shot(page,info,`${width}-lightbox-fit`);
  await viewer.getByRole('button',{name:'Zoom in',exact:true}).click();await viewer.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+150,bounds.y+bounds.height/2-100,{steps:8});await page.mouse.up();
  await expect(stage).toHaveClass(/is-zoomed/);await shot(page,info,`${width}-lightbox-pan`);
  await viewer.getByRole('button',{name:'Fit photo to screen'}).click();await expect(viewer.locator('output')).toHaveText('100%');
  await stage.hover();await page.mouse.wheel(0,-200);await expect(stage).toHaveClass(/is-zoomed/);
  await viewer.getByRole('button',{name:'Zoom out',exact:true}).click();await viewer.getByRole('button',{name:'Fit photo to screen'}).click();
  await page.keyboard.press('Escape');await expect(enlarge).toBeFocused();await expect(page.getByRole('button',{name:'Choose Fixture box-3',exact:true})).toBeDisabled();
  const wholeCard=page.getByRole('button',{name:'Choose Fixture box-4',exact:true}),box=await wholeCard.boundingBox();
  expect(await wholeCard.evaluate(node=>node.getBoundingClientRect().height>=node.parentElement.getBoundingClientRect().height-2.1)).toBe(true);
  await wholeCard.click({position:{x:8,y:box.height-5}});await expect(wholeCard).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('dialog')).toHaveCount(0);
  await overflow(page);expect(errors).toEqual([]);
});
for(const width of widths)test(`unified cart collapsed, details and confirmation at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});const fixture=await cartFixture(page);await page.goto('/cart');
  const giftCard=page.getByRole('article',{name:'Gift Box',exact:true}),engravingCard=page.getByRole('article',{name:'Watch Engraving',exact:true}),productCard=page.getByRole('article',{name:'Isolated Commerce Gift',exact:true});
  await expect(page.getByRole('button',{name:'Clear cart'})).toHaveCount(0);await expect(page.getByRole('link',{name:'Build another Gift Box'})).toHaveCount(0);
  await expect(giftCard.getByText('With love, always.',{exact:true})).toBeHidden();await expect(engravingCard.getByText('Always together',{exact:true})).toBeHidden();
  await expect(engravingCard.getByRole('group',{name:'Quantity for Watch Engraving'})).toHaveText('1 item');await expect(engravingCard.getByRole('button',{name:/quantity/})).toHaveCount(0);
  await decoded(engravingCard.locator('.cart-v2-photo img'));
  // The longest word in the service title must fit without a one-letter line.
  expect(await engravingCard.locator('h2').evaluate(node=>{const canvas=document.createElement('canvas'),c=canvas.getContext('2d');c.font=getComputedStyle(node).font;return c.measureText('Engraving').width<=node.getBoundingClientRect().width;})).toBe(true);
  await shot(page,info,`${width}-cart-collapsed`);
  for(const line of [giftCard,engravingCard,productCard]){await line.getByRole('button',{name:/View.*Details/}).click();}
  await expect(giftCard.getByText('With love, always.',{exact:true})).toBeVisible();await expect(engravingCard.locator('dl').getByText('Always together',{exact:true})).toBeVisible();await shot(page,info,`${width}-cart-details`);
  const increase=giftCard.getByRole('button',{name:'Increase quantity for Gift Box'});await increase.click();await expect(giftCard.locator('output')).toHaveText('2');await expect(increase).toBeDisabled();
  await giftCard.getByRole('button',{name:'Decrease quantity for Gift Box'}).click();await expect(giftCard.locator('output')).toHaveText('1');
  await productCard.getByRole('button',{name:/Increase quantity/}).click();await expect(productCard.locator('output')).toHaveText('2');
  const trash=giftCard.getByRole('button',{name:'Remove Gift Box',exact:true});await trash.click();
  const dialog=page.getByRole('dialog',{name:'Remove Gift Box?',exact:true});await expect(dialog.getByRole('button',{name:'Keep item'})).toBeFocused();await shot(page,info,`${width}-cart-remove`);await page.keyboard.press('Escape');await expect(trash).toBeFocused();expect(fixture.state.cart.items).toHaveLength(3);
  await trash.click();await dialog.getByRole('button',{name:'Remove item',exact:true}).click();await expect(giftCard).toHaveCount(0);expect(fixture.state.cart.items).toHaveLength(2);
  await overflow(page);
});
test('lightbox contains landscape media, touch pinch, cancellation and panning bounds',async({page,context})=>{
  await page.setViewportSize({width:390,height:700});await giftBoxFixture(page);
  // Landscape test photograph is a real local rectangular reference; only the isolated request is replaced.
  const landscape=await readFile(new URL('../public/media/tap-wrap-laser-engraving-poster.webp',import.meta.url));
  await page.route('**/__gift-box-photos/**/original/**',route=>route.fulfill({contentType:'image/webp',body:landscape}));
  await page.goto('/customize/gift-box');await page.getByRole('button',{name:'Enlarge Fixture box-2 photo'}).click();const viewer=page.getByRole('dialog');await decoded(viewer.locator('img'));
  const stage=viewer.locator('.gb-lightbox-stage'),rect=await stage.boundingBox(),img=await viewer.locator('img').boundingBox();expect(img.width).toBeLessThanOrEqual(rect.width);expect(img.height).toBeLessThanOrEqual(rect.height);
  const cdp=await context.newCDPSession(page),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y},{x:x+30,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y},{x:x+50,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y},{x:x+80,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(stage).toHaveClass(/is-zoomed/);await cdp.detach();await stage.focus();for(let n=0;n<30;n++)await page.keyboard.press('ArrowLeft');const moved=await viewer.locator('img').boundingBox();expect(moved.x+moved.width).toBeGreaterThan(rect.x+rect.width/2);await page.keyboard.press('Escape');
});

test('all three line types confirm only their own removal and release private object URLs',async({page})=>{
  await page.addInitScript(()=>{
    const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
    window.privateUrlAudit={created:[],revoked:[]};
    URL.createObjectURL=function(...args){const url=create.apply(this,args);window.privateUrlAudit.created.push(url);return url;};
    URL.revokeObjectURL=function(url){window.privateUrlAudit.revoked.push(url);return revoke.call(this,url);};
  });
  const fixture=await cartFixture(page);await page.goto('/cart');await decoded(page.getByAltText('Your private item reference'));
  for(const name of ['Isolated Commerce Gift','Gift Box','Watch Engraving']){
    const before=fixture.state.cart.items.map(item=>item.id),line=page.getByRole('article',{name,exact:true}),id=fixture.state.cart.items.find(item=>name==='Gift Box'?item.kind==='gift_box_v2':name==='Watch Engraving'?item.kind==='engraving_service_v1':!item.kind).id;
    const opener=line.getByRole('button',{name:`Remove ${name}`,exact:true});await opener.click();
    const dialog=page.getByRole('dialog',{name:`Remove ${name}?`,exact:true});await dialog.getByRole('button',{name:'Keep item'}).click();await expect(opener).toBeFocused();expect(fixture.state.cart.items.map(item=>item.id)).toEqual(before);
    await opener.click();await dialog.getByRole('button',{name:'Remove item',exact:true}).click();await expect(line).toHaveCount(0);expect(fixture.state.cart.items.map(item=>item.id)).toEqual(before.filter(value=>value!==id));
  }
  await expect(page.getByText('Your cart is empty.',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.privateUrlAudit.created.length>0&&window.privateUrlAudit.created.every(url=>window.privateUrlAudit.revoked.includes(url)))).toBe(true);
});

test('a lost removal response keeps the same intended target and permits an idempotent explicit retry',async({page})=>{
  const fixture=await cartFixture(page);let attempts=0;
  await page.route('**/api/v1/commerce/cart/items/gift-fixture',async route=>{
    if(route.request().method()!=='DELETE')return route.fallback();attempts++;
    if(attempts===1){fixture.state.cart.items=fixture.state.cart.items.filter(item=>item.id!=='gift-fixture');return route.abort('failed');}
    return route.fallback();
  });
  await page.goto('/cart');await page.getByRole('button',{name:'Remove Gift Box',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Remove Gift Box?',exact:true});await dialog.getByRole('button',{name:'Remove item',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Retrying removes only this same item');expect(attempts).toBe(1);
  await dialog.getByRole('button',{name:'Remove item',exact:true}).click();await expect(page.getByRole('article',{name:'Gift Box',exact:true})).toHaveCount(0);
  expect(attempts).toBe(2);expect(fixture.state.cart.items.map(item=>item.id)).toEqual(['line-1','engraving-fixture']);
});
