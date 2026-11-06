import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

const token = 'r'.repeat(43), password = 'IsolatedSecurePassword42';
const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
async function storageIsPrivate(page) {
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  for (const secret of [token, password, 'private gift draft', 'private engraving draft', 'private-photo.png']) expect(stored).not.toContain(secret);
}
async function spa(page, url) {
  await page.evaluate(value => { history.pushState({ key: crypto.randomUUID() }, '', value); dispatchEvent(new PopStateEvent('popstate')); }, url);
}
async function fixture(page, respond) {
  await mockCatalog(page);
  const calls = [];
  await page.route('**/api/v1/auth/reset-password', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push(route.request().postDataJSON());
    await respond(route);
  });
  return calls;
}
async function submit(page) {
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await page.getByLabel('New password').fill(password);
  await storageIsPrivate(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
}

test('reset rotates generation, clears both actual draft providers and private cache, and retains only one public result', async ({ page, context, browser }) => {
  const calls = await fixture(page, route => route.fulfill({ headers, json: { ok: true, data: { passwordReset: true, signInRequired: true } } }));
  // A synthetic route reads the real providers; no production test hooks or stores.
  await page.route('**/src/pages/TrackOrderPage.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    const queryResource=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname.endsWith('/deps/@tanstack_react-query.js'));
    const {useQueryClient}=await import(queryResource.name);
    import {useGiftBoxDraft} from '/src/gift-box/GiftBoxDraftProvider.jsx';
    import {useEngravingDraft} from '/src/engraving/EngravingDraftProvider.jsx';
    import {sessionSnapshot,sessionOwner} from '/src/auth/session.js';
    export default function Probe(){
      const gift=useGiftBoxDraft(),engraving=useEngravingDraft(),cache=useQueryClient();
      const data={giftText:gift.personal.sticker.text,photos:gift.personal.photos.length,giftCache:gift.uploadCache.current.size,
        engravingText:engraving.draft.text,files:Object.keys(engraving.draft.files).length,engravingCache:engraving.cache.current.size,
        stalePrivate:cache.getQueryCache().getAll().some(query=>query.queryKey.includes('recovery-private-fixture')),generation:sessionSnapshot().generation};
      return React.createElement('main',null,React.createElement('h1',null,'Recovery draft fixture'),React.createElement('output',{'aria-label':'Actual provider state'},JSON.stringify(data)),
        React.createElement('button',{onClick:()=>{
          const file=new File([new Uint8Array([1,2,3])],'private-photo.png',{type:'image/png'});
          gift.personal.updateSticker({text:'private gift draft',enabled:true});gift.personal.addPhotos([file]);gift.uploadCache.current.set('private',{});
          engraving.setDraft(value=>({...value,text:'private engraving draft',files:{item_photo:file}}));engraving.cache.current.set(file,{});
          cache.setQueryData(['private',sessionOwner(),'recovery-private-fixture'],{private:true});
        }},'Populate private drafts'));
    }
  ` }));
  await page.goto('/track-order');
  await page.getByRole('button', { name: 'Populate private drafts' }).click();
  const state = () => page.getByLabel('Actual provider state').textContent().then(JSON.parse);
  await expect.poll(async () => (await state()).engravingText).toBe('private engraving draft');
  const before = await state(); expect(before.photos).toBe(1); expect(before.giftText).toBe('private gift draft'); expect(before.stalePrivate).toBe(true);
  await spa(page, '/reset-password#token=' + token); await submit(page);
  await expect(page.getByRole('status').filter({ hasText: 'Your password has been reset. Sign in again to continue.' })).toBeVisible();
  expect(calls).toEqual([{ token, newPassword: password }]); await storageIsPrivate(page);
  const rotated = await page.evaluate(async () => (await import('/src/auth/session.js')).sessionSnapshot());
  expect(rotated.generation).toBeGreaterThan(before.generation); expect(rotated.phase).toBe('ready');
  const other = await context.newPage(); await mockCatalog(other); await other.goto('/reset-password');
  await expect(other.getByRole('alert')).toContainText('missing or invalid'); await other.close();
  const freshSession = await browser.newContext();
  try {
    const freshPage = await freshSession.newPage(); await mockCatalog(freshPage); await freshPage.goto('http://127.0.0.1:5191/reset-password');
    await expect(freshPage.getByRole('alert')).toContainText('missing or invalid');
  } finally { await freshSession.close(); }
  await spa(page, '/track-order');
  await expect.poll(async () => (await state()).files).toBe(0);
  const after = await state();
  expect(after).toMatchObject({ giftText: '', photos: 0, giftCache: 0, engravingText: '', files: 0, engravingCache: 0, stalePrivate: false });
  await spa(page, '/reset-password#token=' + 'n'.repeat(43));
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.getByText('Your password has been reset. Sign in again to continue.', { exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('alert')).toContainText('missing or invalid'); expect(calls).toHaveLength(1);
});

for (const failure of ['rejected', 'csrf', 'network', 'unconfirmed']) test(`reset ${failure} response cannot report success or replay`, async ({ page }) => {
  const calls = await fixture(page, route => failure === 'network' ? route.abort('failed') : route.fulfill({ headers,
    status: failure === 'csrf' ? 403 : failure === 'rejected' ? 400 : 200,
    json: ['rejected','csrf'].includes(failure) ? { ok: false, error: { code: failure === 'csrf' ? 'INVALID_CSRF' : 'INVALID_ACCOUNT_TOKEN', message: 'Invalid fixture request.' } } : { ok: true, data: { passwordReset: false } },
  }));
  await page.goto('/reset-password#token=' + token); await submit(page);
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await expect(page.getByText('Your password has been reset. Sign in again to continue.', { exact: true })).toHaveCount(0);
  await storageIsPrivate(page); expect(calls).toHaveLength(1);
  await page.reload(); await expect(page.getByRole('alert')).toContainText('missing or invalid'); expect(calls).toHaveLength(1);
});

test('a late completed reset cannot populate a different attempt after navigation', async ({ page }) => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const calls = await fixture(page, async route => { await wait; await route.fulfill({ headers, json: { ok: true, data: { passwordReset: true, signInRequired: true } } }); });
  await page.goto('/reset-password#token=' + token); await submit(page);
  await expect(page.getByRole('status')).toContainText('Processing your password reset');
  await spa(page, '/forgot-password'); await expect(page.getByLabel('Email address')).toBeVisible();
  await spa(page, '/reset-password#token=' + 'n'.repeat(43)); await expect(page.getByLabel('New password')).toBeVisible();
  release(); await expect.poll(async () => page.evaluate(async () => (await import('/src/auth/session.js')).sessionSnapshot().phase)).toBe('ready');
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.getByText('Your password has been reset. Sign in again to continue.', { exact: true })).toHaveCount(0);
  expect(calls).toHaveLength(1); await storageIsPrivate(page);
});
