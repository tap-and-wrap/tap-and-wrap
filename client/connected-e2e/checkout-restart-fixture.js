import {test,expect,api,post,headers} from './visual-engraving-fixture.js';
export async function restartScenario({page,context},signedIn){
 test.setTimeout(90000);
 if(signedIn){await page.goto('/login');await page.getByLabel('Email Address').fill('alice@connected.example.test');await page.getByLabel('Password',{exact:true}).fill('isolated-fixture-password');await page.getByRole('button',{name:'Log In',exact:true}).click();await expect(page).not.toHaveURL(/login/);}
 const product=async slug=>(await(await context.request.get(`${api}/public/products/${slug}`)).json()).data.product;
 await context.request.delete(`${api}/commerce/cart`,{headers:await headers(context)});
 const first=await product('restart-28000');expect((await post(context,'/commerce/cart/items',{productId:first._id,quantity:1})).ok()).toBe(true);
 let oldKey,newKey,oldReference,cancels=0;const keys=[];
 page.on('request',r=>{if(r.url().endsWith('/checkout/quote'))keys.push(r.postDataJSON().checkoutKey);});
 await page.goto('/checkout');await page.getByRole('radio',{name:/InstaPay/}).check();await expect(page.getByRole('button',{name:'Copy transfer destination'})).toBeVisible();oldKey=keys.at(-1);
 let old=(await(await context.request.get(`${api}/commerce/checkout/payments/${oldKey}`)).json()).data;oldReference=old.payment.reference;expect(old.payment.amountPiastres).toBe(28000);
 await context.request.delete(`${api}/commerce/cart`,{headers:await headers(context)});const second=await product('restart-241000');await post(context,'/commerce/cart/items',{productId:second._id,quantity:1});
 await post(context,'/commerce/checkout/quote',{checkoutKey:oldKey,paymentMethod:'cod'});
 await page.route('**/checkout/quote',async route=>{const input=route.request().postDataJSON();if(input.checkoutKey===oldKey&&input.paymentMethod==='cod'){const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,3000));return route.fulfill({response});}return route.continue();});
 await page.reload();await expect(page.getByRole('radio',{name:'Cash on Delivery',exact:true})).toBeChecked();
 await page.getByRole('radio',{name:/InstaPay/}).check();await expect(page.getByRole('button',{name:'Start fresh checkout'})).toBeVisible();
 await expect(page.getByLabel('Transfer sender name *')).toHaveCount(0);await page.getByLabel(/^Full name/).fill('Preserved customer');
 await page.waitForTimeout(150);expect(new Set(keys).size).toBe(1);
 await page.getByRole('button',{name:'Start fresh checkout'}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(new Set(keys).size).toBe(1);
 await page.route('**/checkout/payments/*/cancel',async route=>{cancels++;expect(route.request().postDataJSON()).toEqual({noTransferConfirmed:true});if(cancels===1)return route.abort('failed');return route.continue();});
 await page.getByRole('button',{name:'Start fresh checkout'}).click();await dialog.getByRole('button',{name:"No, I haven't transferred",exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();expect(new Set(keys).size).toBe(1);
 await dialog.getByRole('button',{name:"No, I haven't transferred",exact:true}).click();await expect(page.getByRole('button',{name:'Copy transfer destination'})).toBeVisible();newKey=keys.at(-1);expect(newKey).not.toBe(oldKey);
 await expect(page.getByLabel(/^Full name/)).toHaveValue('Preserved customer');await expect(page.getByRole('radio',{name:/InstaPay/})).toBeChecked();
 old=(await(await context.request.get(`${api}/commerce/checkout/payments/${oldKey}`)).json()).data;expect(old.payment.reference).toBe(oldReference);expect(old.canCancel).toBe(true);
 const fresh=(await(await context.request.get(`${api}/commerce/checkout/payments/${newKey}`)).json()).data;expect(fresh.payment.amountPiastres).toBe(241000);expect(fresh.payment.reference).not.toBe(oldReference);
 expect((await post(context,`/commerce/checkout/payments/${oldKey}/cancel`,{noTransferConfirmed:true})).ok()).toBe(true);
 await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeDisabled();await page.reload();await expect(page.getByRole('button',{name:'Copy transfer destination'})).toBeVisible();expect(keys.at(-1)).toBe(newKey);
}
