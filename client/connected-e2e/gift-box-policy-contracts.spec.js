import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_API_PORT || 4092);
const web = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192);
const path = '/admin/gift-box/fulfillment-policies';
const endpoint = `${api}/api/v1${path}`;
const evidence = 'Synthetic connected packing trial <strong>literal evidence</strong>; closure and transport were reviewed only in this disposable fixture.';

async function restrictNetwork(context) {
  await context.route('**/*', route => {
    const address = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(address.hostname) || ['data:', 'blob:'].includes(address.protocol) ? route.continue() : route.abort();
  });
}
test.beforeEach(async ({ context }) => restrictNetwork(context));
async function login(page, name = 'admin', destination = path) {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email Address').fill(`${name}@connected.example.test`);
  await page.getByLabel('Password', { exact: true }).fill('isolated-fixture-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  if (name === 'admin') await expect(page).toHaveURL(destination);
}
async function csrf(context) {
  const response = await context.request.get(`${api}/api/v1/auth/csrf`);
  expect(response.ok()).toBeTruthy(); return { Origin: web, 'x-csrf-token': (await response.json()).data.csrfToken };
}
async function state(context, boxId) {
  const response = await context.request.get(`${endpoint}/${boxId}`); expect(response.status()).toBe(200);
  return (await response.json()).data.policy;
}
function rules() {
  return { regions: [{ regionId: 'connected-inside', zone: 'inside', compartmentId: null }], compartments: [],
    componentRules: [{ componentId: 'rose-red', maxQuantity: 1, allowedRegionIds: ['connected-inside'], oversizedPlush: false, allowOversizedInside: false },
      { componentId: 'ribbon-navy', maxQuantity: 1, allowedRegionIds: [], oversizedPlush: false, allowOversizedInside: false }],
    limits: { maxUnits: 1, maxByCategory: { flower: 1, plush: 0, chocolate: 0 },
      mixedContentLimits: [['flower', 'plush'], ['flower', 'chocolate'], ['plush', 'chocolate'], ['flower', 'plush', 'chocolate']]
        .map(categories => ({ categories, maxUnits: 0 })) } };
}
function packing(transportNotes = 'Synthetic connected packing and transport restrictions only.') {
  return { lidMode: 'must_close', clearanceNotes: 'Synthetic connected lid and clearance restrictions only.', transportNotes, plushHandlingNotes: '', compartmentNotes: '' };
}
async function save(context, boxId, expectedRevision, transportNotes) {
  const response = await context.request.put(`${endpoint}/${boxId}/draft`, { headers: await csrf(context), data: { expectedRevision, rules: rules(), packing: packing(transportNotes) } });
  expect(response.status()).toBe(200); return (await response.json()).data.policy;
}
async function fillDraft(page, context, boxId) {
  await page.getByRole('combobox', { name: 'Box', exact: true }).selectOption(boxId);
  const catalog = (await (await context.request.get(endpoint)).json()).data.components;
  const rose = catalog.find(component => component.componentId === 'rose-red').displayName;
  await page.getByRole('button', { name: 'Add placement region', exact: true }).click();
  await page.getByLabel('Region ID 1', { exact: true }).fill('connected-inside');
  for (const [category, componentId] of [['flower', 'rose-red'], ['ribbon', 'ribbon-navy']]) {
    await page.getByRole('combobox', { name: 'Component category', exact: true }).selectOption(category);
    await page.getByRole('combobox', { name: 'Compatible component', exact: true }).selectOption(componentId);
    await page.getByRole('button', { name: 'Add compatible component', exact: true }).click();
    if (category === 'flower') {
      await page.getByLabel(`Maximum quantity: ${rose}`, { exact: true }).fill('1');
      await page.getByLabel(`Allow connected-inside (inside) for ${rose}`, { exact: true }).check();
    }
  }
  for (const [label, value] of [['Overall maximum units', '1'], ['Maximum flower units', '1'], ['Maximum plush units', '0'], ['Maximum chocolate units', '0'],
    ['Mixed flowers + plush limit', '0'], ['Mixed flowers + chocolates limit', '0'], ['Mixed plush + chocolates limit', '0'], ['Mixed flowers + plush + chocolates limit', '0']]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole('combobox', { name: 'Lid requirement', exact: true }).selectOption('must_close');
  await page.getByRole('textbox', { name: /^Lid and clearance instructions/ }).fill(packing().clearanceNotes);
  await page.getByRole('textbox', { name: /^Safe packing and transport instructions/ }).fill(packing().transportNotes);
}

test('real owner form saves, explicitly approves and withdraws a version while public purchasing remains closed', async ({ page, context }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page); await expect(page.getByRole('heading', { name: 'Gift Box Packing Policies', exact: true })).toBeVisible();
  const before = await state(context, 'box-3'); expect(before.activePublication).toBeNull(); expect(before.revision).toBe(0);
  await fillDraft(page, context, 'box-3');
  await expect(page.getByRole('button', { name: 'Approve saved policy', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText('Policy draft saved. It has not been approved.', { exact: true })).toBeVisible();
  const saved = await state(context, 'box-3'); expect(saved.revision).toBe(1); expect(saved.activePublication).toBeNull();
  await page.getByRole('textbox', { name: /^Packing trial evidence/ }).fill(evidence);
  await page.getByLabel('I performed real-world packing and fit checks', { exact: true }).check();
  await page.getByLabel('I checked safe packing and transport', { exact: true }).check();
  await page.getByLabel('I checked lid and clearance requirements', { exact: true }).check();
  await page.getByRole('button', { name: 'Approve saved policy', exact: true }).click();
  await expect(page.getByText('Reviewed policy version published. Public gift purchasing remains disabled.', { exact: true })).toBeVisible();
  const approved = await state(context, 'box-3'); expect(approved.activePublication.version).toBe(1);
  expect(approved.activePublication.policy.boxId).toBe('box-3'); expect(approved.activePublication.policy.policyVersion).toBe('v1');
  expect(approved.activePublication.policyHash).toMatch(/^[a-f0-9]{64}$/);
  await page.getByText('Version 1 · Approved', { exact: true }).click();
  const history = page.locator('.gb-policy-history');
  await expect(history.getByText(evidence, { exact: true })).toBeVisible(); await expect(history.locator('strong')).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: info.outputPath(`connected-packing-policy-${width}.png`), fullPage: true });
  }
  const reason = 'Synthetic connected packing evidence withdrawn; no merchant policy was created.';
  await page.getByLabel('Withdrawal reason', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Withdraw active policy', exact: true }).click();
  await expect(page.getByText('Active policy withdrawn. New gift commerce eligibility is blocked.', { exact: true })).toBeVisible();
  const withdrawn = await state(context, 'box-3'); expect(withdrawn.activePublication).toBeNull();
  expect(withdrawn.history[0].status).toBe('withdrawn'); expect(withdrawn.history[0].policy).toEqual(approved.activePublication.policy);
  const checkout = await context.request.get(`${api}/api/v1/commerce/checkout/config`); expect((await checkout.json()).data.enabled).toBe(false);
  const denied = await context.request.post(`${api}/api/v1/commerce/checkout/quote`, { headers: await csrf(context), data: { checkoutKey: crypto.randomUUID(), paymentMethod: 'instapay', governorate: 'cairo' } });
  expect(denied.status()).toBe(403); expect((await denied.json()).error.code).toBe('CHECKOUT_DISABLED');
  expect(errors).toEqual([]);
});

test('real concurrent policy edit retains the owner draft until deliberate conflict reload', async ({ page, context }) => {
  await login(page); await save(context, 'box-4', 0);
  await page.getByRole('combobox', { name: 'Box', exact: true }).selectOption('box-4');
  const transport = page.getByRole('textbox', { name: /^Safe packing and transport instructions/ });
  await expect(transport).toHaveValue(packing().transportNotes);
  const localDraft = 'Owner local transport draft that must survive a conflict.';
  await transport.fill(localDraft);
  const concurrent = 'Other administrator reviewed a different transport restriction.';
  await save(context, 'box-4', 1, concurrent);
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText(/Another editor changed this record/)).toBeVisible(); await expect(transport).toHaveValue(localDraft);
  expect((await state(context, 'box-4')).draft.packing.transportNotes).toBe(concurrent);
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my draft', exact: true }).click(); await expect(transport).toHaveValue(localDraft);
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(transport).toHaveValue(concurrent);
  expect((await state(context, 'box-4')).activePublication).toBeNull();
});

