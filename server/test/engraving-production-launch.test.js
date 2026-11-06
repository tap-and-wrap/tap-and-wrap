import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { desiredConfigurations, planPublications, publishInitialTypes, verifyAssets, createProductionClient, productionPreflight } from '../scripts/launch-engraving-production.js';
import { configurationInput } from '../src/engraving/contracts.js';
import { FONT_REGISTRY, ICON_REGISTRY } from '../../shared/engraving/definitions.mjs';
const ADMIN = '/api/v1/admin/commerce/engraving/types';
function fixture(records = []) {
  const saved = structuredClone(records), posts = [];
  const client = {
    async get(path) {
      if (path === `${ADMIN}?page=1`) return { available: true, types: structuredClone(saved), fonts: FONT_REGISTRY, icons: ICON_REGISTRY };
      if (path === '/api/v1/auth/me') return { user: { id: 'real-admin-id', role: 'admin' } };
      if (path === '/api/v1/status') return { service: 'tapandwrap-api', checkoutEnabled: true };
      throw new Error('Unexpected request');
    },
    async post(path, body) {
      assert.equal(path, ADMIN); configurationInput.parse(body.configuration);
      const index = saved.findIndex(record => record.typeId === body.configuration.typeId), previous = saved[index];
      assert.equal(body.expectedRevision, previous?.revision || 0);
      const next = { ...body.configuration, version: (previous?.version || 0) + 1, revision: body.expectedRevision + 1 };
      if (index < 0) saved.push(next); else saved[index] = next;
      posts.push(structuredClone(body)); return { configuration: next };
    },
    async asset(path) { return readFile(new URL(`../../client/public${path}`, import.meta.url)); },
  };
  return { saved, posts, client };
}
test('nine exact active approved configurations pass the application contract and contain only type prices', () => {
  const desired = desiredConfigurations(); assert.equal(desired.length, 9);
  assert.deepEqual(desired.map(record => record.typeId), ['perfume','necklace','bracelet','watch','lip-gloss','makeup','bag','office-set','other']);
  for (const value of desired) {
    configurationInput.parse(value); assert.equal(value.status, 'active'); assert.equal(value.assetsApproved, true);
    assert.equal(value.pricePiastres, 10000); assert.ok(Array.isArray(value.placements));
    assert.equal(value.fontIds.length, 12); assert.equal(value.iconIds.length, 48);
    assert.deepEqual([value.maxLines,value.maxCharacters,value.maxCharactersPerLine], [3,80,40]);
    assert.deepEqual(Object.keys(value).filter(key => /price|fee|adjustment/i.test(key)), ['pricePiastres']);
  }
});
test('missing types publish once; rerun adds no versions and preserves unrelated settings', async () => {
  const unrelated = { ...desiredConfigurations()[0], typeId: 'owner-special', name: 'Owner Special', version: 7, revision: 8 };
  const f = fixture([unrelated]);
  const first = await publishInitialTypes(f.client, { id: 'real-admin-id' });
  assert.equal(first.length, 9); assert.equal(f.posts.length, 9); assert.ok(first.every(record => record.version === 1));
  assert.deepEqual(f.saved[0], unrelated);
  await publishInitialTypes(f.client, { id: 'real-admin-id' }); assert.equal(f.posts.length, 9);
});
test('only changed initial types publish using loaded revision', async () => {
  const f = fixture(desiredConfigurations().map(record => ({ ...record, version: 3, revision: 5 })));
  f.saved[0].pricePiastres = 20000; f.saved[0].fontIds = [FONT_REGISTRY[0].id];
  await publishInitialTypes(f.client, { id: 'real-admin-id' });
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].expectedRevision, 5); assert.equal(f.saved[0].version, 4); assert.equal(f.saved[0].pricePiastres,20000);
});

