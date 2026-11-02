// Reconcile independently versioned local gift-box derivatives. READ ONLY.
// This is not an approval mechanism, uploader, or production manifest.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { FIXED_COMPONENTS, ASSET_VERSION, ASSET_ISSUES, CATALOG_VERSION } from '../../../shared/gift-box/definitions.mjs';
import { RIBBON_BOW_FILES, RIBBON_BOW_VERSION } from '../../../shared/gift-box/ribbon-bows.mjs';
import { BOX1_OVERLAY } from '../../../shared/gift-box/box1-overlay.mjs';
import { auditAssetCollection, assertNoLinks, DEVELOPMENT_ROOT, inspectImage, PROJECT_ROOT, readManifest, sha256, SOURCE_ROOT } from './gift-box-assets.js';
import { TRANSFORM_VERSION } from './prepare-gift-box-assets.js';

const SHA = /^[0-9a-f]{64}$/;
const standardRoot = path.join(DEVELOPMENT_ROOT, ASSET_VERSION, TRANSFORM_VERSION);
const bowRoot = path.join(DEVELOPMENT_ROOT, RIBBON_BOW_VERSION);
const bowSourceRoot = path.join(PROJECT_ROOT, 'local-data', 'taw-giftbox-bows', 'ribbons');
const box1Root = path.join(DEVELOPMENT_ROOT, BOX1_OVERLAY.version);
const candidateFile = path.join(PROJECT_ROOT, 'server', '.cache', 'gift-box-phase4', 'box-1-candidate', BOX1_OVERLAY.candidateVersion, BOX1_OVERLAY.candidateFilename);
const pixelFields = ['format', 'width', 'height', 'bytes', 'hasAlpha', 'transparentPixels', 'partialAlphaPixels', 'visibleBounds', 'sha256', 'decodedPixelSha256'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validate = (truth, message) => { if (!truth) throw new Error(`Gift-box media readiness: ${message}`); };

export async function verifyPinnedImage(file, record, { requirePlacementAlpha = false } = {}) {
  validate(record && typeof record === 'object' && SHA.test(record.sha256), 'image manifest lacks a pinned hash.');
  await assertNoLinks(file);
  const bytes = await readFile(file);
  validate(bytes.length === record.bytes && sha256(bytes) === record.sha256, 'image bytes differ from the pinned manifest.');
  const meta = await inspectImage(bytes);
  for (const field of pixelFields) if (Object.hasOwn(record, field)) {
    validate(same(meta[field], record[field]), `image metadata differs: ${field}.`);
  }
  if (requirePlacementAlpha) validate(meta.hasAlpha && meta.transparentPixels > 0, 'placement image has no transparent background.');
  return meta;
}

async function readPinnedJson(root, filename) {
  const file = path.join(root, filename);
  await assertNoLinks(file);
  const result = JSON.parse(await readFile(file, 'utf8'));
  validate(result && typeof result === 'object' && !Array.isArray(result), 'invalid local JSON manifest.');
  return result;
}

async function exactFilenames(root, names) {
  await assertNoLinks(root);
  const actual = (await readdir(root, { withFileTypes: true })).map(entry => {
    validate(entry.isFile(), 'unexpected directory or linked item in media collection.');
    return entry.name;
  }).sort();
  validate(same(actual, [...names].sort()), 'media directory contains missing or unexpected files.');
}

async function exactDerivativeTree(root, expectedNames) {
  await assertNoLinks(root);
  const actual=[];
  async function walk(folder, prefix='') {
    for (const entry of await readdir(folder, { withFileTypes:true })) {
      const rel=prefix ? `${prefix}/${entry.name}` : entry.name;
      validate(!entry.isSymbolicLink(), 'linked derivative found in local collection.');
      await assertNoLinks(path.join(folder, entry.name));
      if (entry.isDirectory()) await walk(path.join(folder,entry.name),rel);
      else { validate(entry.isFile(), 'unsupported derivative filesystem entry.'); actual.push(rel); }
    }
  }
  await walk(root);
  validate(same(actual.sort(), [...expectedNames].sort()), 'unexpected or missing development derivative files.');
}

const derivativeLocation = (root, relative) => {
  validate(/^(?:320|640|1200)\/(?:boxes|flowers|toys|chocolate|ribbons)\/[a-z0-9-]+\.webp$/.test(relative), 'unexpected derivative path.');
  const target = path.resolve(root, ...relative.split('/'));
  validate(path.relative(root, target) !== '' && !path.relative(root, target).startsWith('..') && !path.isAbsolute(path.relative(root, target)), 'derivative escapes local root.');
  return target;
};

const expectedStandard = () => {
  const expected = new Map();
  for (const component of FIXED_COMPONENTS) for (const role of ['selection', 'placement']) {
    const source = component[`${role}Asset`];
    if (!source || ASSET_ISSUES.some(issue => issue.source === source && issue.blocksDevelopmentCopy)) continue;
    for (const width of role === 'selection' ? [320, 640] : [1200]) {
      expected.set(`${width}/${source}`, { componentId: component.id, role, source });
    }
  }
  return expected;
};

async function standardAssets({ root, originalManifest }) {
  const manifest = await readPinnedJson(root, 'development-manifest.json');
  validate(manifest.schemaVersion === 1 && manifest.assetVersion === ASSET_VERSION && manifest.catalogVersion === originalManifest.catalogVersion
    && manifest.transformVersion === TRANSFORM_VERSION && manifest.sourceInventorySha256 === originalManifest.sourceInventorySha256
    && manifest.developmentOnly === true && manifest.productionApproved === false && Array.isArray(manifest.entries),
  'ordinary derivative manifest version, inventory or release gate changed.');
  validate(same(manifest.excludedIssues, ASSET_ISSUES), 'original source-issue exclusion changed.');
  const expected = expectedStandard();
  validate(expected.size === 115 && manifest.entries.length === expected.size, 'derivative inventory changed from 115 reviewed slots.');
  const seen = new Set(); const report = [];
  for (const entry of manifest.entries) {
    const id = expected.get(entry.path);
    validate(id && !seen.has(entry.path) && same({componentId: entry.componentId, role: entry.role, source: entry.source}, id),
      'unexpected, duplicate or mismapped derivative identity.');
    const original = originalManifest.files.find(item => item.path === entry.source);
    validate(original && original.developmentCopy && original.sha256 === entry.sourceSha256 && entry.productionApproved === false,
      'derivative source identity, source hash or approval changed.');
    await verifyPinnedImage(derivativeLocation(root, entry.path), entry, { requirePlacementAlpha: entry.role === 'placement' });
    report.push({ componentId:entry.componentId, role:entry.role, relative:entry.path, sha256:entry.sha256, bytes:entry.bytes });
    seen.add(entry.path);
  }
  validate(seen.size === expected.size, 'not all known artwork slots are covered.');
  await exactDerivativeTree(root, [...expected.keys(),'development-manifest.json','upload-plan.json']);
  const plan = await readPinnedJson(root, 'upload-plan.json');
  validate(plan.schemaVersion === 1 && plan.mode === 'offline-plan-only' && plan.uploadAuthorized === false && plan.productionReady === false
    && plan.assetVersion === ASSET_VERSION && plan.sourceInventorySha256 === originalManifest.sourceInventorySha256
    && Array.isArray(plan.entries) && plan.entries.length === report.length, 'existing derivative upload plan is incomplete or unexpectedly authorized.');
  const planned = new Map(plan.entries.map(entry => [entry.localDerivative, entry]));
  validate(planned.size === report.length, 'duplicate derivative in upload plan.');
  for (const item of report) {
    const entry = planned.get(item.relative);
    validate(entry && entry.componentId === item.componentId && entry.role === item.role && entry.sha256 === item.sha256
      && entry.bytes === item.bytes && entry.publishable === false && entry.contentType === 'image/webp',
    'upload-plan hash, identity or release gate changed.');
  }
  return report;
}

async function ribbonAssets({ sourceRoot, preparedRoot }) {
  const manifest = await readPinnedJson(preparedRoot, 'development-manifest.json');
  validate(manifest.version === RIBBON_BOW_VERSION && manifest.developmentOnly === true && manifest.productionApproved === false
    && Array.isArray(manifest.entries) && manifest.entries.length === RIBBON_BOW_FILES.length, 'bow manifest or approval flag changed.');
  const names = RIBBON_BOW_FILES.map(item => item.filename);
  await exactFilenames(sourceRoot, names);
  await exactFilenames(preparedRoot, [...names, 'development-manifest.json']);
  const entries = new Map(manifest.entries.map(item => [item.filename, item]));
  validate(entries.size === 21, 'duplicate bow manifest filenames.');
  const report = [];
  for (const bow of RIBBON_BOW_FILES) {
    const entry = entries.get(bow.filename);
    validate(entry && entry.componentId === bow.componentId, 'bow identity does not match approved color registry.');
    const source = await verifyPinnedImage(path.join(sourceRoot, bow.filename), entry);
    const copy = await verifyPinnedImage(path.join(preparedRoot, bow.filename), entry);
    validate(source.format === 'webp' && source.hasAlpha && source.transparentPixels > 1000
      && source.width >= 512 && source.height >= 512 && same(source, copy), 'ribbon image format/alpha/size does not match prepared copy.');
    report.push({ componentId:bow.componentId, role:'bow', relative:bow.filename, sha256:entry.sha256, bytes:entry.bytes });
  }
  return report;
}

async function box1Asset({ root, candidate }) {
  const manifest = await readPinnedJson(root, 'development-manifest.json');
  validate(manifest.schemaVersion === 1 && manifest.version === BOX1_OVERLAY.version && manifest.componentId === BOX1_OVERLAY.componentId
    && manifest.role === BOX1_OVERLAY.role && manifest.developmentOnly === true && manifest.productionApproved === false
    && manifest.publicationAuthorized === false && manifest.geometryApproved === false && manifest.original?.manifestUnchanged === true
    && manifest.original.path === BOX1_OVERLAY.originalPath && manifest.original.sha256 === BOX1_OVERLAY.originalSha256,
    'Box 1 corrected overlay release gates or source identity changed.');
  validate(manifest.candidate?.sha256 === BOX1_OVERLAY.candidateSha256
    && manifest.candidate?.decodedPixelSha256 === BOX1_OVERLAY.candidatePixelSha256
    && manifest.candidate?.invariantPassed === true && manifest.candidate?.alphaChanges === 0
    && manifest.candidate?.visibleRgbaChanges === 0 && manifest.candidate?.clearedHiddenRgbPixels === 96750,
    'Box 1 correction evidence changed.');
  await assertNoLinks(candidate);
  validate(sha256(await readFile(candidate)) === BOX1_OVERLAY.candidateSha256, 'Box 1 corrected PNG candidate differs from pinned bytes.');
  validate(manifest.derivative?.path === BOX1_OVERLAY.derivativePath, 'Box 1 overlay derivative path changed.');
  await exactDerivativeTree(root, ['development-manifest.json', BOX1_OVERLAY.derivativePath]);
  const derivative = await verifyPinnedImage(derivativeLocation(root, BOX1_OVERLAY.derivativePath), manifest.derivative, { requirePlacementAlpha:true });
  validate(derivative.width === 1200 && derivative.format === 'webp', 'Box 1 development derivative has wrong output format/width.');
  return [{ componentId:BOX1_OVERLAY.componentId, role:'placement-overlay', relative:BOX1_OVERLAY.derivativePath,
    sha256:derivative.sha256, bytes:derivative.bytes }];
}

export async function auditGiftBoxMediaReadiness({ sourceRoot = SOURCE_ROOT, ordinaryRoot = standardRoot,
  ribbonsSourceRoot = bowSourceRoot, ribbonsPreparedRoot = bowRoot, box1OverlayRoot = box1Root,
  box1Candidate = candidateFile } = {}) {
  const pinned = await readManifest();
  await auditAssetCollection({ root:sourceRoot, manifest:pinned });
  // The original 99-image asset manifest is deliberately still blocked, even when
  // a safe Box 1 development overlay exists. Never convert this to production approval.
  const original = pinned.files.find(item => item.path === BOX1_OVERLAY.originalPath);
  validate(original?.sha256 === BOX1_OVERLAY.originalSha256 && original.developmentCopy === false && original.productionApproved === false,
    'original Box 1 blocker or source pin changed.');
  const [standard, bows, overlay] = await Promise.all([
    standardAssets({ root:ordinaryRoot, originalManifest:pinned }),
    ribbonAssets({ sourceRoot:ribbonsSourceRoot, preparedRoot:ribbonsPreparedRoot }),
    box1Asset({ root:box1OverlayRoot, candidate:box1Candidate }),
  ]);
  const entries = [...standard, ...bows, ...overlay].sort((a,b) =>
    a.componentId.localeCompare(b.componentId,'en',{numeric:true}) || a.role.localeCompare(b.role) || a.relative.localeCompare(b.relative));
  const digest = sha256(Buffer.from(entries.map(item => [item.componentId,item.role,item.relative,item.sha256,item.bytes].join('\t')).join('\n')));
  return { schemaVersion:1, mode:'offline-read-only-reconciliation', builderCatalogVersion:CATALOG_VERSION, assetCatalogVersion:pinned.catalogVersion,
    originalAssetVersion:ASSET_VERSION, originalInventorySha256:pinned.sourceInventorySha256,
    bowVersion:RIBBON_BOW_VERSION, box1OverlayVersion:BOX1_OVERLAY.version,
    counts:{ originalSourceImages:99, mappedOriginalImages:84, referenceOnlyOriginals:15,
      normalDerivativeFiles:standard.length, ribbonSourceAndCopyPairs:bows.length, correctedBox1Derivatives:overlay.length,
      consolidatedDevelopmentMedia:entries.length },
    manifestDigestSha256:digest, developmentMediaIntegrityVerified:true,
    productionReady:false, publicationAuthorized:false, geometryApproved:false,
    releaseBlockers:['Original Box 1 source remains blocked; corrected overlay is development-only.',
      '84 mapped assets and 21 bows do not have production artwork-approval records.',
      'Physical geometry, fulfillment, commercial prices, private personalization and controlled release remain separate gates.'],
    databaseConnections:false, networkRequests:false, writes:false, entries };
}
