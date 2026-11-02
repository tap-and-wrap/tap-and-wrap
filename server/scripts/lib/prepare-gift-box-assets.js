import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ASSET_VERSION, ASSET_ISSUES, FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';
import { assertNoLinks, auditAssetCollection, containedPath, DEVELOPMENT_ROOT, inspectImage, PROJECT_ROOT, readManifest, sha256, SOURCE_ROOT } from './gift-box-assets.js';

export const TRANSFORM_VERSION = 'webp-v1';
const relativeTo = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export async function safeDirectory(directory) {
  try { await assertNoLinks(directory); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Gift-box output directory is invalid.');
    await safeDirectory(parent);
    try { await mkdir(directory); } catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
    await assertNoLinks(directory);
  }
  if (!(await lstat(directory)).isDirectory()) throw new Error('Gift-box output directory is invalid.');
}

export async function writeOwnedFile(filename, bytes) {
  await safeDirectory(path.dirname(filename));
  try { await writeFile(filename, bytes, { flag: 'wx' }); return 'created'; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await assertNoLinks(filename);
    if (sha256(await readFile(filename)) !== sha256(bytes)) throw new Error('Gift-box output already exists with different content; refusing to overwrite it.');
    return 'unchanged';
  }
}

export async function prepareDevelopmentAssets({ sourceRoot = SOURCE_ROOT, outputRoot = DEVELOPMENT_ROOT, manifest } = {}) {
  // Tests may use isolated fixture directories under server/.cache only.
  const cache = path.join(PROJECT_ROOT, 'server', '.cache');
  const resolvedOutput = path.resolve(outputRoot);
  if (resolvedOutput !== path.resolve(DEVELOPMENT_ROOT) && !relativeTo(cache, resolvedOutput)) throw new Error('Gift-box output must stay in its ignored development or isolated test directory.');
  manifest ??= await readManifest();
  const audit = await auditAssetCollection({ root: sourceRoot, manifest }); // Validate every source before creating anything.
  const destination = path.join(resolvedOutput, ASSET_VERSION, TRANSFORM_VERSION);
  await safeDirectory(destination);
  const entries = [];
  let createdFiles = 0, unchangedFiles = 0;
  for (const component of FIXED_COMPONENTS) for (const role of ['selection', 'placement']) {
    if (!component[`${role}Asset`]) continue; // Chocolate selectors are text only.
    const source = manifest.files.find(file => file.path === component[`${role}Asset`]);
    if (!source.developmentCopy) continue;
    const sourceBytes = await readFile(containedPath(sourceRoot, source.path));
    if (sha256(sourceBytes) !== source.sha256) throw new Error('Gift-box source changed during optimization.');
    for (const targetWidth of role === 'selection' ? [320, 640] : [1200]) {
      // Preserve aspect ratio and alpha; never enlarge, crop, flatten or redraw.
      const bytes = await sharp(sourceBytes, { limitInputPixels: 4096 * 4096, failOn: 'warning' })
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 100, effort: 5 }).toBuffer();
      const metadata = await inspectImage(bytes);
      if (role === 'placement' && (!metadata.hasAlpha || metadata.transparentPixels === 0)) throw new Error('Gift-box optimization lost placement transparency.');
      const relative = `${targetWidth}/${source.path}`;
      const outcome = await writeOwnedFile(path.join(destination, ...relative.split('/')), bytes);
      if (outcome === 'created') createdFiles++; else unchangedFiles++;
      entries.push({ componentId: component.id, role, source: source.path, sourceSha256: source.sha256,
        path: relative, ...metadata, productionApproved: false });
    }
  }
  const developmentManifest = { schemaVersion: 1, assetVersion: ASSET_VERSION, catalogVersion: manifest.catalogVersion,
    transformVersion: TRANSFORM_VERSION, sourceInventorySha256: audit.sourceInventorySha256,
    developmentOnly: true, productionApproved: false, excludedIssues: ASSET_ISSUES, entries };
  await writeOwnedFile(path.join(destination, 'development-manifest.json'), `${JSON.stringify(developmentManifest, null, 2)}\n`);
  const uploadPlan = { schemaVersion: 1, mode: 'offline-plan-only', uploadAuthorized: false, productionReady: false,
    assetVersion: ASSET_VERSION, sourceInventorySha256: audit.sourceInventorySha256,
    requirements: ['Owner-reviewed artwork and derivatives', 'Approved geometry and physical scale', 'Separately authorized R2 upload and read-back verification', 'Explicit CDN base URL; no production URL is assigned here'],
    entries: entries.map(entry => ({ componentId: entry.componentId, role: entry.role, localDerivative: entry.path,
      proposedObjectKey: `gift-box/v2/${ASSET_VERSION}/${entry.sha256}/${entry.path}`,
      sha256: entry.sha256, bytes: entry.bytes, width: entry.width, height: entry.height,
      contentType: 'image/webp', requiresAlpha: entry.role === 'placement', publishable: false })) };
  await writeOwnedFile(path.join(destination, 'upload-plan.json'), `${JSON.stringify(uploadPlan, null, 2)}\n`);
  return { mode: 'development-only', assetVersion: ASSET_VERSION, files: entries.length, createdFiles, unchangedFiles,
    originalBytesForIncludedSources: manifest.files.filter(file => file.developmentCopy).reduce((n, file) => n + file.bytes, 0),
    derivativeBytes: entries.reduce((n, entry) => n + entry.bytes, 0), sourceInventorySha256: audit.sourceInventorySha256,
    excludedIssues: ASSET_ISSUES.map(issue => issue.id), productionReady: false, databaseConnections: false, networkRequests: false };
}
