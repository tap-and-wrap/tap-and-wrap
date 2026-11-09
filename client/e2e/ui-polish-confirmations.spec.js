import { test, expect } from '@playwright/test';
import { mockCommerce,cartWithProduct,commerceOrder } from './commerce-fixtures.js';
import { chooseOption } from './select-option.js';

test('cart removal centers, cancels without mutation and confirms one owned item',async({page},info)=>{
  const fixture=await mockCommerce(page,{cart:cartWithProduct()});await page.setViewportSize({width:320,height:740});await page.goto('/cart');
  const opener=page.locator('.cart-v2-trash');await opener.click();const dialog=page.locator('.cart-remove-dialog');await expect(dialog).toBeVisible();
  const rect=await dialog.boundingBox();expect(Math.abs(rect.x+rect.width/2-160)).toBeLessThan(2);expect(Math.abs(rect.y+rect.height/2-370)).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('cart-confirmation.png')});
  await dialog.getByRole('button',{name:'Keep item'}).click();await expect(opener).toBeFocused();expect(fixture.calls.filter(r=>r.method==='DELETE')).toHaveLength(0);
  await opener.click();await dialog.getByRole('button',{name:'Remove item',exact:true}).click();await expect(page.getByText('Your cart is empty.',{exact:true})).toBeVisible();expect(fixture.calls.filter(r=>r.method==='DELETE')).toHaveLength(1);
});

test('order operation review is centered without changing its approval or mutation gates',async({page},info)=>{
  const order={...commerceOrder,accountingVersion:1,accounting:{charges:[],settlements:[],merchandisePiastres:25000,agreedTotalPiastres:25000,collectedPiastres:0,refundedPiastres:0,outstandingPiastres:25000,overpaymentPiastres:0,unresolvedCharges:0}};
  const fixture=await mockCommerce(page,{role:'admin',order});await page.setViewportSize({width:390,height:844});await page.goto('/admin/orders/'+order.id);
  await chooseOption(page.getByRole('combobox',{name:'Operation',exact:true}),'cancel');
  await page.getByLabel('Private reconciliation / WhatsApp acceptance evidence').fill('Isolated confirmation UI check');
  await page.getByLabel('I confirmed the actual account transaction, customer WhatsApp acceptance or returned-stock inspection applicable to this operation').check();
  await page.getByRole('button',{name:'Record operation',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Review order operation'});await expect(dialog).toBeVisible();const rect=await dialog.boundingBox();expect(Math.abs(rect.x+rect.width/2-195)).toBeLessThan(2);expect(Math.abs(rect.y+rect.height/2-422)).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('order-confirmation.png')});await dialog.getByRole('button',{name:'Keep editing'}).click();await expect(dialog).toHaveCount(0);
  expect(fixture.calls.filter(r=>r.method==='POST'&&r.path.endsWith('/accounting'))).toHaveLength(0);
});
