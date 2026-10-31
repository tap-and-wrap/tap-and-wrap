import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT, SOURCE_ROOT, readManifest, sha256 } from '../scripts/lib/gift-box-assets.js';
import { auditGiftBoxMediaReadiness, verifyPinnedImage } from '../scripts/lib/audit-gift-box-media-readiness.js';

const cacheRoot = path.join(PROJECT_ROOT,'server','.cache');
test('full local source, bow and Box 1 derivative inventories reconcile with production still blocked', async () => {
  const result = await auditGiftBoxMediaReadiness();
  assert.equal(result.developmentMediaIntegrityVerified,true);
  assert.equal(result.productionReady,false);
  assert.equal(result.publicationAuthorized,false);
  assert.equal(result.geometryApproved,false);
  assert.equal(result.counts.originalSourceImages,99);
  assert.equal(result.counts.normalDerivativeFiles,115);
  assert.equal(result.counts.ribbonSourceAndCopyPairs,21);
  assert.equal(result.counts.correctedBox1Derivatives,1);
  assert.equal(result.counts.consolidatedDevelopmentMedia,137);
  assert.match(result.manifestDigestSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.entries.filter(e=>e.role==='placement-overlay').length,1);
  assert.equal(new Set(result.entries.map(e=>`${e.role}:${e.relative}`)).size,137);
  assert.equal(result.databaseConnections,false);
  assert.equal(result.networkRequests,false);
  assert.equal(result.writes,false);
});
test('per-file verifier detects changed bytes, omitted hashes and disallowed placement alpha', async () => {
  await mkdir(cacheRoot,{recursive:true});
  const temp=await mkdtemp(path.join(cacheRoot,'gift-box-media-readiness-'));
  try {
    const target=path.join(temp,'test.webp');
    await writeFile(target,'not an image');
    await assert.rejects(verifyPinnedImage(target,{sha256:'x'.repeat(64),bytes:12}), /pinned hash/);
    await assert.rejects(verifyPinnedImage(target,{sha256:sha256('not an image'),bytes:99}), /image bytes differ/);
    const manifest = await readManifest();
    const selection = manifest.files.find(item => item.path === 'boxes/box-1.webp');
    assert.ok(selection);
    await assert.rejects(verifyPinnedImage(path.join(SOURCE_ROOT, 'boxes', 'box-1.webp'), selection, {requirePlacementAlpha:true}), /placement image has no transparent background/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('reconciliation rejects a tampered bow collection before any release claim', async () => {
  await mkdir(cacheRoot,{recursive:true});
  const temp=await mkdtemp(path.join(cacheRoot,'gift-box-media-tamper-'));
  try {
    await writeFile(path.join(temp,'ribbon-red-bow.webp'),'tampered');
    await assert.rejects(auditGiftBoxMediaReadiness({ribbonsSourceRoot:temp}), /Gift-box media readiness:/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
