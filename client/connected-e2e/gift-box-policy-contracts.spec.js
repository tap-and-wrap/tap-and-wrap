import { test, expect } from '@playwright/test';
const api = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_API_PORT || 4092);
const web = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192);
const endpoint = `${api}/api/v1/admin/gift-box/fulfillment-policies`;
async function restrictNetwork(context) { await context.route('**/*', route => { const url = new URL(route.request().url()); return ['127.0.0.1','localhost'].includes(url.hostname) || ['data:','blob:'].includes(url.protocol) ? route.continue() : route.abort(); }); }
test.beforeEach(async ({ context }) => restrictNetwork(context));
async function login(page, name = 'admin') {
  await page.goto('/login?returnTo=%2Fadmin%2Fgift-box');
  await page.getByLabel('Email Address').fill(`${name}@connected.example.test`);
  await page.getByLabel('Password', { exact: true }).fill('isolated-fixture-password');
  const response = page.waitForResponse(resp => resp.request().method() === 'POST' && new URL(resp.url()).pathname === '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  expect((await response).status()).toBe(200);
}
async function csrf(context) { const response = await context.request.get(`${api}/api/v1/auth/csrf`); expect(response.ok()).toBeTruthy(); return { Origin: web, 'x-csrf-token': (await response.json()).data.csrfToken }; }
test('old packing UI is retired while the standard Gift Box component editor remains', async ({ page, context }) => {
  await login(page); await expect(page).toHaveURL(/\/admin\/gift-box/);
  await expect(page.getByText('Safe packing & box availability', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Box appearance & arrangement settings', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Personalization' })).toBeVisible();
  const policy = await context.request.get(`${endpoint}/box-3`);
  expect(policy.status()).toBe(200);
  expect((await policy.json()).data.policy.boxId).toBe('box-3');
});
test('legacy policy writes remain protected against unsafe Origin and CSRF even after UI retirement', async ({ page, context, browser }) => {
  await login(page); const before = await context.request.get(`${endpoint}/box-5`); expect(before.status()).toBe(200);
  const revision = (await before.json()).data.policy.revision;
  const headers = await csrf(context);
  for (const unsafe of [{ ...headers, 'x-csrf-token': '' }, { ...headers, Origin: 'https://untrusted.example' }]) {
    const response = await context.request.post(`${endpoint}/box-5/approve`, { headers: unsafe, data: { expectedRevision: revision, evidence:'Unauthorised synthetic proof', confirmPackingTested:true, confirmSafeTransport:true, confirmLidChecked:true } });
    expect(response.status()).toBe(403);
  }
  const guest = await browser.newContext(); await restrictNetwork(guest); expect((await guest.request.get(endpoint)).status()).toBe(401); await guest.close();
  const customer = await browser.newContext(); await restrictNetwork(customer); const p = await customer.newPage(); await login(p,'bob');
  expect((await customer.request.get(`${endpoint}/box-5`)).status()).toBe(403); await customer.close();
  const after = await context.request.get(`${endpoint}/box-5`); expect((await after.json()).data.policy.revision).toBe(revision);
});
