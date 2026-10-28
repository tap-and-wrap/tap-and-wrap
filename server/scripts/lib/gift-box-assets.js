// Offline asset tooling only: no runtime configuration, database or provider imports.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ASSET_ISSUES, ASSET_VERSION, ASSET_CATALOG_VERSION, CATALOG_VERSION, FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';

export const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SOURCE_ROOT = path.join(PROJECT_ROOT, 'local-data', 'taw-giftbox');
export const DEVELOPMENT_ROOT = path.join(PROJECT_ROOT, 'client', '.gift-box-assets');
export const MANIFEST_FILE = new URL('../../../shared/gift-box/asset-manifest.v2.json', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safeAssetPath = /^(?:boxes|flowers|toys|ribbons|chocolate)\/[a-z0-9-]+\.(?:webp|jpeg)$/;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const inventoryHash = files => sha256(files.map(file => `${file.path}\t${file.sha256}`).sort().join('\n'));

export function containedPath(root, relative) {
  if (!safeAssetPath.test(relative)) throw new Error('Unsafe gift-box asset path.');
  const target = path.resolve(root, ...relative.split('/'));
  const relationship = path.relative(path.resolve(root), target);
  if (!relationship || relationship.startsWith('..') || path.isAbsolute(relationship)) throw new Error('Unsafe gift-box asset path.');
  return target;
}

export async function assertNoLinks(target) {
  // Walk ancestors as well: an apparently safe child can sit below a junction.
  let current = path.resolve(target);
  while (true) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('Gift-box asset paths must not contain links or junctions.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const resolved = await realpath(target);
  if (path.relative(path.resolve(target), resolved) !== '') throw new Error('Gift-box path resolution changed.');
}

export async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
}

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.catalogVersion !== ASSET_CATALOG_VERSION || manifest.assetVersion !== ASSET_VERSION
    || !Array.isArray(manifest.files) || manifest.files.length !== 99) throw new Error('Gift-box manifest version or inventory is invalid.');
  const paths = new Set();
  for (const file of manifest.files) {
    if (!safeAssetPath.test(file.path) || paths.has(file.path) || !hash(file.sha256) || !hash(file.decodedPixelSha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 10485760
      || ![file.width, file.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)
      || typeof file.hasAlpha !== 'boolean' || file.productionApproved !== false) throw new Error('Gift-box manifest contains an invalid asset.');
    const component = FIXED_COMPONENTS.find(item => item.selectionAsset === file.path || item.placementAsset === file.path);
    const role = component ? (component.selectionAsset === file.path ? 'selection' : 'placement') : 'reference-only';
    const issues = ASSET_ISSUES.filter(issue => issue.source === file.path);
    if (file.role !== role || file.componentId !== (component?.id ?? null)
      || file.developmentCopy !== (Boolean(component) && !issues.some(issue => issue.blocksDevelopmentCopy))
      || JSON.stringify(file.issueIds) !== JSON.stringify(issues.map(issue => issue.id))) throw new Error('Gift-box asset role or issue policy changed.');
    paths.add(file.path);
  }
  const refs = FIXED_COMPONENTS.flatMap(component => [component.selectionAsset, component.placementAsset]).filter(Boolean);
  if (refs.length !== 84 || new Set(refs).size !== refs.length || refs.some(ref => !paths.has(ref))) throw new Error('Gift-box component asset mappings are invalid.');
  if (FIXED_COMPONENTS.filter(component => component.placementAsset).some(component => !manifest.files.find(file => file.path === component.placementAsset)?.hasAlpha)) throw new Error('Gift-box placement artwork must contain alpha.');
  if (inventoryHash(manifest.files) !== manifest.sourceInventorySha256) throw new Error('Gift-box inventory checksum is invalid.');
  return true;
}

