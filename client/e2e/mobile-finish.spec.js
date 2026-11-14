import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { mockCommerce, isolatedImageFile } from './commerce-fixtures.js';

for (const width of [320,390,768,1024,1440]) test(`measured sticker frames and outside deselection at ${width}`, async ({page}, info) => {
  await page.setViewportSize({width,height:900}); await mockCatalog(page);
  await page.goto('/e2e/fixtures/sticker-workspace/index.html');
  const input=page.getByLabel('Write a name, special date, or heartfelt message');
  await input.fill('AB'); await page.evaluate(()=>document.fonts.ready);
  const frame=page.locator('.sticker-position');
  await expect.poll(()=>frame.evaluate(n=>parseFloat(n.style.width))).toBeLessThan(30);
  const short=await frame.evaluate(n=>parseFloat(n.style.width));
  const shortHeight=await frame.evaluate(n=>parseFloat(n.style.height));
  await input.fill('A beautiful memory forever');
  await expect.poll(()=>frame.evaluate(n=>parseFloat(n.style.width))).toBeGreaterThan(short*1.4);
  await expect.poll(()=>frame.evaluate(n=>parseFloat(n.style.height))).toBeGreaterThan(shortHeight*1.5);
  await input.fill('\u0623\u062d\u0645\u062f'); await page.evaluate(()=>document.fonts.ready);
  await expect(frame.locator('text')).toHaveAttribute('direction','rtl');
  const target=page.getByRole('button',{name:'Move sticker text',exact:true});
  await target.click(); await expect(target).toHaveAttribute('aria-pressed','true');
  const before=await page.evaluate(()=>window.snapshotSticker());
  await page.getByRole('heading',{name:'Your box sticker'}).click();
  await expect(target).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>window.snapshotSticker())).toEqual(before);
  await expect(page.locator('.sticker-proof-image.is-editable')).toHaveCSS('touch-action','pan-y');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`sticker-measured-${width}.png`),fullPage:true});
});

for (const editor of ['sticker','engraving']) test(`${editor} background permits native touch scrolling and outside taps preserve the design`,async({page})=>{
  await page.setViewportSize({width:390,height:700});await mockCatalog(page);
  await page.goto(`/e2e/fixtures/${editor==='sticker'?'sticker-workspace':'visual-engraving'}/index.html`);
  if(editor==='sticker')await page.getByLabel('Write a name, special date, or heartfelt message').fill('AB');
  else {
    await page.route('**/fixture-product.png',route=>route.fulfill({body:isolatedImageFile().buffer,contentType:'image/png'}));
    await page.evaluate(()=>window.openApprovedProduct());await page.getByRole('button',{name:'Add text',exact:true}).click();
  }
  const target=page.locator(editor==='sticker'?'.sticker-text-target':'.ve-layer-target');
  await target.click();await expect(target).toHaveAttribute('aria-pressed','true');
  const before=await page.evaluate(e=>e==='sticker'?window.snapshotSticker():window.snapshotEditor(),editor);
  await page.evaluate(()=>{const b=document.createElement('button');b.textContent='Outside editor';b.id='outside-editor';document.body.append(b);document.body.style.paddingBottom='1200px';});
  await page.locator('#outside-editor').click();await expect(target).toHaveAttribute('aria-pressed','false');
  const board=page.locator(editor==='sticker'?'.sticker-proof-image.is-editable':'.ve-board');
  await board.scrollIntoViewIfNeeded();const box=await board.boundingBox(),start=await page.evaluate(()=>scrollY);
  const cdp=await page.context().newCDPSession(page),x=box.x+box.width*.1,y=box.y+box.height*.8;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x,y:y-i*12}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(start+30);
  expect(await page.evaluate(e=>e==='sticker'?window.snapshotSticker():window.snapshotEditor(),editor)).toEqual(before);
});

for (const failure of [503,403,404,410]) test(`private cart thumbnail handles ${failure} without replacing the design`,async({page})=>{
  const id='710000000000000000000111'; let reads=0;
  const item={id:'11111111-1111-4111-8111-111111111111',kind:'engraving_service_v2',name:'Perfume Engraving',quantity:1,valid:true,unitPricePiastres:10000,lineTotalPiastres:10000,engraving:{typeName:'Perfume',layers:[]}};
  await mockCommerce(page,{cart:{items:[item],quantity:1,subtotalPiastres:10000}});
  await page.route('**/commerce/engraving/cart/*',route=>route.fulfill({json:{ok:true,data:{specification:{contractVersion:'engraving-spec-v2',surfacePhotoUploadId:id}}}}));
  await page.route('**/commerce/uploads/*/content',route=>{reads++;return reads===1?route.fulfill({status:failure,json:{error:{code:'UNAVAILABLE'}}}):route.fulfill({contentType:'image/png',body:isolatedImageFile().buffer});});
  await page.goto('/cart');
  if(failure===503){await expect(page.locator('.cart-v2-photo img')).toBeVisible();await expect.poll(()=>reads).toBe(2);await expect(page.locator('.cart-v2-photo img')).toHaveJSProperty('naturalWidth',1);}
  else {await expect(page.locator('.cart-v2-photo')).toContainText('Private image unavailable');await page.waitForTimeout(1600);expect(reads).toBe(1);}
  await expect(page.getByText('Inspection and design acceptance before engraving.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'View Design Details',exact:true}).click();
  await expect(page.locator('.engraving-summary dt')).toHaveText(['Type']);
  await expect(page.locator('.cart-v2-disclosure')).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Space');
  await expect(page.locator('.cart-v2-disclosure')).toHaveAttribute('aria-expanded','false');
});
