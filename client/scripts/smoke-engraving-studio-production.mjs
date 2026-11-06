// Explicitly authorized synthetic cart-only smoke. No orders, payments or fulfillment.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FONT_REGISTRY } from '../../shared/engraving/definitions.mjs';
import { STUDIO_PLACEMENTS } from '../../shared/engraving/studio-placements.mjs';
import { createProductionClient, productionPreflight } from '../../server/scripts/launch-engraving-production.js';

if(process.argv.length!==3||process.argv[2]!=='--authorized-studio-cart-smoke')throw Error('EXPLICIT_STUDIO_PRODUCTION_SMOKE_REQUIRED');
const site='https://tapandwrap.net',api='https://api.tapandwrap.net';
const directory=new URL('../test-results-engraving-studio-production/',import.meta.url);
await mkdir(directory,{recursive:true});
const report={time:new Date().toISOString(),success:false,synthetic:true,ordersCreated:0,paymentsProcessed:0,checks:[]};
const client=createProductionClient(),browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[],signs=[];
page.on('pageerror',error=>errors.push(error.name));
page.on('request',request=>{if(request.url()===api+'/api/v1/commerce/uploads/sign')signs.push(request.postDataJSON()?.fieldKey);});
await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(['blob:','data:'].includes(url.protocol))return route.continue();
  if(url.protocol!=='https:')return route.abort();
  if(url.origin===api&&/\/orders(?:\/|$)|\/admin\//.test(url.pathname))return route.abort();
  if(['PUT','OPTIONS'].includes(method)&&url.hostname.endsWith('.r2.cloudflarestorage.com')&&url.searchParams.has('X-Amz-Signature'))return route.continue();
  if(['GET','HEAD','OPTIONS'].includes(method))return [site,api].includes(url.origin)||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)?route.continue():route.abort();
  if(url.origin!==api)return route.abort();
  if(method==='POST'&&/^\/api\/v1\/commerce\/(?:engraving\/quote|uploads\/sign|uploads\/[a-f0-9]{24}\/complete|cart\/items|checkout\/quote)$/.test(url.pathname))return route.continue();
  // Deletion is limited to this fresh disposable guest's own synthetic cart line.
  if(method==='DELETE'&&/^\/api\/v1\/commerce\/cart\/items\/[a-f0-9-]{36}$/.test(url.pathname))return route.continue();
  return route.abort();
});
async function screen(name){await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur();});await page.screenshot({path:fileURLToPath(new URL(name+'.png',directory)),fullPage:true});}
async function json(path){const response=await context.request.get(api+path);expect(response.status()).toBe(200);return(await response.json()).data;}
const image={name:'SYNTHETIC-STUDIO-V2-NO-ORDER.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC','base64')};
try{
  const preflight=await productionPreflight(client);expect(preflight.intakeEnabled).toBe(true);report.assetsVerified=preflight.assets.length;
  const types=await client.get('/api/v1/commerce/engraving/types?page=1');expect(types.enabled).toBe(true);expect(types.types).toHaveLength(9);
  expect(new Set(types.types.map(type=>type.typeId)).size).toBe(9);
  for(const type of types.types){expect(type.pricePiastres).toBe(10000);expect(type.fontIds).toHaveLength(12);expect(type.iconIds).toHaveLength(48);expect(type.placements.filter(value=>value.status==='active').length).toBe(STUDIO_PLACEMENTS[type.typeId].length);}
  report.configurations=types.types.map(type=>({typeId:type.typeId,version:type.version,pricePiastres:type.pricePiastres,placements:type.placements.length,fonts:type.fontIds.length,icons:type.iconIds.length}));report.checks.push('nine-upgraded-types-EGP100-and-85-live-assets');
  await page.goto(site+'/customize/laser-engraving');await expect(page.locator('.engraving-type')).toHaveCount(6);await screen('six-items-desktop');
  await page.getByRole('button',{name:/Load More/}).click();await expect(page.locator('.engraving-type')).toHaveCount(9);
  await page.getByRole('radio',{name:/Perfume/}).check();await page.getByLabel('Photo of your item',{exact:true}).setInputFiles(image);
  await page.getByText('Add a close-up of the engraving surface (optional)',{exact:true}).click();await page.getByLabel('Close-up of engraving surface (optional)',{exact:true}).setInputFiles(image);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('radio',{name:'Front',exact:true}).check();await page.getByRole('radio',{name:'Help me choose the best placement',exact:true}).check();
  await page.getByLabel('Your engraving text').fill('\u0623\u062d\u0645\u062f');await expect(page.getByRole('radio',{name:/Rochester/})).toBeDisabled();await page.getByRole('radio',{name:/Amiri/}).check();
  for(const font of FONT_REGISTRY)expect(await page.evaluate(async font=>(await document.fonts.load(`28px ${font.family}`,font.language==='ar'?'\u0623\u062d\u0645\u062f':'Forever')).length,font)).toBeGreaterThan(0);
  await page.getByLabel('Your engraving text').fill('SYNTHETIC STUDIO TEST');await page.getByRole('radio',{name:/Rochester/}).check();await screen('english-font-gallery');
  await page.getByRole('radio',{name:'Icons',exact:true}).check();await page.getByLabel('Find a symbol').fill('Butterfly');await page.getByRole('radio',{name:'Butterfly',exact:true}).check();await screen('symbol-preview');
  await page.getByRole('radio',{name:'Personal',exact:true}).check();await expect(page.getByRole('radio',{name:'Drawing',exact:true})).toHaveCount(0);
  await page.getByRole('radio',{name:'Fingerprint',exact:true}).check();await page.getByLabel('Fingerprint artwork',{exact:true}).setInputFiles(image);
  await page.getByRole('radio',{name:'Handwriting',exact:true}).check();const canvas=page.getByLabel('Write your handwriting artwork');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
  await page.mouse.move(box.x+30,box.y+50);await page.mouse.down();await page.mouse.move(box.x+120,box.y+100,{steps:15});await page.mouse.move(box.x+220,box.y+40,{steps:15});await page.mouse.up();await page.getByRole('button',{name:'Use this handwriting'}).click();await expect(page.getByRole('status')).toContainText('Artwork ready');
  for(const color of ['Black','White','Grey'])await page.getByRole('radio',{name:color,exact:true}).check();
  await page.getByText('Any special requests?',{exact:true}).click();await page.getByLabel('Positioning, orientation, size or handling notes').fill('AUTHORIZED SYNTHETIC STUDIO TEST. NO ITEM EXISTS. DO NOT FULFILL OR CHARGE.');
  await page.setViewportSize({width:390,height:900});await screen('handwriting-mobile');await page.setViewportSize({width:1440,height:1000});
  expect(signs).toHaveLength(0);await page.getByRole('button',{name:'Continue',exact:true}).click();await screen('review');await page.getByRole('button',{name:'Add Engraving to Cart',exact:true}).click();await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible({timeout:30000});
  const cart=(await json('/api/v1/commerce/cart')).cart;expect(cart.items).toHaveLength(1);expect(cart.items[0].kind).toBe('engraving_service_v1');expect(cart.items[0].quantity).toBe(1);expect(cart.items[0].unitPricePiastres).toBe(10000);expect(signs.sort()).toEqual(['item_photo','personal_artwork','surface_photo']);
  await page.getByRole('link',{name:'View cart',exact:true}).click();await expect(page.getByAltText('Your private item reference')).toBeVisible();await expect(page.getByAltText('Your private artwork')).toBeVisible();await screen('private-cart');report.checks.push('live-private-item-surface-and-handwriting-upload','fonts-symbols-appearance-help-and-review','one-EGP100-service-line-no-orders');
  await page.goto(site+'/checkout');await expect(page.getByText('Your engraving order starts unpaid.',{exact:false})).toBeVisible();await expect(page.getByText(/Place engraving order/)).toBeVisible();await expect(page.getByText(/Transfer to|Upload payment proof/)).toHaveCount(0);await screen('unpaid-checkout-no-submission');
  await page.goto(site+'/cart');await page.getByRole('button',{name:/Remove Perfume engraving/}).click();await expect(page.getByText('Your cart is empty.',{exact:true})).toBeVisible();report.checks.push('synthetic-cart-removed');
  await page.goto(site+'/customize/gift-box');await expect(page.locator('main:not([data-prerender])').getByRole('heading',{name:'Build your gift box',exact:true})).toBeVisible();await expect(page.locator('main:not([data-prerender]) .gb-choices')).toBeVisible();
  await page.goto(site+'/shop');await expect(page.locator('main:not([data-prerender])')).toBeVisible();await page.goto(site+'/checkout');await expect(page.getByText('Your cart is empty.',{exact:true})).toBeVisible();report.checks.push('gift-box-shop-and-empty-checkout-read-only');
  expect(errors).toEqual([]);report.success=true;
}catch(error){report.failure={name:error.name,message:String(error.message).slice(0,1000)};process.exitCode=1;await screen('failure').catch(()=>{});}
finally{await writeFile(new URL('latest.json',directory),JSON.stringify(report,null,2));await context.close();await browser.close();await client.close();console.log(JSON.stringify(report,null,2));}
