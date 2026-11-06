import https from 'node:https';
import { Resolver } from 'node:dns/promises';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { INITIAL_ENGRAVING_TYPES, FONT_REGISTRY, ICON_REGISTRY } from '../../shared/engraving/definitions.mjs';

const API = 'https://api.tapandwrap.net';
const SITE = 'https://tapandwrap.net';
const ADMIN = '/api/v1/admin/commerce/engraving/types';
const PUBLIC = '/api/v1/commerce/engraving/types';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stop = code => { throw Object.assign(new Error(code), { code }); };
const safeCode = error => /^[A-Z][A-Z0-9_]{0,100}$/.test(error?.code || '') ? error.code : 'LAUNCH_OPERATION_FAILED';
const cleanText = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');

export function cloudflareLookup() {
  // This resolver belongs only to this Node process. No OS or server DNS settings change.
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers(['1.1.1.1', '1.0.0.1']);
  return (hostname, options, callback) => resolver.resolve4(hostname).then(addresses => {
    if (!addresses.length) return callback(Object.assign(new Error(), { code: 'DNS_LOOKUP_FAILED' }));
    if (options?.all) callback(null, addresses.map(address => ({ address, family: 4 })));
    else callback(null, addresses[0], 4);
  }, () => callback(Object.assign(new Error(), { code: 'DNS_LOOKUP_FAILED' })));
}

export function createProductionClient({ request = https.request, lookup = cloudflareLookup() } = {}) {
  const cookies = new Map();
  let csrf = null;
  const assets = new Set([...FONT_REGISTRY.flatMap(font => [font.source, font.license]),
    ...ICON_REGISTRY.map(icon => icon.asset), '/assets/engraving/fonts/v1/SOURCE.txt', '/assets/engraving/v1/NOTICE.txt']);
  const allowedGet = path => ['/health/ready', '/api/v1/status', '/api/v1/auth/csrf', '/api/v1/auth/me'].includes(path)
    || [ADMIN, PUBLIC].some(prefix => new RegExp(`^${prefix}\\?page=([1-9]|[1-9][0-9]|1[0-9]{2}|200)$`).test(path));
  async function send(origin, path, method = 'GET', body) {
    const asset = origin === SITE && method === 'GET' && assets.has(path);
    if (!asset && (origin !== API || !(method === 'GET' && allowedGet(path)
      || method === 'POST' && [ADMIN, '/api/v1/auth/login', '/api/v1/auth/logout'].includes(path)))) stop('REQUEST_OUTSIDE_LAUNCH_SCOPE');
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const headers = { Accept: asset ? '*/*' : 'application/json', 'User-Agent': 'TapWrap-Authorized-Engraving-Launch/1' };
      if (!asset) {
        headers.Origin = SITE;
        if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
        if (method === 'POST') { headers['X-CSRF-Token'] = csrf || ''; headers['Content-Type'] = 'application/json'; }
      }
      const req = request(new URL(path, origin), { method, headers, lookup, timeout: 20000 }, res => {
        if (!asset) for (const cookie of res.headers['set-cookie'] || []) {
          const [pair] = cookie.split(';'), split = pair.indexOf('=');
          const key = pair.slice(0, split), value = pair.slice(split + 1);
          if (['tw_csrf', 'tw_session', 'tw_cart'].includes(key)) { if (value) cookies.set(key, value); else cookies.delete(key); }
        }
        const parts = []; let size = 0;
        res.on('data', chunk => { size += chunk.length; if (size > 4 * 1024 * 1024) res.destroy(Object.assign(new Error(), { code: 'RESPONSE_TOO_LARGE' })); else parts.push(chunk); });
        res.on('error', reject);
        res.on('end', () => {
          const bytes = Buffer.concat(parts);
          if (asset) { if (res.statusCode !== 200) return reject(Object.assign(new Error(), { code: 'PUBLIC_ASSET_UNAVAILABLE' })); return resolve(bytes); }
          let value; try { value = JSON.parse(bytes); } catch { return reject(Object.assign(new Error(), { code: 'API_RESPONSE_INVALID' })); }
          if (res.statusCode !== 200 || value.ok !== true) return reject(Object.assign(new Error(), { code: safeCode({ code: value.error?.code || `HTTP_${res.statusCode}` }) }));
          resolve(value.data);
        });
      });
      req.on('timeout', () => req.destroy(Object.assign(new Error(), { code: 'REQUEST_TIMEOUT' })));
      req.on('error', () => reject(Object.assign(new Error(), { code: 'NETWORK_RESPONSE_UNCERTAIN' })));
      req.end(payload);
    });
  }
  return {
    get: path => send(API, path), post: (path, body) => send(API, path, 'POST', body), asset: path => send(SITE, path),
    async login(email, password) {
      csrf = (await send(API, '/api/v1/auth/csrf')).csrfToken;
      if (typeof csrf !== 'string' || !csrf) stop('CSRF_UNAVAILABLE');
      await send(API, '/api/v1/auth/login', 'POST', { email, password });
      const { user } = await send(API, '/api/v1/auth/me');
      if (!user || user.role !== 'admin' || !user.id) stop('AUTHENTICATED_ADMIN_REQUIRED');
      return { id: user.id };
    },
    async close() {
      try { if (cookies.has('tw_session')) await send(API, '/api/v1/auth/logout', 'POST', {}); }
      finally { cookies.clear(); csrf = null; }
    },
  };
}

