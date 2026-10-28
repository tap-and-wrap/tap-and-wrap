import { expect, test } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';

const path = '/admin/gift-box/fulfillment-policies';
const categories = [['flower', 'plush'], ['flower', 'chocolate'], ['plush', 'chocolate'], ['flower', 'plush', 'chocolate']];
const components = [
  ...Array.from({ length: 12 }, (_, index) => ({ componentId: `box-${index + 1}`, displayName: `Fixture Box ${index + 1}`, category: 'box' })),
  { componentId: 'rose-red', displayName: 'Fixture Red Rose', category: 'flower' },
  { componentId: 'plush-1', displayName: 'Fixture Plush One', category: 'plush' },
  { componentId: 'chocolate-1', displayName: 'Fixture Chocolate One', category: 'chocolate' },
  { componentId: 'ribbon-navy', displayName: 'Fixture Navy Ribbon', category: 'ribbon' },
  { componentId: 'gift-card-1', displayName: 'Fixture Gift Card', category: 'gift_card' },
];
const syntheticRules = () => ({ regions: [{ regionId: 'fixture-inside', zone: 'inside', compartmentId: null }], compartments: [], componentRules: [
  { componentId: 'rose-red', maxQuantity: 2, allowedRegionIds: ['fixture-inside'], oversizedPlush: false, allowOversizedInside: false },
  { componentId: 'ribbon-navy', maxQuantity: 1, allowedRegionIds: [], oversizedPlush: false, allowOversizedInside: false },
], limits: { maxUnits: 2, maxByCategory: { flower: 2, plush: 0, chocolate: 0 }, mixedContentLimits: categories.map(set => ({ categories: set, maxUnits: 0 })) } });
const syntheticPacking = () => ({ lidMode: 'must_close', clearanceNotes: 'Synthetic fixture lid clearance was checked.', transportNotes: 'Synthetic fixture transport was checked safely.', plushHandlingNotes: '', compartmentNotes: '' });
function pending(boxId = 'box-1') { return { boxId, revision: 0, status: 'pending', draft: null, activePublication: null, history: [], historyPage: 1, historyTotal: 0, historyHasMore: false, audit: [] }; }
function publication(version = 1) {
  return { version, status: 'approved', policyHash: 'a'.repeat(64), contentHash: 'b'.repeat(64), packing: syntheticPacking(), evidence: 'Synthetic trial <img src=x onerror=alert(1)> is literal owner evidence.',
    approvedBy: '710000000000000000000050', approvedAt: '2026-10-28T08:00:00.000Z', withdrawnAt: null, withdrawalReason: null,
    policy: { policyId: 'gift-box-box-1', policyVersion: `owner-v${version}`, boxId: 'box-1', ...syntheticRules() } };
}
async function mockPolicies(page, options = {}) {
  await mockCommerce(page, { role: options.role === undefined ? 'admin' : options.role });
  const state = new Map(Array.from({ length: 12 }, (_, index) => { const entry = pending(`box-${index + 1}`); return [entry.boxId, entry]; }));
  if (options.initial) state.set(options.initial.boxId, structuredClone(options.initial));
  const calls = [];
  let conflict = options.conflictOnce;
  await page.route('**/api/v1/admin/gift-box/fulfillment-policies**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), suffix = url.pathname.replace(`/api/v1${path}`, ''), parts = suffix.split('/').filter(Boolean);
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,PUT,POST,OPTIONS' } });
    const body = ['PUT', 'POST'].includes(method) ? request.postDataJSON() : null;
    calls.push({ method, suffix, body, query: Object.fromEntries(url.searchParams) });
    const ok = data => route.fulfill({ json: { ok: true, data }, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' } });
    if (!parts.length) return ok({ policies: [...state.values()].map(record => ({ ...record, history: [], audit: [] })), components, publicCommerceEnabled: false });
    let record = state.get(parts[0]);
    if (method === 'GET') {
      if (url.searchParams.get('historyPage') === '2' && options.earlier) return ok({ policy: { ...record, history: [options.earlier], historyPage: 2, historyHasMore: false } });
      return ok({ policy: record });
    }
    if (conflict) { conflict = false; record.revision = 7; record.draft = { rules: syntheticRules(), packing: syntheticPacking() }; return route.fulfill({ status: 409, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: 'The saved policy changed; your draft is retained.' } }, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' } }); }
    if (parts[1] === 'draft') { record.draft = { rules: body.rules, packing: body.packing }; record.status = record.activePublication ? 'approved' : 'draft'; }
    if (parts[1] === 'approve') {
      const version = record.history.length + 1, published = publication(version);
      published.policy = { ...published.policy, boxId: record.boxId, ...record.draft.rules };
      published.packing = record.draft.packing; published.evidence = body.evidence;
      record.history = record.history.map(saved => ({ ...saved, status: 'superseded' })); record.history.unshift(published); record.activePublication = published; record.draft = null; record.status = 'approved';
    }
    if (parts[1] === 'withdraw') { record.history = record.history.map(saved => saved.version === record.activePublication.version ? { ...saved, status: 'withdrawn', withdrawnAt: '2026-10-28T09:00:00Z', withdrawalReason: body.reason } : saved); record.activePublication = null; record.status = 'withdrawn'; }
    record = { ...record, revision: record.revision + 1, historyTotal: record.history.length }; state.set(record.boxId, record);
    return ok({ policy: record });
  });
  return { state, calls };
}
async function addComponent(page, category, id) {
  await page.getByRole('combobox', { name: 'Component category', exact: true }).selectOption(category);
  await page.getByRole('combobox', { name: 'Compatible component', exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'Add compatible component', exact: true }).click();
}
async function fillRules(page) {
  await page.getByRole('button', { name: 'Add placement region', exact: true }).click();
  await page.getByRole('textbox', { name: 'Region ID 1', exact: true }).fill('fixture-inside');
  await addComponent(page, 'flower', 'rose-red');
  await page.getByRole('spinbutton', { name: 'Maximum quantity: Fixture Red Rose', exact: true }).fill('2');
  await page.getByRole('checkbox', { name: 'Allow fixture-inside (inside) for Fixture Red Rose', exact: true }).check();
  await addComponent(page, 'ribbon', 'ribbon-navy');
  for (const [name, value] of [['Overall maximum units', '2'], ['Maximum flower units', '2'], ['Maximum plush units', '0'], ['Maximum chocolate units', '0']]) await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  for (const name of ['flowers + plush', 'flowers + chocolates', 'plush + chocolates', 'flowers + plush + chocolates']) await page.getByRole('spinbutton', { name: `Mixed ${name} limit`, exact: true }).fill('0');
  await page.getByRole('combobox', { name: 'Lid requirement', exact: true }).selectOption('must_close');
  await page.getByRole('textbox', { name: 'Lid and clearance instructions', exact: true }).fill(syntheticPacking().clearanceNotes);
  await page.getByRole('textbox', { name: 'Safe packing and transport instructions', exact: true }).fill(syntheticPacking().transportNotes);
}
async function attest(page) {
  await page.getByRole('textbox', { name: 'Packing trial evidence', exact: true }).fill('Synthetic fixture tested two roses, closed lid and safe transport.');
  for (const name of ['I performed real-world packing and fit checks', 'I checked safe packing and transport', 'I checked lid and clearance requirements']) await page.getByRole('checkbox', { name, exact: true }).check();
}
const pageErrors = new WeakMap();
test.beforeEach(({ page }) => { const errors = []; pageErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(({ page }) => expect(pageErrors.get(page)).toEqual([]));

test('twelve pending policies have blank capacities and never gain approval from loading or saving a blank draft', async ({ page }) => {
  const fixture = await mockPolicies(page); await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Gift Box Packing Policies', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Box', exact: true }).locator('option')).toHaveCount(12);
  await expect(page.getByRole('spinbutton', { name: 'Overall maximum units', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Lid requirement', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Approve saved policy', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText('Policy draft saved. It has not been approved.', { exact: true })).toBeVisible();
  expect(fixture.calls.find(call => call.method === 'PUT').body).toEqual({ expectedRevision: 0, rules: null, packing: null });
  expect(fixture.calls.some(call => call.suffix.endsWith('/approve'))).toBe(false);
  await expect(page.getByText('Public gift purchasing is closed.', { exact: true })).toBeVisible();
  expect(fixture.state.get('box-1').activePublication).toBeNull();
});

test('structured draft publishes explicit owner evidence, records version history and withdraws without opening commerce', async ({ page }) => {
  const fixture = await mockPolicies(page); await page.goto(path); await fillRules(page);
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText('Policy draft saved. It has not been approved.', { exact: true })).toBeVisible();
  const saved = fixture.calls.find(call => call.method === 'PUT').body;
  expect(saved.rules.componentRules).toHaveLength(2); expect(saved.rules.limits.mixedContentLimits).toHaveLength(4);
  expect(saved.rules.componentRules[0]).toMatchObject({ componentId: 'rose-red', maxQuantity: 2, allowedRegionIds: ['fixture-inside'] });
  expect(saved).not.toHaveProperty('approvedBy'); expect(saved).not.toHaveProperty('policyHash');
  await attest(page); await page.getByRole('button', { name: 'Approve saved policy', exact: true }).click();
  await expect(page.getByText('Reviewed policy version published. Public gift purchasing remains disabled.', { exact: true })).toBeVisible();
  expect(fixture.calls.find(call => call.suffix.endsWith('/approve')).body).toMatchObject({ expectedRevision: 1, confirmPackingTested: true, confirmSafeTransport: true, confirmLidChecked: true });
  await page.getByText('Version 1 · Approved', { exact: true }).click();
  await expect(page.getByText('Synthetic fixture tested two roses, closed lid and safe transport.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve saved policy', exact: true })).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'Overall maximum units', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText('Policy draft saved. It has not been approved.', { exact: true })).toBeVisible();
  await attest(page); await page.getByRole('button', { name: 'Approve saved policy', exact: true }).click();
  await expect(page.getByText('Version 2 · Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Version 1 · Superseded', { exact: true })).toBeVisible();
  expect(fixture.state.get('box-1').history.find(savedVersion => savedVersion.version === 1).policy.limits.maxUnits).toBe(2);
  await page.getByRole('textbox', { name: 'Withdrawal reason', exact: true }).fill('Synthetic trial needs a revised review.');
  await page.getByRole('button', { name: 'Withdraw active policy', exact: true }).click();
  await expect(page.getByText('Active policy withdrawn. New gift commerce eligibility is blocked.', { exact: true })).toBeVisible();
  await expect(page.getByText('Version 2 · Withdrawn', { exact: true })).toBeVisible();
  expect(fixture.state.get('box-1').activePublication).toBeNull();
  expect(fixture.calls.some(call => /cart|checkout|orders/.test(call.suffix))).toBe(false);
});

