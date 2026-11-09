import { test, expect } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';
import { ownerFixture } from './owner-dashboard-fixtures.js';

const cors = {'access-control-allow-origin':'http://127.0.0.1:5191','access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,OPTIONS'};
for (const role of ['customer','admin']) for (const width of [320,390,768,1024,1440]) test(`${role} confirms sign out only inside account management at ${width}px`,async({page},info)=>{
  const fixture = role==='admin' ? await ownerFixture(page) : await mockCommerce(page,{role});
  await page.setViewportSize({width,height:900});await page.goto(role==='admin'?'/admin':'/my-orders');
  await expect(page.locator('header').getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0);
  const opener=page.locator('.account-signout');await opener.click();
  const dialog=page.getByRole('dialog',{name:'Sign out of Tap & Wrap?'});
  await expect(dialog.getByRole('button',{name:'Stay signed in'})).toBeFocused();
  expect(fixture.calls.filter(call=>call.path==='/auth/logout')).toHaveLength(0);
  const box=await dialog.boundingBox();expect(Math.abs(box.x+box.width/2-width/2)).toBeLessThan(2);expect(Math.abs(box.y+box.height/2-450)).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('signout-confirmation.png')});
  await dialog.getByRole('button',{name:'Stay signed in'}).click();await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
  expect(fixture.calls.filter(call=>call.path==='/auth/logout')).toHaveLength(0);
  await opener.click();await page.keyboard.press('Escape');await expect(opener).toBeFocused();
  await opener.click();await dialog.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);expect(fixture.calls.filter(call=>call.path==='/auth/logout')).toHaveLength(1);
  expect(await page.evaluate(async()=>{const {sessionSnapshot}=await import('/src/auth/session.js');return sessionSnapshot().user;})).toBe(null);
  await expect(page.locator('.account-signout')).toHaveCount(0);
});

test('failed logout keeps the verified account and confirmation; pending requests cannot repeat',async({page})=>{
  const fixture=await mockCommerce(page,{role:'customer'});let calls=0,release;
  await page.route('**/api/v1/auth/logout',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    calls++;await new Promise(resolve=>{release=resolve;});
    return route.fulfill({status:503,headers:cors,json:{ok:false,error:{message:'Isolated logout failure'}}});
  });
  await page.goto('/my-orders');await page.locator('.account-signout').click();
  const dialog=page.getByRole('dialog',{name:'Sign out of Tap & Wrap?'});
  await dialog.getByRole('button',{name:'Sign out',exact:true}).click();await expect.poll(()=>calls).toBe(1);
  await expect(dialog.getByRole('button',{name:'Please wait...'})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  release();await expect(dialog.getByRole('alert')).toContainText('Your account is still signed in');
  expect(fixture.state.user.role).toBe('customer');expect(calls).toBe(1);
  await dialog.getByRole('button',{name:'Stay signed in'}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.account-signout')).toBeVisible();
});

test('admin destructive draft replacement uses the same centered confirmation',async({page},info)=>{
  await ownerFixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/admin/engraving');
  const edits=page.getByRole('button',{name:/^Edit /});await edits.first().click();const create=page.getByRole('button',{name:'Create engraving type',exact:true});await create.click();
  const dialog=page.getByRole('dialog',{name:'Discard the open editor draft?'});await expect(dialog).toBeVisible();
  const box=await dialog.boundingBox();expect(Math.abs(box.x+box.width/2-195)).toBeLessThan(2);expect(Math.abs(box.y+box.height/2-422)).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('admin-draft-confirmation.png')});
  await dialog.getByRole('button',{name:'Keep editing'}).click();await expect(create).toBeFocused();
  await create.click();await dialog.getByRole('button',{name:'Create new draft'}).click();await expect(dialog).toHaveCount(0);
});

test('long confirmation content scrolls inside a resized landscape viewport',async({page})=>{
  await mockCommerce(page,{role:'customer'});await page.goto('/my-orders');await page.locator('.account-signout').click();
  const dialog=page.getByRole('dialog',{name:'Sign out of Tap & Wrap?'});
  await dialog.evaluate(node=>{document.getElementById(node.getAttribute('aria-describedby')).textContent='Long isolated confirmation content. '.repeat(160);});
  await page.setViewportSize({width:844,height:390});
  await expect.poll(()=>dialog.evaluate(n=>n.style.getPropertyValue('--confirmation-height'))).toBe('390px');
  const box=await dialog.boundingBox();expect(box.y).toBeGreaterThanOrEqual(15);expect(box.y+box.height).toBeLessThanOrEqual(375);
  expect(await dialog.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
  await dialog.getByRole('button',{name:'Stay signed in'}).focus();await expect(dialog.getByRole('button',{name:'Stay signed in'})).toBeInViewport();
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

test('a sign-out confirmation cannot carry over to another verified account',async({page})=>{
  const fixture=await mockCommerce(page,{role:'customer'});await page.goto('/my-orders');await page.locator('.account-signout').click();
  fixture.state.user={...fixture.state.user,id:'different-fixture-owner',name:'Another isolated owner'};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog',{name:'Sign out of Tap & Wrap?'})).toHaveCount(0);
  expect(fixture.calls.filter(call=>call.path==='/auth/logout')).toHaveLength(0);
});

test('an uncertain sign-out response offers read-only verification before another explicit attempt',async({page})=>{
  await mockCommerce(page,{role:'customer'});let uncertain=false,logoutCalls=0;
  await page.route('**/api/v1/auth/me',route=>uncertain?route.fulfill({status:503,headers:cors,json:{ok:false,error:{message:'Isolated verification outage'}}}):route.fallback());
  await page.route('**/api/v1/auth/logout',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    logoutCalls++;uncertain=true;return route.abort('failed');
  });
  await page.goto('/my-orders');await page.locator('.account-signout').click();const dialog=page.getByRole('dialog',{name:'Sign out of Tap & Wrap?'});
  await dialog.getByRole('button',{name:'Sign out',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('could not confirm whether you signed out');
  expect(logoutCalls).toBe(1);uncertain=false;await dialog.getByRole('button',{name:'Check account status'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Your account is still signed in');await expect(dialog.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();expect(logoutCalls).toBe(1);
  await dialog.getByRole('button',{name:'Stay signed in'}).click();await expect(dialog).toHaveCount(0);
});
