import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildAlphaCandidate, clearTransparentRgb, compareCandidatePixels, compositePreview } from '../scripts/lib/box-1-candidate.js';
import { sha256 } from '../scripts/lib/gift-box-assets.js';

const fixture = Buffer.from([255, 2, 75, 0, 20, 30, 40, 1, 90, 80, 70, 128, 4, 5, 6, 254, 12, 13, 14, 255, 0, 0, 0, 0]);
test('only RGB values at alpha zero change; input, visible and partial RGBA bytes stay exact', () => {
  const original = Buffer.from(fixture), candidate = clearTransparentRgb(fixture, 3, 2);
  assert.deepEqual(fixture, original);
  assert.deepEqual(candidate.subarray(0, 4), Buffer.from([0, 0, 0, 0]));
  assert.deepEqual(candidate.subarray(4), original.subarray(4));
  const report = compareCandidatePixels(original, candidate, 3, 2);
  assert.equal(report.invariantPassed, true); assert.equal(report.changedPixels, 1);
  assert.equal(report.partiallyTransparentPixels, 3); assert.equal(report.partiallyTransparentRgbaChanges, 0);
  assert.equal(report.visibleRgbaChanges, 0); assert.equal(report.alphaChanges, 0);
  assert.equal(report.remainingHiddenRgbPixels, 0);
});
test('clearing is idempotent, including already clean transparent and opaque pixels', () => {
  const first = clearTransparentRgb(fixture, 3, 2);
  assert.deepEqual(clearTransparentRgb(first, 3, 2), first);
  assert.equal(compareCandidatePixels(first, first, 3, 2).changedPixels, 0);
});
test('pixel comparison rejects visible or alpha edits and leftover transparent RGB', () => {
  for (const edit of [buffer => { buffer[4]++; }, buffer => { buffer[7]++; }, buffer => { buffer[0] = 1; }]) {
    const candidate = clearTransparentRgb(fixture, 3, 2); edit(candidate);
    assert.equal(compareCandidatePixels(fixture, candidate, 3, 2).invariantPassed, false);
  }
});
test('all supported composited backgrounds are identical before and after correction', () => {
  const candidate = clearTransparentRgb(fixture, 3, 2);
  for (const background of ['light', 'dark', 'checkerboard']) assert.deepEqual(compositePreview(fixture, 3, 2, background), compositePreview(candidate, 3, 2, background));
  assert.throws(() => compositePreview(candidate, 3, 2, 'invented'));
});
test('malformed, oversized and incomplete raw image buffers are rejected', () => {
  for (const [bytes, width, height] of [[fixture, 0, 2], [fixture, 3.5, 2], [fixture, 3, Infinity], [fixture, 4097, 1], [fixture.subarray(1), 3, 2], [new Uint8Array(fixture), 3, 2]]) assert.throws(() => clearTransparentRgb(bytes, width, height), /bounded, complete/);
});
test('lossless PNG candidate round-trips exact corrected RGBA and pins the original bytes and decoded pixels', async () => {
  const source = await sharp(fixture, { raw: { width: 3, height: 2, channels: 4 } }).png().toBuffer();
  const decoded = await sharp(source).toColourspace('srgb').ensureAlpha().raw().toBuffer();
  const pin = { format: 'png', width: 3, height: 2, sha256: sha256(source), decodedPixelSha256: sha256(decoded) };
  const result = await buildAlphaCandidate(source, pin);
  const actual = await sharp(result.png).toColourspace('srgb').ensureAlpha().raw().toBuffer();
  assert.deepEqual(actual, clearTransparentRgb(decoded, 3, 2));
  assert.equal(result.comparison.invariantPassed, true);
  await assert.rejects(buildAlphaCandidate(source, { ...pin, sha256: '0'.repeat(64) }), /source hash/);
  await assert.rejects(buildAlphaCandidate(source, { ...pin, decodedPixelSha256: '0'.repeat(64) }), /decoded source/);
  await assert.rejects(buildAlphaCandidate(source, { ...pin, width: 4 }), /dimensions/);
});