test('real policy administration does not expose evidence to guests or customers and rejects Origin/CSRF bypasses', async ({ page, context, browser }) => {
  await login(page); const saved = await save(context, 'box-5', 0);
  const headers = await csrf(context);
  for (const unsafe of [{ ...headers, 'x-csrf-token': '' }, { ...headers, Origin: 'https://untrusted.example' }]) {
    const response = await context.request.post(`${endpoint}/box-5/approve`, { headers: unsafe, data: { expectedRevision: saved.revision, evidence,
      confirmPackingTested: true, confirmSafeTransport: true, confirmLidChecked: true } });
    expect(response.status()).toBe(403);
  }
  const guest = await browser.newContext();
  await restrictNetwork(guest);
  expect((await guest.request.get(endpoint)).status()).toBe(401); await guest.close();
  const customerContext = await browser.newContext(), customerPage = await customerContext.newPage();
  await restrictNetwork(customerContext);
  await login(customerPage, 'bob', '/my-orders');
  await expect(customerPage).toHaveURL('/my-orders');
  const denied = await customerContext.request.get(`${endpoint}/box-5`);
  expect(denied.status()).toBe(403); expect(await denied.text()).not.toContain(evidence);
  await customerContext.close();
  expect((await state(context, 'box-5')).activePublication).toBeNull();
});
