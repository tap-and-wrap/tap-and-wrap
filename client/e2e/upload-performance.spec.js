import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {mockCommerce,cartWithProduct,isolatedImageFile} from './commerce-fixtures.js';
import {chooseImageFiles} from './media-helpers.js';
import {FONT_REGISTRY} from '../../shared/engraving/definitions.mjs';

const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5191','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type,x-csrf-token','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function setup(page,{failOnce=false,latency=100}={}) {
  const fixture=await mockCommerce(page);let active=0,peak=0,signs=0,puts=0,completes=0,quotes=0,adds=0,failed=false;
  const reply=(route,data)=>route.fulfill({headers,json:{data}});
  await page.route('**/commerce/engraving/types*',route=>reply(route,{enabled:true,types:[{typeId:'perfume',name:'Perfume',pricePiastres:10000,fontIds:FONT_REGISTRY.map(f=>f.id),placements:[]}],hasNext:false}));
  await page.route('**/commerce/engraving/quote',async route=>{quotes++;await delay(latency);return reply(route,{unitPricePiastres:10000,reviewFingerprint:'reviewed-fixture'});});
  await page.route('**/commerce/uploads/**',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const path=new URL(route.request().url()).pathname;await delay(latency);
    if(path.endsWith('/sign')){signs++;active++;peak=Math.max(peak,active);const id=`71000000000000000000${String(signs).padStart(4,'0')}`;return reply(route,{upload:{id},uploadUrl:`https://private-upload.example.test/${id}`,headers:{'Content-Type':'image/png'}});}
    if(path.endsWith('/complete')){completes++;active--;if(failOnce&&!failed){failed=true;return route.fulfill({status:503,headers,json:{error:{message:'Synthetic interrupted verification'}}});}return reply(route,{upload:{id:path.split('/').at(-2)}});}
    return route.fallback();
  });
  await page.route('https://private-upload.example.test/**',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});puts++;await delay(latency);return route.fulfill({status:200,headers,body:''});});
  await page.route('**/commerce/cart/items',async route=>{if(route.request().method()!=='POST')return route.fallback();adds++;await delay(latency);fixture.state.cart=cartWithProduct();return reply(route,{cart:fixture.state.cart});});
  await page.goto('/customize/laser-engraving');await page.getByLabel('Engraving type',{exact:true}).selectOption('perfume');
  return {counts:()=>({signs,puts,completes,quotes,adds,peak}),fixture};
}
async function ready(page,{overall=0,artwork=0}={}) {
  await chooseImageFiles(page,page,/^Engraving surface: Choose surface photo/,isolatedImageFile());
  if(overall){await page.getByText('Additional item photos',{exact:true}).click();await chooseImageFiles(page,page,/^Engraving item: Add overall photos|^Engraving: Add overall photos|^Add overall photos/,Array.from({length:overall},()=>isolatedImageFile()));}
  await page.getByRole('button',{name:'Design Your Engraving',exact:true}).click();
  await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByLabel('Your text',{exact:true}).fill('A lasting memory');
  for(let i=0;i<artwork;i++)await chooseImageFiles(page,page,/^Engraving artwork: Add image artwork/,isolatedImageFile());
  await page.getByRole('button',{name:'Review Your Engraving',exact:true}).click();await expect(page.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();
}
for(const count of [1,5,11])test(`controlled upload benchmark ${count} files`,async({page},info)=>{
  test.setTimeout(60000);const fixture=await setup(page);await ready(page,{overall:count>1?3:0,artwork:count>1?count-4:0});
  const start=performance.now();await page.getByRole('button',{name:'Add to Cart',exact:true}).click();
  await expect.poll(()=>fixture.counts().adds).toBe(1);
  await expect(page.getByRole('heading',{name:'Your Item',exact:true}).or(page.getByRole('heading',{name:'Your engraving is in the cart',exact:true}))).toBeVisible();
  const result={files:count,latencyPerStageMs:100,addToCartMs:Math.round(performance.now()-start),...fixture.counts()};
  await writeFile(info.outputPath(`upload-${count}.json`),JSON.stringify(result,null,2));
  await info.attach(`upload-${count}.json`,{path:info.outputPath(`upload-${count}.json`),contentType:'application/json'});
  expect(result.signs).toBe(count);expect(result.puts).toBe(count);expect(result.completes).toBe(count);expect(result.peak).toBeLessThanOrEqual(2);
});

test('verified sibling uploads are reused after failure; no success before final add',async({page})=>{
  const fixture=await setup(page,{failOnce:true});await ready(page,{overall:3,artwork:1});
  await page.getByRole('button',{name:'Add to Cart',exact:true}).click();
  await expect(page.getByText('Synthetic interrupted verification',{exact:true}).first()).toBeVisible();
  expect(fixture.counts().adds).toBe(0);const first=fixture.counts().completes;
  await page.getByRole('button',{name:'Add to Cart',exact:true}).click();
  await expect(page.getByText('Engraving added to cart.',{exact:true})).toBeVisible();
  expect(fixture.counts().signs).toBe(6);expect(fixture.counts().peak).toBe(2);expect(first).toBe(2);
  await expect(page.locator('.sv-success')).toHaveCount(0);
});

test('upload continues during ordinary navigation and confirms exactly one add',async({page})=>{
  const fixture=await setup(page,{latency:250});await ready(page,{overall:3,artwork:1});
  await page.getByRole('button',{name:'Add to Cart',exact:true}).dblclick();
  await expect(page.locator('.personalized-add-progress')).toBeVisible();
  await page.locator('.personalized-add-progress').getByRole('link',{name:'View cart',exact:true}).click();
  await expect(page).toHaveURL(/\/cart$/);await expect(page.getByText('Engraving added to cart.',{exact:true})).toBeVisible();
  expect(fixture.counts().adds).toBe(1);expect(fixture.counts().signs).toBe(5);
});

test('owner transition aborts background uploads and never adds the old draft',async({page})=>{
  const fixture=await setup(page,{latency:400});await ready(page,{overall:3,artwork:1});
  await page.getByRole('button',{name:'Add to Cart',exact:true}).click();
  await expect.poll(()=>fixture.counts().signs).toBeGreaterThan(0);
  await page.evaluate(async()=>{const session=await import('/src/auth/session.js');session.sessionChangedElsewhere();});
  await expect(page.locator('.personalized-add-progress')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Your Item',exact:true})).toBeVisible();
  await page.waitForTimeout(1400);expect(fixture.counts().adds).toBe(0);
  await expect(page.getByText('Engraving added to cart.',{exact:true})).toHaveCount(0);
});

test('a stalled private upload times out without a false cart success',async({page})=>{
  const fixture=await setup(page);await ready(page);
  await page.clock.install();let release;
  const stalled=new Promise(resolve=>{release=resolve;});
  await page.route('**/commerce/uploads/sign',async route=>{await stalled;return route.abort();});
  await page.getByRole('button',{name:'Add to Cart',exact:true}).click();
  await expect(page.locator('.personalized-add-progress')).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.getByText(/The private upload timed out/).first()).toBeVisible();
  expect(fixture.counts().adds).toBe(0);release();
  await expect(page.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();
});