export function desiredConfigurations() {
  return INITIAL_ENGRAVING_TYPES.map(type => ({ ...type, placements: [], status: 'active', assetsApproved: true,
    fontIds: FONT_REGISTRY.map(font => font.id), iconIds: ICON_REGISTRY.map(icon => icon.id) }));
}
function configuration(record) { const { revision, version, ...value } = record; void revision; void version; return value; }
export function planPublications(records) {
  if (!Array.isArray(records) || new Set(records.map(record => record.typeId)).size !== records.length) stop('DUPLICATE_CURRENT_TYPE');
  return desiredConfigurations().map(desired => {
    const current = records.find(record => record.typeId === desired.typeId);
    if (current && (!Number.isSafeInteger(current.revision) || current.revision < 1 || !Number.isSafeInteger(current.version) || current.version < 1)) stop('CONFIGURATION_REVISION_INVALID');
    if (current?.status === 'retired') stop('RETIRED_INITIAL_TYPE_REQUIRES_REVIEW');
    if (current?.placements?.length) stop('EXISTING_PLACEMENTS_REQUIRE_REVIEW');
    return { desired, current, change: !current || !isDeepStrictEqual(configuration(current), desired) };
  });
}

export async function listConfigurations(client) {
  const records = [];
  for (let page = 1; page <= 200; page += 1) {
    const data = await client.get(`${ADMIN}?page=${page}`);
    if (data.available !== true) stop('ENGRAVING_CONFIGURATION_DISABLED');
    if (!isDeepStrictEqual(data.fonts, FONT_REGISTRY) || !isDeepStrictEqual(data.icons, ICON_REGISTRY)) stop('DEPLOYED_REGISTRY_MISMATCH');
    if (!Array.isArray(data.types) || data.types.length > 20) stop('CONFIGURATION_RESPONSE_INVALID');
    records.push(...data.types);
    if (!data.hasNext) return records;
  }
  stop('CONFIGURATION_PAGING_LIMIT');
}

export async function verifyAssets(client) {
  const paths = [...FONT_REGISTRY.flatMap(font => [font.source, font.license]), ...ICON_REGISTRY.map(icon => icon.asset),
    '/assets/engraving/fonts/v1/SOURCE.txt', '/assets/engraving/v1/NOTICE.txt'];
  const result = [];
  for (const path of paths) {
    const local = await readFile(new URL(`../../client/public${path}`, import.meta.url));
    if (!local.length) stop('BUNDLED_ASSET_EMPTY');
    if (path.endsWith('.svg') && /<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|<!ENTITY/i.test(cleanText(local))) stop('ICON_UNSAFE');
    if (path.endsWith('amiri.ttf') && hash(local) !== 'ab391c4147d054c48976e98322ad0eefe1427aa0e0502a12a4c75d80a70cfcd7') stop('FONT_HASH_MISMATCH');
    if (path.endsWith('rochester.ttf') && hash(local) !== '38657df5e357e841a39995592970ac14ea96a1376f178f0d8e0231fd5d630b2b') stop('FONT_HASH_MISMATCH');
    if (path.endsWith('amiri-LICENSE.txt') && !cleanText(local).includes('SIL OPEN FONT LICENSE Version 1.1')) stop('FONT_LICENSE_MISSING');
    if (path.endsWith('rochester-LICENSE.txt') && !cleanText(local).includes('Apache License')) stop('FONT_LICENSE_MISSING');
    if (path.endsWith('NOTICE.txt') && !cleanText(local).includes('CC0-1.0')) stop('ICON_LICENSE_MISSING');
    const live = await client.asset(path);
    const matches = path.endsWith('.txt') ? cleanText(live) === cleanText(local) : hash(live) === hash(local);
    if (!matches) stop('LIVE_ASSET_MISMATCH');
    result.push({ path, sha256: hash(local), verified: true });
  }
  return result;
}

