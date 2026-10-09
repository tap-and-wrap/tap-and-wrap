import { createHash } from 'node:crypto';

const PUBLIC_PATH = /^\/(?:products|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function stableDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function publicationFor(plan, { now = new Date(), maximumAgeSeconds = 3600 } = {}) {
  if (!Number.isSafeInteger(maximumAgeSeconds) || maximumAgeSeconds < 60 || maximumAgeSeconds > 86400) throw new Error('SEO snapshot lifetime must be an integer from 60 to 86400 seconds');
  const generatedAt = new Date(now).toISOString();
  const sourceAt = plan.sourceGeneratedAt ? Date.parse(plan.sourceGeneratedAt) : Date.parse(generatedAt);
  if (!Number.isFinite(sourceAt) || sourceAt > Date.parse(generatedAt)) throw new Error('SEO source generation timestamp is invalid or in the future');
  const mediaExpirations = plan.catalog.products.filter((product) => product.mediaVerified).map((product) => Date.parse(product.media.validUntil)).filter(Number.isFinite);
  const expiresAt = new Date(Math.min(Math.min(sourceAt, Date.parse(generatedAt)) + maximumAgeSeconds * 1000, ...mediaExpirations)).toISOString();
  if (plan.report.indexingEnabled && Date.parse(expiresAt) <= Date.parse(generatedAt)) throw new Error('SEO source snapshot has expired; obtain a newly authorized export');
  const routes = [...plan.routes.values()].filter((route) => !/^\/(?:admin|cart|checkout|my-orders|track-order|login|signup|forgot-password|reset-password|verify-email|404)$/.test(route.pathname)).map((route) => ({ pathname: route.pathname, hash: stableDigest({ title: route.title, description: route.description, body: route.body, structuredData: route.structuredData, indexable: route.indexable, sourceFingerprint: route.sourceFingerprint }), indexable: route.indexable === true, updatedAt: route.updatedAt || null }));
  const id = stableDigest({ origin: plan.origin, generatedAt, expiresAt, routes });
  return { version: 1, id, generatedAt, expiresAt, maximumAgeSeconds, routes };
}

export function comparePublications(previous, next) {
  const before = new Map((previous?.routes || []).map((entry) => [entry.pathname, entry]));
  const after = new Map((next?.routes || []).map((entry) => [entry.pathname, entry]));
  const added = [], changed = [], withdrawn = [];
  for (const [pathname, entry] of after) {
    const old = before.get(pathname);
    if (!old) added.push(pathname);
    else if (old.hash !== entry.hash) changed.push(pathname);
    if (old?.indexable && !entry.indexable) withdrawn.push(pathname);
  }
  for (const [pathname, entry] of before) if (!after.has(pathname) && (entry.indexable || PUBLIC_PATH.test(pathname))) withdrawn.push(pathname);
  return { added: added.sort(), changed: changed.sort(), withdrawn: [...new Set(withdrawn)].sort(), requiresDeployment: added.length > 0 || changed.length > 0 || withdrawn.length > 0 };
}
