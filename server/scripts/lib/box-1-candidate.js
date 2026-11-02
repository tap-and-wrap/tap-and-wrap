// Exact offline pixel correction. No application configuration, database or provider imports.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { assertNoLinks, containedPath, PROJECT_ROOT, readManifest, sha256, SOURCE_ROOT } from './gift-box-assets.js';
import { safeDirectory, writeOwnedFile } from './prepare-gift-box-assets.js';

export const BOX1_CANDIDATE_VERSION = 'alpha-rgb-candidate-v1';
export const BOX1_SOURCE_PIN = Object.freeze({
  path: 'boxes/box-1-open-top.webp', format: 'webp', width: 1453, height: 1083,
  sha256: '8d0944c0d98ffa3e685c56863316c3163398d88e06c1cc572d5ec7d81544b55d',
  decodedPixelSha256: 'a9b84ed3cbb832a68dd1b3bb8edcd462cd04f808a1134213afbc5b7e598ddd92',
});
export const BOX1_CANDIDATE_DIRECTORY = path.join(PROJECT_ROOT, 'server', '.cache', 'gift-box-phase4', 'box-1-candidate', BOX1_CANDIDATE_VERSION);

function assertRgba(data, width, height) {
  if (!Buffer.isBuffer(data) || ![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 4096)
    || data.length !== width * height * 4) throw new Error('Candidate requires one bounded, complete RGBA image.');
}

export function clearTransparentRgb(data, width, height) {
  assertRgba(data, width, height);
  const output = Buffer.from(data);
  for (let index = 0; index < output.length; index += 4) {
    if (output[index + 3] === 0) output.fill(0, index, index + 3);
  }
  return output;
}

export function compareCandidatePixels(original, candidate, width, height) {
  assertRgba(original, width, height); assertRgba(candidate, width, height);
  const result = { totalPixels: width * height, transparentPixels: 0, visiblePixels: 0, partiallyTransparentPixels: 0,
    changedPixels: 0, changedChannels: 0, alphaChanges: 0, visibleRgbaChanges: 0, partiallyTransparentRgbaChanges: 0,
    clearedHiddenRgbPixels: 0, remainingHiddenRgbPixels: 0, rightStripHiddenRgbBefore: 0, rightStripHiddenRgbAfter: 0 };
  for (let index = 0; index < original.length; index += 4) {
    const alpha = original[index + 3], changed = [0, 1, 2, 3].some(channel => original[index + channel] !== candidate[index + channel]);
    const channels = [0, 1, 2, 3].filter(channel => original[index + channel] !== candidate[index + channel]).length;
    const oldHidden = alpha === 0 && Boolean(original[index] || original[index + 1] || original[index + 2]);
    const newHidden = candidate[index + 3] === 0 && Boolean(candidate[index] || candidate[index + 1] || candidate[index + 2]);
    if (alpha === 0) result.transparentPixels++; else result.visiblePixels++;
    if (alpha > 0 && alpha < 255) { result.partiallyTransparentPixels++; if (changed) result.partiallyTransparentRgbaChanges++; }
    if (changed) { result.changedPixels++; result.changedChannels += channels; if (alpha > 0) result.visibleRgbaChanges++; }
    if (alpha !== candidate[index + 3]) result.alphaChanges++;
    if (oldHidden && !newHidden) result.clearedHiddenRgbPixels++;
    if (newHidden) result.remainingHiddenRgbPixels++;
    if ((index / 4) % width >= 1303) {
      if (oldHidden) result.rightStripHiddenRgbBefore++;
      if (newHidden) result.rightStripHiddenRgbAfter++;
    }
  }
  return { ...result, invariantPassed: result.alphaChanges === 0 && result.visibleRgbaChanges === 0
    && result.remainingHiddenRgbPixels === 0 && result.changedPixels === result.clearedHiddenRgbPixels };
}

async function decodeRgba(bytes) {
  return sharp(bytes, { failOn: 'warning', limitInputPixels: 4096 * 4096, animated: false })
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

export async function buildAlphaCandidate(bytes, pin = BOX1_SOURCE_PIN) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 10485760 || sha256(bytes) !== pin.sha256) throw new Error('Candidate source hash differs from the pinned original.');
  const metadata = await sharp(bytes, { failOn: 'warning', limitInputPixels: 4096 * 4096, animated: false }).metadata();
  if (metadata.format !== pin.format || metadata.width !== pin.width || metadata.height !== pin.height || (metadata.pages || 1) !== 1 || !metadata.hasAlpha) throw new Error('Candidate source dimensions, format or alpha differ from the pinned original.');
  const { data, info } = await decodeRgba(bytes);
  if (sha256(data) !== pin.decodedPixelSha256) throw new Error('Candidate decoded source differs from the pinned original pixels.');
  const corrected = clearTransparentRgb(data, info.width, info.height);
  const png = await sharp(corrected, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
  const decoded = await decodeRgba(png);
  if (!decoded.data.equals(corrected)) throw new Error('Candidate encoding changed the exact corrected RGBA pixels.');
  const comparison = compareCandidatePixels(data, decoded.data, info.width, info.height);
  if (!comparison.invariantPassed) throw new Error('Candidate violated the conservative pixel invariant.');
  return { png, originalRgba: data, candidateRgba: decoded.data, width: info.width, height: info.height, comparison };
}

