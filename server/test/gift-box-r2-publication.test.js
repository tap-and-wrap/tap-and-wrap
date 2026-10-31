import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GIFT_BOX_MEDIA } from '../../shared/gift-box/public-media.v1.mjs';
import { validateGiftBoxPublicManifest, verifyLocalGiftBoxMedia } from '../scripts/lib/gift-box-r2-publication.mjs';

test('all 137 Gift Box R2 candidates are fixed, isolated, and linked to no catalog object keys', async () => {
  assert.equal(validateGiftBoxPublicManifest(),true);
  const report=await verifyLocalGiftBoxMedia();
  assert.equal(report.files,137);
  assert.equal(report.bytes,16796852);
  assert.equal(report.networkRequests,false);
  assert.equal(report.writes,false);
  assert.equal(report.digest,GIFT_BOX_MEDIA.entriesDigestSha256);
  assert.ok(report.verifiedFiles.every(e=>e.key.startsWith(GIFT_BOX_MEDIA.prefix)));
});

test('tampered hash, remapped roles and missing files fail before network or writes', async () => {
  const changed=structuredClone(GIFT_BOX_MEDIA);
  changed.entries[0].sha256='0'.repeat(64);
  assert.throws(()=>validateGiftBoxPublicManifest(changed),/MANIFEST_DIGEST_CHANGED/);
  const changedRole=structuredClone(GIFT_BOX_MEDIA);
  changedRole.entries[0].role='private';
  assert.throws(()=>validateGiftBoxPublicManifest(changedRole),/ENTRY_INVALID/);
  const temp=await mkdtemp(path.join(os.tmpdir(),'taw-media-empty-'));
  try { await assert.rejects(()=>verifyLocalGiftBoxMedia({root:temp}),/ENOENT/); }
  finally { await rm(temp,{recursive:true,force:true}); }
});
