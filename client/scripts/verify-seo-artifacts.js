import { readFile } from 'node:fs/promises';
import { validateSealedPublication } from './seo/renewal.js';
import { writeSeoOutput } from './seo/generator.js';
const read = async name => JSON.parse(await readFile(`seo-publication/${name}.json`, 'utf8'));
const [catalog, content, lock] = await Promise.all(['catalog', 'content', 'lock'].map(read));
validateSealedPublication({ lock, catalog, content });
const result = await writeSeoOutput({ catalog, content, siteOrigin: 'https://tapandwrap.net', publish: true, now: new Date(lock.createdAt), maximumAgeSeconds: 86400, minimumCategoryProducts: 1 });
if (result.publicationId !== lock.publicationId || result.expiresAt !== lock.expiresAt) throw Error('Publication ID/expiry mismatch');
console.log(JSON.stringify({ verified: true, publicationId: result.publicationId, expiresAt: result.expiresAt }));
