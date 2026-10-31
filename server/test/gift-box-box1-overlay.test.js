import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { BOX1_OVERLAY, BOX1_OVERLAY_URL } from '../../shared/gift-box/box1-overlay.mjs';
import { readBox1OverlayDerivative } from '../../client/scripts/box1-overlay-local.mjs';
import { PROJECT_ROOT, sha256 } from '../scripts/lib/gift-box-assets.js';
import { prepareBox1Overlay } from '../scripts/lib/prepare-box1-overlay.js';

const cache = path.join(PROJECT_ROOT, 'server', '.cache');
test('pinned original and reviewed corrected candidate produce a repeatable, unpublished development-only overlay', async () => {
  await mkdir(cache, { recursive: true });
  const temp = await mkdtemp(path.join(cache, 'box1-overlay-test-'));
  try {
    const first = await prepareBox1Overlay({ outputRoot: temp });
    assert.equal(first.created, true);
    assert.equal(first.productionApproved, false);
    assert.equal(first.uploadAuthorized, false);
    assert.equal(first.visibleRgbaChanges, 0);
    assert.equal(first.alphaChanges, 0);
    assert.equal(first.clearedHiddenRgbPixels, 96750);
    const manifest = JSON.parse(await readFile(path.join(temp, BOX1_OVERLAY.version, 'development-manifest.json'), 'utf8'));
    assert.equal(manifest.version, BOX1_OVERLAY.version);
    assert.equal(manifest.original.manifestUnchanged, true);
    assert.equal(manifest.derivative.path, BOX1_OVERLAY.derivativePath);
    assert.equal(sha256(await readFile(path.join(temp, BOX1_OVERLAY.version, ...BOX1_OVERLAY.derivativePath.split('/')))), manifest.derivative.sha256);
    const again = await prepareBox1Overlay({ outputRoot: temp });
    assert.equal(again.created, false);
    assert.equal(again.unchanged, true);
    assert.match(BOX1_OVERLAY_URL, /^\/__gift-box-box1-overlay\/box1-alpha-rgb-/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('Box 1 overlay refuses tampered corrected image without rewriting existing sources', async () => {
  await mkdir(cache, { recursive: true });
  const temp = await mkdtemp(path.join(cache, 'box1-overlay-tamper-'));
  try {
    const tampered = path.join(temp, BOX1_OVERLAY.candidateFilename);
    await writeFile(tampered, Buffer.from('not the reviewed candidate'));
    await assert.rejects(prepareBox1Overlay({ candidateFile: tampered, outputRoot: temp }), /candidate hash mismatch/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('local Box 1 overlay restricts derivative lookup to its one exact path', async () => {
  await assert.rejects(readBox1OverlayDerivative('../development-manifest.json'), /Unknown Box 1 overlay path/);
  await assert.rejects(readBox1OverlayDerivative('1200/boxes/box-2-open-top.webp'), /Unknown Box 1 overlay path/);
  // The local Vite browser test covers the successful read after CLI preparation.
});