test('stale policy save preserves owner edits until deliberate conflict reload and then uses the new revision', async ({ page }) => {
  const fixture = await mockPolicies(page, { initial: { ...pending(), status: 'draft', revision: 1, draft: { rules: syntheticRules(), packing: syntheticPacking() } }, conflictOnce: true });
  await page.goto(path); await page.getByRole('spinbutton', { name: 'Overall maximum units', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText('Another editor changed this record. Your unsaved changes are still here.', { exact: false })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Overall maximum units', exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my draft', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Overall maximum units', exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Overall maximum units', exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText('Policy draft saved. It has not been approved.', { exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'PUT').map(call => call.body.expectedRevision)).toEqual([1, 7]);
});

test('approval requires explicit evidence and attestations and remains disabled while draft edits are unsaved', async ({ page }) => {
  const fixture = await mockPolicies(page, { initial: { ...pending(), status: 'draft', revision: 1, draft: { rules: syntheticRules(), packing: syntheticPacking() } } });
  await page.goto(path); await page.getByRole('button', { name: 'Approve saved policy', exact: true }).click();
  await expect(page.locator('[name=evidence]')).toHaveAttribute('aria-invalid', 'true');
  expect(fixture.calls.some(call => call.suffix.endsWith('/approve'))).toBe(false);
  await attest(page); await page.getByRole('spinbutton', { name: 'Overall maximum units', exact: true }).fill('3');
  await expect(page.getByRole('button', { name: 'Approve saved policy', exact: true })).toBeDisabled();
  expect(fixture.calls.some(call => call.suffix.endsWith('/approve'))).toBe(false);
});

test('Box 11 records separate compartments and oversized plush beside permission through ordinary form controls', async ({ page }) => {
  const fixture = await mockPolicies(page); await page.goto(path); await page.getByRole('combobox', { name: 'Box', exact: true }).selectOption('box-11');
  await expect(page.getByText(/BOX-11 requires two separately reviewed compartments/)).toBeVisible();
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: 'Add compartment', exact: true }).click();
    await page.getByRole('textbox', { name: `Compartment ID ${index}`, exact: true }).fill(`fixture-well-${index}`);
    await page.getByRole('spinbutton', { name: `Compartment maximum ${index}`, exact: true }).fill('1');
    await page.getByRole('button', { name: 'Add placement region', exact: true }).click();
    await page.getByRole('textbox', { name: `Region ID ${index}`, exact: true }).fill(`fixture-region-${index}`);
    await page.getByRole('combobox', { name: `Region compartment ${index}`, exact: true }).selectOption(`fixture-well-${index}`);
  }
  await page.getByRole('button', { name: 'Add placement region', exact: true }).click();
  await page.getByRole('textbox', { name: 'Region ID 3', exact: true }).fill('fixture-beside');
  await page.getByRole('combobox', { name: 'Region zone 3', exact: true }).selectOption('beside');
  await expect(page.getByRole('combobox', { name: 'Region compartment 3', exact: true })).toBeDisabled();
  await addComponent(page, 'plush', 'plush-1');
  await page.getByRole('spinbutton', { name: 'Maximum quantity: Fixture Plush One', exact: true }).fill('1');
  await page.getByRole('checkbox', { name: 'Allow fixture-beside (beside) for Fixture Plush One', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Treat Fixture Plush One as oversized', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Explicitly allow oversized Fixture Plush One inside', exact: true })).not.toBeChecked();
  await addComponent(page, 'ribbon', 'ribbon-navy');
  for (const [name, value] of [['Overall maximum units', '1'], ['Maximum flower units', '0'], ['Maximum plush units', '1'], ['Maximum chocolate units', '0']]) await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  for (const name of ['flowers + plush', 'flowers + chocolates', 'plush + chocolates', 'flowers + plush + chocolates']) await page.getByRole('spinbutton', { name: `Mixed ${name} limit`, exact: true }).fill('0');
  await page.getByRole('combobox', { name: 'Lid requirement', exact: true }).selectOption('open_presentation');
  for (const label of ['Lid and clearance instructions', 'Safe packing and transport instructions', 'Plush handling instructions', 'Box 11 compartment instructions']) await page.getByRole('textbox', { name: label, exact: true }).fill(`Synthetic fixture instructions for ${label}.`);
  await page.getByRole('button', { name: 'Save policy draft', exact: true }).click();
  await expect(page.getByText('Policy draft saved. It has not been approved.', { exact: true })).toBeVisible();
  const saved = fixture.calls.find(call => call.method === 'PUT').body;
  expect(saved.rules.compartments).toHaveLength(2);
  expect(saved.rules.regions.map(region => region.compartmentId)).toEqual(['fixture-well-1', 'fixture-well-2', null]);
  expect(saved.rules.componentRules[0]).toMatchObject({ oversizedPlush: true, allowOversizedInside: false, allowedRegionIds: ['fixture-beside'] });
});

