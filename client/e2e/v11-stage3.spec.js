import { test, expect } from '@playwright/test';
import { cartWithProduct, commerceProduct, mockCommerce } from './commerce-fixtures.js';
import { chooseOption } from './select-option.js';

test('merchant-only delivery settings require explicit activation and retain server revision fence', async ({ page }) => {
  const fixture=await mockCommerce(page, { role:'admin' });
  await page.goto('/admin/shipping');
  await expect(page.getByRole('heading',{name:'Delivery rates'})).toBeVisible();
  const save=page.getByRole('button',{name:'Save delivery rates'});
  await page.getByLabel(/Cairo & Giza/).fill('95');
  await page.getByLabel(/Other governorates/).fill('125');
  await page.getByRole('checkbox',{name:/Activate these rates/}).check();
  await expect(save).toBeDisabled();
  await page.getByRole('checkbox',{name:/I approve the entered rates/}).check();
  await save.click();
  await expect(page.getByText(/Delivery settings saved/)).toBeVisible();
  const writes=fixture.calls.filter(call=>call.path==='/admin/commerce/shipping'&&call.method==='PATCH');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({expectedRevision:1,cairoGizaPiastres:9500,otherGovernoratesPiastres:12500,approved:true,confirmActivate:true});
  expect(fixture.state.shipping.revision).toBe(2);
  expect(fixture.state.order.totals.totalPiastres).toBe(34000);
  await page.setViewportSize({width:390,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('checkout quote refreshes with governorate and never double-counts approved delivery',async({page})=>{
  const fixture=await mockCommerce(page,{checkoutEnabled:true,cart:cartWithProduct(commerceProduct),shipping:{approved:true,cairoGizaPiastres:9000,otherGovernoratesPiastres:12000}});
  await page.goto('/checkout');
  await chooseOption(page.getByRole('combobox',{name:/^Governorate/}),'cairo');
  await expect(page.locator('.commerce-summary .commerce-total')).toContainText('340.00');
  await expect(page.locator('.commerce-summary')).toContainText('90.00');
  await chooseOption(page.getByRole('combobox',{name:/^Governorate/}),'alexandria');
  await expect(page.locator('.commerce-summary .commerce-total')).toContainText('370.00');
  await expect(page.locator('.commerce-summary')).toContainText('120.00');
  const quoted=fixture.calls.filter(call=>call.path==='/commerce/checkout/quote');
  expect(quoted.some(call=>call.body.governorate==='cairo')).toBe(true);
  expect(quoted.some(call=>call.body.governorate==='alexandria')).toBe(true);
});
