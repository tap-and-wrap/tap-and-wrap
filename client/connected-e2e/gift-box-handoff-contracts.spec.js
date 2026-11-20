import { test, expect } from '@playwright/test';
import { confirmedCartAddAndOpen } from './background-cart-assertions.js';
const api = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_API_PORT}/api/v1`;
test.skip(process.env.TAP_WRAP_CONTRACT_GIFT_SHOPPING !== 'true', 'Requires the explicit disposable shopping fixture.');
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(url.hostname) || ['blob:','data:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const errors=[]; page.on('pageerror',error=>errors.push(error.message)); page.on('close',()=>expect(errors).toEqual([]));
});
async function add(page) { await confirmedCartAddAndOpen(page, () => page.getByRole('button',{name:'Add Your Gift to Cart',exact:true}).click()); }
async function cart(context) { const response=await context.request.get(`${api}/commerce/cart`); expect(response.status()).toBe(200); return (await response.json()).data.cart; }

test('gift-card checkbox independently selects a paid blank card or exact message through the real API', async ({page,context}) => {
  await page.goto('/customize/gift-box');
  await page.getByRole('button',{name:'Choose Synthetic box-2',exact:true}).click();
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
  const checkbox=page.getByRole('checkbox',{name:'Add a Gift Card'});
  const total=page.locator('.gb-live-total strong');
  await expect(total).not.toContainText('Calculating');
  const base=await total.textContent();
  await checkbox.check();
  const message=page.getByLabel('Message (optional)',{exact:true});
  await message.fill('\u200b \u200d'); await expect(total).not.toHaveText(base);
  await message.fill('\u0647\u064e\u062f\u0650\u064a\u064e\u0651\u0629 \u0644\u064e\u0643\u0650'); await expect(total).not.toHaveText(base);
  await message.fill(''); await expect(total).not.toHaveText(base);
  await checkbox.uncheck(); await expect(total).toHaveText(base);
  await checkbox.check();
  await page.getByRole('button',{name:'Next: Review'}).click(); await add(page);
  const first=(await cart(context)).items.at(-1);
  expect(first.giftBox.giftCard).toMatchObject({selected:true,message:''});
  await page.goto('/customize/gift-box');
  await page.getByRole('button',{name:'Choose Synthetic box-3',exact:true}).click();
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
  await page.getByRole('checkbox',{name:'Add a Gift Card'}).check();
  await page.getByLabel('Message (optional)',{exact:true}).fill('\u0647\u064e\u062f\u0650\u064a\u064e\u0651\u0629 \u0644\u064e\u0643\u0650');
  await page.getByRole('button',{name:'Next: Review'}).click(); await add(page);
  const second=(await cart(context)).items.at(-1);
  expect(second.giftBox.giftCard).toMatchObject({selected:true,message:'\u0647\u064e\u062f\u0650\u064a\u064e\u0651\u0629 \u0644\u064e\u0643\u0650'});
  expect(second.valid).toBe(true);
});