test('studio upgrade preserves merchant settings and retired placement identities', async () => {
  const current = { ...desiredConfigurations()[0], name: 'Merchant perfume', status: 'disabled', pricePiastres: 23500,
    displayOrder: 17, maxLines: 2, maxCharacters: 50, maxCharactersPerLine: 30,
    placements: [{ id: 'front', label: 'Original front', status: 'retired', displayOrder: 4 },
      { id: 'custom-surface', label: 'Merchant surface', status: 'disabled', displayOrder: 8 }], version: 1, revision: 1 };
  const f = fixture([current]);
  await publishInitialTypes(f.client, { id: 'real-admin-id' });
  const saved = f.saved.find(value => value.typeId === current.typeId);
  for (const key of ['name','status','pricePiastres','displayOrder','maxLines','maxCharacters','maxCharactersPerLine']) assert.equal(saved[key], current[key]);
  assert.deepEqual(saved.placements.slice(0,2), current.placements);
  assert.equal(saved.placements.filter(value => value.id === 'front').length, 1);
  assert.equal(saved.version, 2);
  const count = f.posts.length; await publishInitialTypes(f.client, { id: 'real-admin-id' }); assert.equal(f.posts.length, count);
});
test('duplicate IDs, retired types and invalid revisions stop before mutation', async () => {
  const type = { ...desiredConfigurations()[0], version: 1, revision: 1 };
  for (const records of [[type, type], [{ ...type, status: 'retired' }], [{ ...type, revision: -1 }]]) {
    const f = fixture(records); await assert.rejects(publishInitialTypes(f.client, { id: 'real-admin-id' })); assert.equal(f.posts.length, 0);
  }
});
test('admin owner change refuses publication; never invents attribution', async () => {
  const f = fixture(); const get = f.client.get;
  f.client.get = path => path === '/api/v1/auth/me' ? { user: { id: 'someone-else', role: 'admin' } } : get(path);
  await assert.rejects(publishInitialTypes(f.client, { id: 'real-admin-id' }), { code: 'ADMIN_SESSION_CHANGED' }); assert.equal(f.posts.length, 0);
  await assert.rejects(publishInitialTypes(f.client, null), { code: 'AUTHENTICATED_ADMIN_REQUIRED' });
});
test('lost publication acknowledgment resolves by owned admin readback without replay', async () => {
  const f = fixture(); const post = f.client.post;
  f.client.post = async (...args) => { await post(...args); throw Object.assign(new Error(), { code: 'NETWORK_RESPONSE_UNCERTAIN' }); };
  assert.equal((await publishInitialTypes(f.client, { id: 'real-admin-id' })).length, 9); assert.equal(f.posts.length, 9);
});
test('uncommitted uncertain response and revision conflict never automatically retry', async () => {
  for (const code of ['NETWORK_RESPONSE_UNCERTAIN', 'EDIT_CONFLICT']) {
    const f = fixture(); let attempts = 0;
    f.client.post = async () => { attempts++; throw Object.assign(new Error(), { code }); };
    await assert.rejects(publishInitialTypes(f.client, { id: 'real-admin-id' })); assert.equal(attempts, 1);
  }
});
test('read-only verify detects incomplete records without publication', async () => {
  const f = fixture(); await assert.rejects(publishInitialTypes(f.client, { id: 'real-admin-id' }, { verifyOnly: true }), { code: 'NINE_CONFIGURATIONS_NOT_VERIFIED' });
  assert.equal(f.posts.length, 0);
});
test('asset audit checks both font hashes, notices, SVG safety and live bytes', async () => {
  const f = fixture(); assert.equal((await verifyAssets(f.client)).length, FONT_REGISTRY.length*2+ICON_REGISTRY.length+13);
  f.client.asset = async () => Buffer.from('Wrong hosted asset');
  await assert.rejects(verifyAssets(f.client), { code: 'LIVE_ASSET_MISMATCH' });
});

test('SVG asset verification tolerates only Git CRLF/LF normalization', async () => {
  const f=fixture(),asset=f.client.asset;
  f.client.asset=async path=>{const bytes=await asset(path);return path.endsWith('.svg')?Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n').replaceAll('\n','\r\n')):bytes;};
  assert.equal((await verifyAssets(f.client)).length,85);
  f.client.asset=async path=>{const bytes=await asset(path);return path.endsWith('.svg')?Buffer.from(bytes.toString('utf8').replace('svg','svg data-changed="true"')):bytes;};
  await assert.rejects(verifyAssets(f.client),{code:'LIVE_ASSET_MISMATCH'});
});
test('disabled admin and mismatched deployed registries fail before publication', async () => {
  for (const response of [{ available: false }, { available: true, types: [], fonts: [], icons: [] }]) {
    const f = fixture(); f.client.get = async () => response;
    await assert.rejects(publishInitialTypes(f.client, { id: 'real-admin-id' })); assert.equal(f.posts.length, 0);
  }
});
test('preflight requires ready production and existing enabled checkout', async () => {
  const f = fixture(); const get = f.client.get;
  f.client.get = async path => path === '/health/ready' ? { database: 'connected', code: 'DATABASE_READY' }
    : path.includes('/engraving/types?') ? { enabled: false } : get(path);
  assert.equal((await productionPreflight(f.client)).intakeEnabled, false);
  f.client.get = async path => path === '/health/ready' ? { code: 'DATABASE_NOT_READY' } : get(path);
  await assert.rejects(productionPreflight(f.client), { code: 'PRODUCTION_NOT_READY' });
});
test('HTTP client limits requests to exact production scope and keeps credentials/cookies out of asset requests', async () => {
  const calls = [];
  const request = (url, options, callback) => {
    const req = new EventEmitter(); req.destroy = () => {}; req.end = payload => {
      calls.push({ url: url.toString(), options, payload });
      const res = new EventEmitter(); res.statusCode = 200; res.headers = {};
      let data = {};
      if (url.pathname.endsWith('/csrf')) { data = { csrfToken: 'test-csrf' }; res.headers['set-cookie'] = ['tw_csrf=test-csrf; HttpOnly']; }
      if (url.pathname.endsWith('/login')) res.headers['set-cookie'] = ['tw_session=test-session; HttpOnly'];
      if (url.pathname.endsWith('/me')) data = { user: { id: 'real-admin-id', role: 'admin' } };
      queueMicrotask(() => { callback(res); res.emit('data', Buffer.from(JSON.stringify({ ok: true, data }))); res.emit('end'); });
    }; return req;
  };
  const client = createProductionClient({ request, lookup() {} });
  await assert.rejects(client.post('/api/v1/admin/commerce/orders', {}), { code: 'REQUEST_OUTSIDE_LAUNCH_SCOPE' });
  await assert.rejects(client.get('/api/v1/admin/customers'), { code: 'REQUEST_OUTSIDE_LAUNCH_SCOPE' });
  await client.login('operator@example.test', 'test-only-password');
  const login = calls.find(call => call.url.endsWith('/login'));
  assert.equal(login.options.headers.Origin, 'https://tapandwrap.net'); assert.equal(login.options.headers['X-CSRF-Token'], 'test-csrf');
  assert.equal(calls.filter(call => call.url.endsWith('/login')).length, 1);
  await client.asset(FONT_REGISTRY[0].source);
  assert.equal(calls.at(-1).options.headers.Cookie, undefined); assert.equal(calls.at(-1).options.headers['X-CSRF-Token'], undefined);
  await client.close(); assert.ok(calls.at(-1).url.endsWith('/logout'));
});
