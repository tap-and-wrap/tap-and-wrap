import { createHash } from 'node:crypto';
import { buildSeoPlan } from './generator.js';
import { publicationFor } from './publication.js';

export const RENEWAL_FILES = ['seo-publication/catalog.json', 'seo-publication/content.json', 'seo-publication/lock.json'];
export const jsonHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sealPublication({ catalog, content, sourceCommit, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw Error('Invalid reviewed source commit');
  const plan = buildSeoPlan({ catalog, content, siteOrigin: 'https://tapandwrap.net', publish: true, now, minimumCategoryProducts: 1 });
  if (!catalog.products.length || plan.catalog.products.length !== catalog.products.length || plan.catalog.products.some(product => !product.mediaVerified)) throw Error('Incomplete publication eligibility or media');
  const publication = publicationFor(plan, { now, maximumAgeSeconds: 86400 });
  const age = new Date(now).valueOf() - Date.parse(catalog.generatedAt);
  if (age < 0 || age > 600000 || Date.parse(publication.expiresAt) <= new Date(now).valueOf() + 3600000) throw Error('Stale source or expiring publication');
  return { version: 1, sourceCommit, createdAt: new Date(now).toISOString(), expiresAt: publication.expiresAt, publicationId: publication.id, catalogHash: jsonHash(catalog), contentHash: jsonHash(content) };
}
export function validateSealedPublication({ lock, catalog, content, now = new Date() }) {
  const current = new Date(now).valueOf(), created = Date.parse(lock?.createdAt);
  if (lock?.version !== 1 || !Number.isFinite(created) || created > current || current - created > 86400000 || Date.parse(lock.expiresAt) <= current + 3600000) throw Error('Expired or invalid publication seal');
  if (lock.catalogHash !== jsonHash(catalog) || lock.contentHash !== jsonHash(content)) throw Error('Publication artifacts changed');
  // Validate against REAL time first. Reconstructing the exact reviewed ID at
  // createdAt never renews source/media freshness or extends the original expiry.
  const currentPlan = buildSeoPlan({ catalog, content, siteOrigin: 'https://tapandwrap.net', publish: true, now, minimumCategoryProducts: 1 });
  if (currentPlan.catalog.products.length !== catalog.products.length || currentPlan.catalog.products.some(product => !product.mediaVerified)) throw Error('Current publication eligibility or media expired');
  const expected = sealPublication({ catalog, content, sourceCommit: lock.sourceCommit, now: new Date(created) });
  if (JSON.stringify(expected) !== JSON.stringify(lock)) throw Error('Publication ID or expiry mismatch');
  return expected;
}