test('older approved policy references require renewed review while explicit withdrawal remains available', async ({ page }) => {
  const pub = { ...publication(1), compatibleWithCurrentContract: false };
  pub.policy.catalogVersion = 'old-fixture-catalog';
  const fixture = await mockPolicies(page, { initial: { ...pending(), revision: 2, status: 'approved', activePublication: pub, history: [pub] } });
  await page.goto(path);
  await expect(page.getByRole('alert').filter({ hasText: 'Review required: this approved version uses older catalog, media or geometry references.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve saved policy', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Withdrawal reason', exact: true }).fill('Synthetic earlier reference needs owner re-review.');
  await page.getByRole('button', { name: 'Withdraw active policy', exact: true }).click();
  await expect(page.getByText('Active policy withdrawn. New gift commerce eligibility is blocked.', { exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'POST').map(call => call.suffix)).toEqual(['/box-1/withdraw']);
  expect(fixture.state.get('box-1').history[0].policy.catalogVersion).toBe('old-fixture-catalog');
  expect(fixture.state.get('box-1').activePublication).toBeNull();
});

for (const width of [320, 390, 768, 1440]) test(`packing policy administration stays readable and safe at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const pub = publication(2), earlier = { ...publication(1), status: 'superseded' };
  await mockPolicies(page, { initial: { ...pending(), revision: 2, status: 'approved', activePublication: pub, history: [pub], historyHasMore: true, historyTotal: 2 }, earlier });
  await page.goto(path); await page.getByText('Version 2 · Approved', { exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByText(pub.evidence, { exact: true })).toBeVisible();
  await expect(page.locator('.gb-policy-history img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Load earlier policy versions', exact: true }).click();
  await expect(page.getByText('Version 1 · Superseded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load earlier policy versions', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath(`packing-policies-${width}.png`), fullPage: true });
});

for (const role of [null, 'customer']) test(`${role || 'guest'} cannot enter admin policy management or query private evidence`, async ({ page }) => {
  const fixture = await mockPolicies(page, { role }); await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Gift Box Packing Policies', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: role ? 'Access denied' : 'Administrator sign in', exact: true })).toBeVisible();
  expect(fixture.calls).toHaveLength(0);
});
