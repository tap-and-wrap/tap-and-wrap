const PRODUCT_PATH = /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Runtime authority supersedes reviewed prelaunch maps. A response must cover
// exactly the requested paths; absence, conflicting owners or redirects to an
// arbitrary URL are never interpreted as public routing permission.
export function validateAddressResolution(value, paths) {
  if (!exactKeys(value, ['version', 'products']) || value.version !== 1 || !Array.isArray(value.products) || !paths.length || paths.length > 20 || value.products.length !== paths.length) throw new Error('Invalid address resolution');
  const resolved = new Map();
  for (const entry of value.products) {
    if (!paths.includes(entry.requestedPath) || resolved.has(entry.requestedPath)) throw new Error('Invalid address resolution');
    if (exactKeys(entry, ['requestedPath', 'notFound']) && entry.notFound === true) resolved.set(entry.requestedPath, null);
    else {
      if (!exactKeys(entry, ['requestedPath', 'canonicalPath', 'seoSignature']) || !PRODUCT_PATH.test(entry.canonicalPath) || entry.canonicalPath.length > 310 || entry.seoSignature !== null && !/^[a-f0-9]{64}$/.test(entry.seoSignature)) throw new Error('Invalid address resolution');
      resolved.set(entry.requestedPath, entry);
    }
  }
  return resolved;
}

// Routing evidence only. Registry ownership and public browse eligibility must
// be reviewed under separately authorized read access; name proposals are invalid.
export function validateProductCompatibility(value, { origin, now = new Date(), requireFresh = true } = {}) {
  const fail = () => { throw new Error('SEO product compatibility mapping is invalid or expired'); };
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) fail();
  } catch { fail(); }
  if (!exactKeys(value, ['version', 'source', 'origin', 'generatedAt', 'expiresAt', 'products']) || value.version !== 1 || value.source !== 'reviewed-registered-public-product-addresses' || value.origin !== origin || !Array.isArray(value.products) || value.products.length > 10_000) fail();
  const generated = typeof value.generatedAt === 'string' ? Date.parse(value.generatedAt) : NaN;
  const expires = typeof value.expiresAt === 'string' ? Date.parse(value.expiresAt) : NaN;
  if (!Number.isFinite(generated) || !Number.isFinite(expires) || expires <= generated || expires - generated > 86400_000 || requireFresh && (generated > Number(now) || expires <= Number(now))) fail();
  const owners = new Map(), redirects = {}, canonicals = new Set();
  let count = 0;
  for (const entry of value.products) {
    if (!exactKeys(entry, ['canonicalPath', 'aliases']) || !Array.isArray(entry.aliases) || entry.aliases.length > 100 || canonicals.has(entry.canonicalPath)) fail();
    canonicals.add(entry.canonicalPath);
    for (const pathname of [entry.canonicalPath, ...entry.aliases]) {
      if (typeof pathname !== 'string' || pathname.length > 310 || !PRODUCT_PATH.test(pathname) || owners.has(pathname) || ++count > 100_000) fail();
      owners.set(pathname, entry.canonicalPath);
      if (pathname !== entry.canonicalPath) redirects[pathname] = entry.canonicalPath;
    }
  }
  return { canonicalPaths: [...canonicals], redirects, owners };
}
