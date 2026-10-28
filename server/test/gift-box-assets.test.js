import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ASSET_VERSION } from '../../shared/gift-box/definitions.mjs';
import { auditAssetCollection, containedPath, inspectImage, inventoryHash, PROJECT_ROOT, readManifest, sha256, validateManifest } from '../scripts/lib/gift-box-assets.js';
import { prepareDevelopmentAssets, TRANSFORM_VERSION, writeOwnedFile } from '../scripts/lib/prepare-gift-box-assets.js';

let fixtureRoot, sourceRoot, manifest;
const cache = path.join(PROJECT_ROOT, 'server', '.cache');
before(async () => {
  await mkdir(cache, { recursive: true });
  fixtureRoot = await mkdtemp(path.join(cache, 'gift-box-phase1-'));
  sourceRoot = path.join(fixtureRoot, 'source');
  manifest = structuredClone(await readManifest());
  // Deliberately synthetic artwork, isolated from merchant sources and never public.
  for (const [index, file] of manifest.files.entries()) {
    const raw = Buffer.alloc(8 * 8 * 4);
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) {
      const offset = (y * 8 + x) * 4;
      raw.set([index * 3 % 256, index * 7 % 256, index * 11 % 256, 255], offset);
    }
    let image = sharp(raw, { raw: { width: 8, height: 8, channels: 4 } });
    image = file.format === 'jpeg' ? image.flatten({ background: '#fff' }).jpeg() : image.webp({ lossless: true });
    const bytes = await image.toBuffer();
    Object.assign(file, await inspectImage(bytes));
    const destination = containedPath(sourceRoot, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  manifest.sourceInventorySha256 = inventoryHash(manifest.files);
});
after(async () => {
  if (!fixtureRoot) return;
  const relative = path.relative(cache, fixtureRoot);
  if (!relative.startsWith('gift-box-phase1-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Refusing unsafe fixture cleanup.');
  await rm(fixtureRoot, { recursive: true, force: true });
});

test('the versioned manifest pins all 99 files and preserves the original 79-source checksum', async () => {
  const actual = await readManifest();
  assert.equal(validateManifest(actual), true);
  assert.equal(actual.sourceInventorySha256, 'ffa5e6e01ac8eeb4c3bfe5c2f18dbfd756c5479526a62efd50e85edaf8111dc5');
  assert.equal(inventoryHash(actual.files.filter(file => !file.path.startsWith('chocolate/'))), '5b6ed17d966cc139269ac7fb6e250105db7a2ec4aba5997e2f2999475b82cc02');
  assert.equal(actual.files.reduce((sum, file) => sum + file.bytes, 0), 13740658);
  assert.equal(actual.files.filter(file => file.hasAlpha).length, 55);
  assert.equal(actual.files.filter(file => file.developmentCopy).length, 83);
  assert.equal(actual.files.find(file => file.path === 'ribbons/ribbons.jpeg').role, 'reference-only');
});

test('audit checks complete image decoding, dimensions, alpha and both checksums without writes', async () => {
  const report = await auditAssetCollection({ root: sourceRoot, manifest });
  assert.equal(report.valid, true);
  assert.equal(report.fileCount, 99);
  assert.equal(report.componentCount, 74);
  assert.equal(report.productionReady, false);
  assert.deepEqual(report.duplicateFiles, []);
  assert.deepEqual(report.duplicatePixels, []);
});

test('manifest validation rejects traversal, duplicate paths and component-role substitutions', () => {
  for (const change of [copy => { copy.files[0].path = '../production-server.env'; },
    copy => { copy.files[0].path = copy.files[1].path; },
    copy => { copy.files[0].componentId = 'invented-component'; },
    copy => { copy.files.find(file => file.role === 'selection').role = 'placement'; }]) {
    const copy = structuredClone(manifest); change(copy);
    assert.throws(() => validateManifest(copy), /Gift-box/);
  }
  for (const unsafe of ['../secret.env', 'boxes/../../secret.env', 'boxes/%2e%2e.env', 'C:/secret.env', 'boxes\\box-1.webp']) assert.throws(() => containedPath(sourceRoot, unsafe));
});

test('the known defective asset cannot be re-enabled or silently production-approved in the manifest', () => {
  for (const patch of [{ developmentCopy: true }, { productionApproved: true }, { issueIds: [] }]) {
    const copy = structuredClone(manifest);
    Object.assign(copy.files.find(file => file.path === 'boxes/box-1-open-top.webp'), patch);
    assert.throws(() => validateManifest(copy), /Gift-box/);
  }
});

test('missing and unexpected files fail the audit before preparation', async () => {
  const unexpected = path.join(sourceRoot, 'unrelated-private-file.txt');
  await writeFile(unexpected, 'synthetic private content');
  try { await assert.rejects(auditAssetCollection({ root: sourceRoot, manifest }), /inventory differs/); }
  finally { await rm(unexpected); }
  const missing = containedPath(sourceRoot, manifest.files[0].path), original = await readFile(missing);
  await rm(missing);
  try { await assert.rejects(auditAssetCollection({ root: sourceRoot, manifest }), /inventory differs/); }
  finally { await writeFile(missing, original); }
});

test('changed image bytes fail against the reviewed manifest', async () => {
  const target = containedPath(sourceRoot, manifest.files[0].path), original = await readFile(target);
  await writeFile(target, await sharp({ create: { width: 5, height: 5, channels: 4, background: '#fff' } }).webp().toBuffer());
  try { await assert.rejects(auditAssetCollection({ root: sourceRoot, manifest }), /source changed/); }
  finally { await writeFile(target, original); }
});

test('truncated WebP and wrong format images cannot pass inspection', async () => {
  const bytes = await readFile(containedPath(sourceRoot, manifest.files[0].path));
  await assert.rejects(inspectImage(bytes.subarray(0, bytes.length - 1)));
  await assert.rejects(inspectImage(Buffer.from('not an image')));
  await assert.rejects(inspectImage(await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer()), /Unsupported/);
});

test('opaque placement declarations and altered inventory checksums are rejected', () => {
  const opaque = structuredClone(manifest);
  opaque.files.find(file => file.role === 'placement').hasAlpha = false;
  assert.throws(() => validateManifest(opaque), /alpha/);
  const changed = structuredClone(manifest); changed.sourceInventorySha256 = 'a'.repeat(64);
  assert.throws(() => validateManifest(changed), /checksum/);
});

test('preparation keeps sources unchanged, excludes references/defects, preserves alpha, and is repeatable', async () => {
  const outputRoot = path.join(fixtureRoot, 'derivatives');
  const first = await prepareDevelopmentAssets({ sourceRoot, outputRoot, manifest });
  assert.equal(first.files, 115); // 32 photographs at two widths, 51 placement images; chocolate has no selector image.
  assert.equal(first.createdFiles, 115);
  const directory = path.join(outputRoot, ASSET_VERSION, TRANSFORM_VERSION);
  const output = JSON.parse(await readFile(path.join(directory, 'development-manifest.json'), 'utf8'));
  assert.equal(output.entries.some(file => file.source === 'boxes/box-1-open-top.webp'), false);
  assert.equal(output.entries.some(file => file.source.startsWith('ribbons/')), false);
  for (const file of output.entries) {
    const bytes = await readFile(path.join(directory, ...file.path.split('/')));
    assert.equal(sha256(bytes), file.sha256);
    assert.equal(file.width, 8); // Never enlarge the tiny test images.
    if (file.role === 'placement') {
      assert.equal(file.hasAlpha, true);
      assert.ok(file.transparentPixels > 0);
    }
  }
  const plan = JSON.parse(await readFile(path.join(directory, 'upload-plan.json'), 'utf8'));
  assert.equal(plan.uploadAuthorized, false);
  assert.equal(new Set(plan.entries.map(entry => entry.proposedObjectKey)).size, 115);
  assert.ok(plan.entries.every(entry => entry.publishable === false && !('url' in entry)));
  const second = await prepareDevelopmentAssets({ sourceRoot, outputRoot, manifest });
  assert.equal(second.createdFiles, 0);
  assert.equal(second.unchangedFiles, 115);
  assert.equal((await auditAssetCollection({ root: sourceRoot, manifest })).valid, true);
});

test('an existing unrelated output is never overwritten', async () => {
  const target = path.join(fixtureRoot, 'existing.txt');
  await writeFile(target, 'keep this existing file');
  await assert.rejects(writeOwnedFile(target, Buffer.from('replacement')), /refusing to overwrite/);
  assert.equal(await readFile(target, 'utf8'), 'keep this existing file');
});

test('preparation rejects destinations outside the ignored development/test areas', async () => {
  await assert.rejects(prepareDevelopmentAssets({ sourceRoot, outputRoot: path.join(PROJECT_ROOT, 'client', 'public'), manifest }), /output must stay/);
});

test('directory junctions cannot redirect output or source reads', async t => {
  const target = path.join(fixtureRoot, 'linked-target'), link = path.join(fixtureRoot, 'junction');
  await mkdir(target);
  try { await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'ENOSYS', 'EACCES'].includes(error.code)) return t.skip('OS cannot create an isolated junction fixture.'); throw error; }
  await assert.rejects(writeOwnedFile(path.join(link, 'must-not-exist.txt'), Buffer.from('test')), /links or junctions/);
  await assert.rejects(auditAssetCollection({ root: link, manifest }), /links or junctions/);
  assert.deepEqual(await readdir(target), []);
});