export async function productionPreflight(client) {
  const ready = await client.get('/health/ready');
  if (ready.code !== 'DATABASE_READY' || ready.database !== 'connected') stop('PRODUCTION_NOT_READY');
  const status = await client.get('/api/v1/status');
  if (status.service !== 'tapandwrap-api' || status.checkoutEnabled !== true) stop('EXISTING_CHECKOUT_NOT_ENABLED');
  const assets = await verifyAssets(client);
  const publicly = await client.get(`${PUBLIC}?page=1`);
  return { checkoutEnabled: true, intakeEnabled: publicly.enabled === true, assets };
}

export async function publishInitialTypes(client, identity, { verifyOnly = false, progress = () => {} } = {}) {
  if (!identity?.id) stop('AUTHENTICATED_ADMIN_REQUIRED');
  const before = await listConfigurations(client);
  const plan = planPublications(before); // Complete preflight before any publication.
  for (const { desired, current, change } of plan) {
    if (!change || verifyOnly) continue;
    const verified = await client.get('/api/v1/auth/me');
    if (verified.user?.role !== 'admin' || verified.user?.id !== identity.id) stop('ADMIN_SESSION_CHANGED');
    try { await client.post(ADMIN, { expectedRevision: current?.revision || 0, configuration: desired }); }
    catch (error) {
      // Never replay an uncertain mutation. Accept only an exact, single-version readback.
      if (!['NETWORK_RESPONSE_UNCERTAIN', 'REQUEST_TIMEOUT'].includes(error.code)) throw error;
      const saved = (await listConfigurations(client)).find(record => record.typeId === desired.typeId);
      if (!saved || saved.revision !== (current?.revision || 0) + 1 || saved.version !== (current?.version || 0) + 1
        || !isDeepStrictEqual(configuration(saved), desired)) stop('PUBLICATION_UNCERTAIN_RERUN_EXPLICITLY');
    }
    progress({ typeId: desired.typeId, publicationAcknowledged: true });
  }
  const after = await listConfigurations(client);
  const verified = planPublications(after);
  if (verified.some(entry => entry.change)) stop('NINE_CONFIGURATIONS_NOT_VERIFIED');
  for (const original of before.filter(record => !INITIAL_ENGRAVING_TYPES.some(type => type.typeId === record.typeId))) {
    if (!isDeepStrictEqual(original, after.find(record => record.typeId === original.typeId))) stop('UNRELATED_CONFIGURATION_CHANGED');
  }
  const status = await client.get('/api/v1/status');
  if (status.checkoutEnabled !== true) stop('CHECKOUT_STATE_CHANGED');
  return verified.map(({ current }) => ({ typeId: current.typeId, name: current.name, version: current.version,
    revision: current.revision, status: current.status, pricePiastres: current.pricePiastres, assetsApproved: current.assetsApproved,
    fontIds: current.fontIds, iconIds: current.iconIds, placements: current.placements, maxLines: current.maxLines,
    maxCharacters: current.maxCharacters, maxCharactersPerLine: current.maxCharactersPerLine }));
}

async function main() {
  const mode = process.argv.slice(2);
  if (mode.length !== 1 || !['--preflight', '--publish', '--verify'].includes(mode[0])) stop('EXPLICIT_LAUNCH_MODE_REQUIRED');
  const client = createProductionClient();
  const result = { time: new Date().toISOString(), target: API, mode: mode[0], success: false };
  try {
    result.preflight = await productionPreflight(client);
    if (mode[0] !== '--preflight') {
      let input = ''; for await (const chunk of process.stdin) { input += chunk; if (input.length > 16384) stop('CREDENTIAL_INPUT_INVALID'); }
      let credentials; try { credentials = JSON.parse(input); } catch { stop('CREDENTIAL_INPUT_INVALID'); } input = '';
      if (typeof credentials.email !== 'string' || typeof credentials.password !== 'string' || !credentials.password) stop('CREDENTIAL_INPUT_INVALID');
      let identity;
      try { identity = await client.login(credentials.email, credentials.password); }
      finally { credentials.password = ''; credentials.email = ''; credentials = null; }
      result.configurations = await publishInitialTypes(client, identity, { verifyOnly: mode[0] === '--verify', progress: value => console.log(JSON.stringify(value)) });
      result.public = await client.get(`${PUBLIC}?page=1`);
    }
    result.success = true;
  } catch (error) { result.error = safeCode(error); process.exitCode = 1; }
  finally { try { await client.close(); } catch { result.logoutWarning = 'SESSION_LOGOUT_UNCONFIRMED'; process.exitCode = 1; } }
  const directory = new URL('../../client/test-results-engraving-production-launch/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('latest.json', directory), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`Sanitized report: ${fileURLToPath(new URL('latest.json', directory))}`);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(JSON.stringify({ success: false, error: safeCode(error) })); process.exitCode = 1; });
}
