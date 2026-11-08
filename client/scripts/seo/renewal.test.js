import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sealPublication, validateSealedPublication, RENEWAL_FILES } from './renewal.js';
import { publishSeoBranch } from '../publish-seo-branch.js';

function fixture() {
  const now = new Date(), category = { _id: 'category-one', slug: 'fixture-category', name: 'Fixture category', active: true, parentId: null, productCount: 1 };
  const image = 'https://media.tapandwrap.net/fixture.webp';
  const catalog = { version: 1, source: 'approved-public-catalog', generatedAt: now.toISOString(), checkoutEnabled: true, mediaOrigins: ['https://media.tapandwrap.net'], categories: [category], products: [{ _id: 'product-one', slug: 'fixture-gift', name: 'Fixture gift', description: 'An isolated quote-ready fixture.', routingAttestation: 'a'.repeat(64), category, pricePiastres: null, priceApproved: false, orderingAvailable: false, mainImageUrl: image, seoEligibility: { status: 'draft', published: true, inventoryApproved: false, reviewRequired: true, categoriesActive: true } }], mediaVerification: { version: 1, source: 'authorized-media-object-verification', objects: [{ url: image, approved: true, sha256: 'b'.repeat(64), objectVersion: 'fixture-v1', contentType: 'image/webp', sizeBytes: 18000, width: 900, height: 900, verifiedAt: now.toISOString(), validUntil: new Date(+now + 86400000).toISOString() }] } };
  catalog.products[0].visibility = 'public';
  catalog.products[0].seoEligibility.visibility = 'public';
  return { catalog, content: { version: 1, pages: [] }, sourceCommit: 'c'.repeat(40), now };
}
test('sealed quote-ready publication rebuilds the identical ID without renewing expiry', () => {
  const input = fixture(), lock = sealPublication(input);
  assert.equal(validateSealedPublication({ ...input, lock, now: new Date(+input.now + 300000) }).publicationId, lock.publicationId);
  assert.equal(Date.parse(lock.expiresAt) - +input.now, 86400000);
});
test('seal rejects stale exports, unverified media and incomplete eligibility', () => {
  const input = fixture(); input.catalog.generatedAt = new Date(+input.now - 600001).toISOString();
  assert.throws(() => sealPublication(input), /Stale/);
  const media = fixture(); media.catalog.mediaVerification.objects = [];
  assert.throws(() => sealPublication(media), /Incomplete/);
  const hidden = fixture(); hidden.catalog.products[0].visibility = 'hidden';
  assert.throws(() => sealPublication(hidden), /Incomplete/);
});
test('changed artifacts, wrong expected ID and expiry all fail closed', () => {
  const input = fixture(), lock = sealPublication(input);
  assert.throws(() => validateSealedPublication({ ...input, lock: { ...lock, publicationId: 'd'.repeat(64) } }), /mismatch/);
  assert.throws(() => validateSealedPublication({ ...input, lock, content: { changed: true } }), /changed/);
  assert.throws(() => validateSealedPublication({ ...input, lock, now: new Date(+input.now + 86400001) }), /Expired/);
  assert.throws(() => validateSealedPublication({ ...input, lock, now: new Date(+input.now - 1) }), /invalid/);
});
test('publication commits are fast-forward, preserve main/source tree and reject main drift', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tap-wrap-renewal-test-'));
  const bare = path.join(root, 'remote.git'), local = path.join(root, 'checkout');
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git(root, ['init', '--bare', bare]); await mkdir(local); git(local, ['init', '-b', 'main']);
    git(local, ['config', 'user.name', 'Fixture']); git(local, ['config', 'user.email', 'fixture@example.invalid']);
    await writeFile(path.join(local, 'reviewed.txt'), 'Preserve reviewed application source'); git(local, ['add', '.']); git(local, ['commit', '-m', 'Reviewed fixture']);
    git(local, ['remote', 'add', 'origin', bare]); git(local, ['push', 'origin', 'main']);
    const sourceCommit = git(local, ['rev-parse', 'HEAD']);
    const writeArtifacts = async () => {
      const input = { ...fixture(), sourceCommit }, lock = sealPublication(input);
      await mkdir(path.join(local, 'seo-publication'), { recursive: true });
      for (const [name, value] of Object.entries({ catalog: input.catalog, content: input.content, lock })) await writeFile(path.join(local, `seo-publication/${name}.json`), JSON.stringify(value));
    };
    await writeArtifacts(); const first = await publishSeoBranch({ cwd: local, token: 'isolated-fixture-not-a-credential' });
    await writeArtifacts(); const second = await publishSeoBranch({ cwd: local, token: 'isolated-fixture-not-a-credential' });
    assert.equal(git(local, ['merge-base', '--is-ancestor', first.commit, second.commit]), '');
    assert.equal(git(bare, ['rev-parse', 'main']), sourceCommit);
    assert.deepEqual(git(local, ['diff', '--name-only', sourceCommit, second.commit]).split('\n').sort(), [...RENEWAL_FILES].sort());
    assert.equal(git(local, ['show', `${second.commit}:reviewed.txt`]), await readFile(path.join(local, 'reviewed.txt'), 'utf8'));
    await writeFile(path.join(local, 'new.txt'), 'New source'); git(local, ['add', 'new.txt']); git(local, ['commit', '-m', 'Source advanced']); git(local, ['push', 'origin', 'main']);
    await assert.rejects(() => publishSeoBranch({ cwd: local, token: 'isolated-fixture-not-a-credential' }), /source differs|Main advanced/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