export function compositePreview(data, width, height, background) {
  assertRgba(data, width, height);
  if (!['light', 'dark', 'checkerboard'].includes(background)) throw new Error('Unknown candidate preview background.');
  const output = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const x = pixel % width, y = Math.floor(pixel / width), index = pixel * 4;
    const matte = background === 'light' ? 255 : background === 'dark' ? 32 : (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? 220 : 255;
    const alpha = data[index + 3] / 255;
    for (let channel = 0; channel < 3; channel++) output[pixel * 3 + channel] = Math.round(data[index + channel] * alpha + matte * (1 - alpha));
  }
  return output;
}

export async function prepareBox1Candidate() {
  const manifest = await readManifest(), entry = manifest.files.find(file => file.path === BOX1_SOURCE_PIN.path);
  if (!entry || Object.entries(BOX1_SOURCE_PIN).some(([key, value]) => entry[key] !== value)
    || entry.developmentCopy !== false || entry.productionApproved !== false || !entry.issueIds.includes('box-1-right-edge-remnants')) throw new Error('The manifest no longer pins the blocked original box-1 source.');
  const source = containedPath(SOURCE_ROOT, BOX1_SOURCE_PIN.path);
  await assertNoLinks(source);
  const original = await readFile(source), result = await buildAlphaCandidate(original);
  await safeDirectory(BOX1_CANDIDATE_DIRECTORY);
  const candidateName = `box-1-open-top-${BOX1_CANDIDATE_VERSION}.png`;
  await writeOwnedFile(path.join(BOX1_CANDIDATE_DIRECTORY, candidateName), result.png);
  const previews = [], panels = [];
  const tileWidth = 600, tileHeight = Math.round(result.height / result.width * tileWidth), labelHeight = 46;
  for (const [row, background] of ['light', 'dark', 'checkerboard'].entries()) {
    let beforeHash;
    for (const [column, [kind, rgba]] of [['original', result.originalRgba], ['candidate', result.candidateRgba]].entries()) {
      const composited = compositePreview(rgba, result.width, result.height, background);
      const preview = await sharp(composited, { raw: { width: result.width, height: result.height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
      const name = `box-1-${kind}-${background}-${BOX1_CANDIDATE_VERSION}.png`;
      await writeOwnedFile(path.join(BOX1_CANDIDATE_DIRECTORY, name), preview);
      const pixelHash = sha256(composited);
      if (kind === 'original') beforeHash = pixelHash;
      else if (pixelHash !== beforeHash) throw new Error('Candidate changed its composited appearance.');
      previews.push({ file: name, background, kind, sha256: sha256(preview), compositedPixelSha256: pixelHash });
      panels.push({ input: await sharp(preview).resize({ width: tileWidth }).png().toBuffer(), left: column * tileWidth, top: row * (tileHeight + labelHeight) + labelHeight });
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="${tileWidth}" height="${labelHeight}" fill="#FFFCFB"/><text x="14" y="20" font-size="16" fill="#62483F">BOX-1 ${kind.toUpperCase()} / ${background}</text><text x="14" y="38" font-size="13" fill="#62483F">${kind === 'candidate' ? 'VERSIONED CANDIDATE / OWNER APPROVAL PENDING' : 'UNCHANGED ORIGINAL / CURRENTLY BLOCKED'}</text></svg>`);
      panels.push({ input: label, left: column * tileWidth, top: row * (tileHeight + labelHeight) });
    }
  }
  await writeOwnedFile(path.join(BOX1_CANDIDATE_DIRECTORY, `box-1-review-${BOX1_CANDIDATE_VERSION}.png`), await sharp({ create: { width: tileWidth * 2, height: (tileHeight + labelHeight) * 3, channels: 3, background: '#FFFFFF' } }).composite(panels).png().toBuffer());
  // Re-read after generation: the source is never a write destination.
  if (sha256(await readFile(source)) !== BOX1_SOURCE_PIN.sha256) throw new Error('Original source changed during candidate generation.');
  const report = { schemaVersion: 1, candidateVersion: BOX1_CANDIDATE_VERSION, status: 'pending-owner-review', productionApproved: false,
    source: BOX1_SOURCE_PIN, originalSourceUnchanged: true, authoritativeManifestUnchanged: true,
    candidate: { file: candidateName, format: 'png', bytes: result.png.length, width: result.width, height: result.height, sha256: sha256(result.png), decodedPixelSha256: sha256(result.candidateRgba) },
    operation: 'RGB set to zero only where decoded source alpha equals zero; all other RGBA bytes preserved exactly.',
    comparison: result.comparison, compositeAppearancesIdentical: true, previews,
    originalAssetBlockRetained: true, manifestUpdated: false, developmentAssetMappingUpdated: false, networkRequests: false, databaseConnections: false };
  await writeOwnedFile(path.join(BOX1_CANDIDATE_DIRECTORY, `pixel-comparison-${BOX1_CANDIDATE_VERSION}.json`), Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
  return report;
}