export async function inspectImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > 10485760) throw new Error('Invalid gift-box image size.');
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 4096 * 4096, animated: false });
  const metadata = await image.metadata();
  if (!['webp', 'jpeg'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Unsupported gift-box image format.');
  if (metadata.format === 'webp' && (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP'
    || bytes.readUInt32LE(4) + 8 !== bytes.length)) throw new Error('Incomplete gift-box WebP container.');
  if (metadata.format === 'jpeg' && bytes.subarray(-2).toString('hex') !== 'ffd9') throw new Error('Incomplete gift-box JPEG container.');
  const { data, info } = await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0, partialAlphaPixels = 0;
  const bounds = [info.width, info.height, -1, -1];
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (!alpha) transparentPixels++;
    else {
      if (alpha < 255) partialAlphaPixels++;
      const pixel = index / 4, x = pixel % info.width, y = Math.floor(pixel / info.width);
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
    }
  }
  return { format: metadata.format, width: info.width, height: info.height, bytes: bytes.length,
    hasAlpha: metadata.hasAlpha, transparentPixels, partialAlphaPixels, visibleBounds: bounds,
    sha256: sha256(bytes), decodedPixelSha256: sha256(data) };
}

async function sourceFiles(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const info = await lstat(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error('Gift-box source collection contains a link or junction.');
    if (entry.isDirectory()) result.push(...await sourceFiles(root, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error('Gift-box source collection contains an unsupported entry.');
  }
  return result.sort();
}

export async function auditAssetCollection({ root = SOURCE_ROOT, manifest } = {}) {
  manifest ??= await readManifest();
  validateManifest(manifest);
  await assertNoLinks(root);
  const actual = await sourceFiles(root), expected = manifest.files.map(file => file.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Gift-box source inventory differs from the reviewed manifest; missing or unexpected files require review.');
  const files = [];
  for (const expectedFile of manifest.files) {
    const target = containedPath(root, expectedFile.path);
    await assertNoLinks(target);
    let current;
    try { current = await inspectImage(await readFile(target)); }
    catch { throw new Error(`Gift-box image decoding failed: ${expectedFile.path}`); }
    for (const field of ['format', 'width', 'height', 'bytes', 'hasAlpha', 'transparentPixels', 'partialAlphaPixels', 'visibleBounds', 'sha256', 'decodedPixelSha256']) {
      if (JSON.stringify(current[field]) !== JSON.stringify(expectedFile[field])) throw new Error(`Gift-box source changed: ${expectedFile.path} (${field}).`);
    }
    if (expectedFile.role === 'placement' && (!current.hasAlpha || current.transparentPixels === 0 || current.visibleBounds[2] < 0)) throw new Error(`Gift-box placement requires visible artwork and transparent background: ${expectedFile.path}`);
    files.push({ path: expectedFile.path, ...current });
  }
  const duplicates = field => {
    const groups = new Map();
    for (const file of files) groups.set(file[field], [...(groups.get(file[field]) || []), file.path]);
    return [...groups.values()].filter(group => group.length > 1);
  };
  const duplicateFiles = duplicates('sha256'), duplicatePixels = duplicates('decodedPixelSha256');
  if (duplicateFiles.length || duplicatePixels.length) throw new Error('Gift-box collection contains duplicate artwork requiring review.');
  return { valid: true, assetVersion: ASSET_VERSION, catalogVersion: CATALOG_VERSION, sourceInventorySha256: inventoryHash(files),
    fileCount: files.length, componentCount: FIXED_COMPONENTS.length, totalBytes: files.reduce((n, file) => n + file.bytes, 0),
    alphaImageCount: files.filter(file => file.hasAlpha).length, duplicateFiles, duplicatePixels,
    productionReady: false, openAssetIssues: ASSET_ISSUES,
    referenceOnlyFiles: manifest.files.filter(file => file.role === 'reference-only').length,
    developmentSources: manifest.files.filter(file => file.developmentCopy).length,
    unreviewedMappedAssets: manifest.files.filter(file => file.role !== 'reference-only').length };
}
