// Offline, local-only Box 1 corrected-artwork overlay. Never edits the pinned
// 99-file source inventory, source manifest or original artwork.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { BOX1_OVERLAY } from '../../../shared/gift-box/box1-overlay.mjs';
import { BOX1_CANDIDATE_DIRECTORY, BOX1_SOURCE_PIN, compareCandidatePixels } from './box-1-candidate.js';
import { assertNoLinks, auditAssetCollection, containedPath, DEVELOPMENT_ROOT, PROJECT_ROOT, readManifest, sha256, SOURCE_ROOT, inspectImage } from './gift-box-assets.js';
import { safeDirectory, writeOwnedFile } from './prepare-gift-box-assets.js';

const cacheRoot = path.join(PROJECT_ROOT, 'server', '.cache');
const within = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
};

export async function prepareBox1Overlay({ sourceRoot = SOURCE_ROOT, candidateFile = path.join(BOX1_CANDIDATE_DIRECTORY, BOX1_OVERLAY.candidateFilename), outputRoot = DEVELOPMENT_ROOT } = {}) {
  // Alternate paths are permitted only for isolated test fixtures under server/.cache.
  if (path.resolve(sourceRoot) !== path.resolve(SOURCE_ROOT) && !within(cacheRoot, sourceRoot)) throw new Error('Box 1 source must be the pinned local collection or a cache test fixture.');
  if (path.resolve(candidateFile) !== path.resolve(path.join(BOX1_CANDIDATE_DIRECTORY, BOX1_OVERLAY.candidateFilename)) && !within(cacheRoot, candidateFile)) throw new Error('Box 1 candidate must be the pinned local candidate or a cache test fixture.');
  if (path.resolve(outputRoot) !== path.resolve(DEVELOPMENT_ROOT) && !within(cacheRoot, outputRoot)) throw new Error('Box 1 output must be an ignored development or cache test directory.');

  const manifest = await readManifest();
  const sourceEntry = manifest.files.find(item => item.path === BOX1_OVERLAY.originalPath);
  if (!sourceEntry || sourceEntry.sha256 !== BOX1_OVERLAY.originalSha256 || sourceEntry.developmentCopy !== false
    || sourceEntry.productionApproved !== false || !sourceEntry.issueIds.includes('box-1-right-edge-remnants')
    || BOX1_SOURCE_PIN.sha256 !== BOX1_OVERLAY.originalSha256) throw new Error('Original Box 1 must remain pinned and blocked in the historic source manifest.');
  // Validate all 99 source images *before* writing a derivative when using real sources.
  if (path.resolve(sourceRoot) === path.resolve(SOURCE_ROOT)) await auditAssetCollection({ root: sourceRoot, manifest });

  const sourcePath = containedPath(sourceRoot, BOX1_OVERLAY.originalPath);
  await assertNoLinks(sourcePath);
  await assertNoLinks(candidateFile);
  const source = await readFile(sourcePath), png = await readFile(candidateFile);
  if (sha256(source) !== BOX1_OVERLAY.originalSha256 || sha256(png) !== BOX1_OVERLAY.candidateSha256) throw new Error('Pinned Box 1 source or candidate hash mismatch.');
  const options = { limitInputPixels: 4096 * 4096, failOn: 'warning', animated: false };
  const sourceImage = sharp(source, options), candidateImage = sharp(png, options);
  const [sourceMeta, candidateMeta] = await Promise.all([sourceImage.metadata(), candidateImage.metadata()]);
  if (sourceMeta.format !== 'webp' || candidateMeta.format !== 'png' || !sourceMeta.hasAlpha || !candidateMeta.hasAlpha
    || [sourceMeta.width, sourceMeta.height, candidateMeta.width, candidateMeta.height].join(',') !== [BOX1_OVERLAY.width, BOX1_OVERLAY.height, BOX1_OVERLAY.width, BOX1_OVERLAY.height].join(',')) {
    throw new Error('Box 1 corrected artwork format, dimensions or alpha changed.');
  }
  const [sourceRgba, candidateRgba] = await Promise.all([
    sharp(source, options).toColourspace('srgb').ensureAlpha().raw().toBuffer(),
    sharp(png, options).toColourspace('srgb').ensureAlpha().raw().toBuffer(),
  ]);
  const comparison = compareCandidatePixels(sourceRgba, candidateRgba, BOX1_OVERLAY.width, BOX1_OVERLAY.height);
  if (!comparison.invariantPassed || comparison.alphaChanges !== 0 || comparison.visibleRgbaChanges !== 0
    || comparison.partiallyTransparentRgbaChanges !== 0 || comparison.remainingHiddenRgbPixels !== 0
    || comparison.clearedHiddenRgbPixels !== 96750 || sha256(candidateRgba) !== BOX1_OVERLAY.candidatePixelSha256) {
    throw new Error('Box 1 candidate did not preserve the pinned visible-pixel/alpha invariant.');
  }
  const encoded = await sharp(png, options).resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 100, effort: 5 }).toBuffer();
  const derivative = await inspectImage(encoded);
  if (derivative.format !== 'webp' || !derivative.hasAlpha || derivative.transparentPixels === 0 || derivative.width !== 1200) {
    throw new Error('Box 1 development derivative lost transparency or dimensions.');
  }
  const directory = path.join(outputRoot, BOX1_OVERLAY.version);
  await safeDirectory(directory);
  const target = path.join(directory, ...BOX1_OVERLAY.derivativePath.split('/'));
  const created = (await writeOwnedFile(target, encoded)) === 'created';
  const developmentManifest = {
    schemaVersion: 1, version: BOX1_OVERLAY.version, componentId: BOX1_OVERLAY.componentId, role: BOX1_OVERLAY.role,
    developmentOnly: true, productionApproved: false, publicationAuthorized: false, geometryApproved: false,
    original: { path: BOX1_OVERLAY.originalPath, sha256: BOX1_OVERLAY.originalSha256, manifestUnchanged: true },
    candidate: { version: BOX1_OVERLAY.candidateVersion, filename: BOX1_OVERLAY.candidateFilename,
      sha256: BOX1_OVERLAY.candidateSha256, decodedPixelSha256: BOX1_OVERLAY.candidatePixelSha256,
      width: BOX1_OVERLAY.width, height: BOX1_OVERLAY.height, invariantPassed: true,
      clearedHiddenRgbPixels: comparison.clearedHiddenRgbPixels, alphaChanges: comparison.alphaChanges,
      visibleRgbaChanges: comparison.visibleRgbaChanges },
    derivative: { path: BOX1_OVERLAY.derivativePath, ...derivative },
  };
  await writeOwnedFile(path.join(directory, 'development-manifest.json'), Buffer.from(`${JSON.stringify(developmentManifest, null, 2)}\n`));
  if (sha256(await readFile(sourcePath)) !== BOX1_OVERLAY.originalSha256) throw new Error('Original Box 1 changed during preparation.');
  return { mode: 'isolated-development-only', version: BOX1_OVERLAY.version,
    created, unchanged: !created, originalSourceUnchanged: true, historicManifestUnchanged: true,
    visibleRgbaChanges: 0, alphaChanges: 0, clearedHiddenRgbPixels: comparison.clearedHiddenRgbPixels,
    derivative, productionApproved: false, uploadAuthorized: false,
    databaseConnections: false, networkRequests: false };
}
