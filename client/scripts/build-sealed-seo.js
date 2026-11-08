import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { validateSealedPublication, RENEWAL_FILES } from './seo/renewal.js';
import { writeSeoOutput } from './seo/generator.js';
import { readPublicSeoCatalog, publicCatalogDigest, waitForPublicSeoApi } from '../../server/scripts/read-public-seo-catalog.js';

const read = async name => JSON.parse(await readFile(`seo-publication/${name}.json`, 'utf8'));
const [catalog, content, lock] = await Promise.all(['catalog', 'content', 'lock'].map(read));
validateSealedPublication({ lock, catalog, content });
const main = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], { encoding: 'utf8' }).split(/\s/)[0];
if (main !== lock.sourceCommit) throw Error('Reviewed source is no longer current main; renew again');
execFileSync('git', ['fetch', '--no-tags', '--depth=2', 'origin', 'main'], { stdio: 'pipe' });
// Only the three reviewed public artifacts may differ from the approved source.
const changed = execFileSync('git', ['diff', '--name-only', lock.sourceCommit, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
if (changed.length !== RENEWAL_FILES.length || changed.some(file => !RENEWAL_FILES.includes(file))) throw Error('Publication branch contains unreviewed source changes');
await waitForPublicSeoApi();
const live = await readPublicSeoCatalog();
if (publicCatalogDigest(live) !== publicCatalogDigest(catalog)) throw Error('Live catalog changed since publication review; renew again');
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: 'client', env: { ...process.env, VITE_SEO_INDEXING_ENABLED: 'true' }, stdio: 'inherit' });
const report = await writeSeoOutput({ catalog, content, siteOrigin: 'https://tapandwrap.net', publish: true, now: new Date(lock.createdAt), maximumAgeSeconds: 86400, minimumCategoryProducts: 1 });
if (report.publicationId !== lock.publicationId || report.expiresAt !== lock.expiresAt) throw Error('Built publication does not match reviewed seal');
execFileSync(process.execPath, ['client/scripts/prepare-seo-deployment.js', '--write'], { stdio: 'inherit' });
console.log(JSON.stringify({ verified: true, publicationId: report.publicationId, expiresAt: report.expiresAt }));
