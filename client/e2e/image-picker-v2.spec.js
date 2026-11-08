import {test,expect} from '@playwright/test';
import {mockCommerce,commerceProduct,isolatedImageFile} from './commerce-fixtures.js';
import {chooseImageFiles} from './media-helpers.js';
const product={...commerceProduct,requiresOptions:true,personalization:{requiredBeforePurchase:true,fields:[{key:'photo',label:'Your photo',type:'image',required:true,minFiles:1,maxFiles:3,maxBytes:5242880,acceptedMimeTypes:['image/png','image/jpeg','image/webp']}]}};
async function start(page){const fixture=await mockCommerce(page,{product,checkoutEnabled:true});await page.goto(`/products/${product.slug}`);await page.getByRole('button',{name:'Customize This',exact:true}).click();return fixture;}
async function holdRead(page){await page.addInitScript(()=>{
 const read=Blob.prototype.arrayBuffer;window.__readCount=0;window.__owned=[];window.__revoked=[];
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
 URL.createObjectURL=file=>{window.__owned.push(file);return create(file);};URL.revokeObjectURL=url=>{window.__revoked.push(url);return revoke(url);};
 Blob.prototype.arrayBuffer=async function(){if(this.name==='held.png'){window.__readCount++;window.__native=this;await new Promise(resolve=>{window.__releaseRead=resolve;});}return read.call(this);};
});}
test('picker remains mounted and populated until byte copy; the delivered file survives reset',async({page})=>{
 await holdRead(page);const fixture=await start(page);await page.getByRole('button',{name:'Your photo: Upload Image'}).click();const picked=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose from Gallery',exact:true}).click();const native=await picked;await native.setFiles(isolatedImageFile('held.png'));
 await expect(page.getByRole('status')).toContainText('Preparing a private preview');expect(await native.element().evaluate(n=>n.isConnected&&n.files.length===1&&Boolean(n.value))).toBe(true);expect(await page.evaluate(()=>window.__readCount)).toBe(1);
 await page.evaluate(()=>window.__releaseRead());await expect(page.getByAltText('Selected your photo 1')).toBeVisible();expect(await native.element().evaluate(n=>n.files.length)).toBe(0);
 expect(await page.evaluate(()=>window.__owned.every(f=>f!==window.__native&&f instanceof File))).toBe(true);expect(fixture.uploads).toHaveLength(0);expect(await page.evaluate(()=>window.__revoked.length)).toBeGreaterThan(0);
});
test('an Android provider arrayBuffer failure falls back to FileReader before releasing the input',async({page})=>{
 await page.addInitScript(()=>{Blob.prototype.arrayBuffer=async()=>{throw new DOMException('Provider refused read','NotReadableError');};});const fixture=await start(page);await chooseImageFiles(page,page,'Your photo',isolatedImageFile('fallback.png'));await expect(page.getByAltText('Selected your photo 1')).toBeVisible();expect(fixture.uploads).toHaveLength(0);
});
test('failed reads keep the previous preview and support same-name retry',async({page})=>{
 const fixture=await start(page);await chooseImageFiles(page,page,'Your photo',isolatedImageFile('keep.png'));
 await page.evaluate(()=>{window.__arrayBuffer=Blob.prototype.arrayBuffer;window.__reader=FileReader.prototype.readAsArrayBuffer;Blob.prototype.arrayBuffer=async()=>{throw Error('read failure');};FileReader.prototype.readAsArrayBuffer=function(){queueMicrotask(()=>this.onerror());};});
 await chooseImageFiles(page,page,'Replace keep.png',isolatedImageFile('retry.png'));await expect(page.getByRole('alert')).toContainText('could not be read');await expect(page.getByRole('button',{name:'Remove keep.png',exact:true})).toBeVisible();
 await page.evaluate(()=>{Blob.prototype.arrayBuffer=window.__arrayBuffer;FileReader.prototype.readAsArrayBuffer=window.__reader;});await chooseImageFiles(page,page,'Replace keep.png',isolatedImageFile('retry.png'));await expect(page.getByRole('button',{name:'Remove retry.png',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);expect(fixture.uploads).toHaveLength(0);
});
test('native picker cancellation cannot close the enclosing personalization dialog',async({page})=>{
 await start(page);const length=await page.evaluate(()=>history.length);await page.getByRole('button',{name:'Your photo: Upload Image'}).click();await page.locator('.commerce-field input[type=file]').first().dispatchEvent('cancel');await expect(page.getByRole('dialog',{name:'Choose image source'})).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Customize This',exact:true})).toBeVisible();expect(await page.evaluate(()=>history.length)).toBe(length);
});
test('session changes during preparation discard the previous owner selection',async({page})=>{
 await holdRead(page);const fixture=await start(page);await page.getByRole('button',{name:'Your photo: Upload Image'}).click();const picked=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose from Gallery',exact:true}).click();await(await picked).setFiles(isolatedImageFile('held.png'));await expect(page.getByRole('status')).toBeVisible();
 await page.evaluate(async()=>{const api=await import('/src/services/api.js');api.setAuthLifecycle({generation:()=>987,unauthorized:()=>{}});window.__releaseRead();});await expect(page.getByRole('dialog',{name:'Choose image source'})).toHaveCount(0);await expect(page.getByAltText('Selected your photo 1')).toHaveCount(0);expect(fixture.uploads).toHaveLength(0);
});
test('cancelling during preparation never delivers a late image',async({page})=>{
 await holdRead(page);await start(page);await page.getByRole('button',{name:'Your photo: Upload Image'}).click();const picked=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose from Gallery',exact:true}).click();await(await picked).setFiles(isolatedImageFile('held.png'));await expect(page.getByRole('status')).toBeVisible();await page.getByRole('dialog',{name:'Choose image source'}).getByRole('button',{name:'Cancel',exact:true}).click();await page.evaluate(()=>window.__releaseRead());await expect(page.getByAltText('Selected your photo 1')).toHaveCount(0);await expect(page.getByRole('button',{name:'Your photo: Upload Image'})).toBeEnabled();
});
for(const width of [320,390,440,768,1024,1440])test(`upload chooser and decoded previews at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await start(page);await page.getByRole('button',{name:'Your photo: Upload Image'}).click();const chooser=page.getByRole('dialog',{name:'Choose image source'});await chooser.screenshot({path:info.outputPath(`${width}-chooser.png`)});expect(await chooser.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);await page.keyboard.press('Escape');await chooseImageFiles(page,page,'Your photo',[isolatedImageFile('one.png'),isolatedImageFile('two.png')]);await expect(page.getByAltText('Selected your photo 2')).toBeVisible();await page.getByRole('dialog',{name:'Customize This',exact:true}).screenshot({path:info.outputPath(`${width}-upload-previews.png`)});
});
