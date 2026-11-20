import { test, expect } from '@playwright/test';
import { ownerFixture } from './owner-dashboard-fixtures.js';
import { renderEmailTemplate } from '../../server/src/email/templates.js';

test('legacy contact queue bookmarks redirect into standard orders without follow-up controls', async ({ page }) => {
  const fixture = await ownerFixture(page); await page.goto('/admin/attention');
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(page.getByRole('heading',{name:'Orders',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Requires action'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Mark as Contacted|Open WhatsApp manually/})).toHaveCount(0);
  await page.goto('/admin/orders/attention');
  await expect(page).toHaveURL(/\/admin\/orders$/);
  expect(fixture.ownerCalls.filter(url => /\/attention|\/notifications/.test(url.pathname))).toHaveLength(0);
});

test('order receipt email stays readable on mobile without tracking or private files', async ({ page }) => {
  const email = renderEmailTemplate({ event:'order_received', audience:'customer', snapshot:{ orderNumber:'123456', reference:'123456', phone:'+201012345678', accountingVersion:1, totalPiastres:45000, paymentMethod:'instapay', paymentState:'awaiting_transfer', shippingState:'pending', items:[{name:'Synthetic thoughtful gift',quantity:1}], financial:{collectedPiastres:0,refundedPiastres:0,outstandingPiastres:45000},charges:[] } }, {clientOrigin:'https://shop.example.test'});
  await page.setViewportSize({width:320,height:900}); await page.setContent(email.html);
  await expect(page.getByRole('img',{name:'Tap & Wrap',exact:true})).toHaveAttribute('src','https://shop.example.test/tap-wrap-email-logo.png');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
