import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { transformImage, outputKeys, responsiveKey } from '../src/catalog/admin-media.js';

test('product JPEG becomes three valid WebP sizes without cropping or upscaling', async () => {
  const source = await sharp({ create: { width: 1100, height: 850, channels: 3, background: '#ccaa88' } }).jpeg().toBuffer();
  const result = await transformImage(source, { kind: 'product', focus: 'attention' });
  assert.equal(result.outputs.length, 3);
  for (const output of result.outputs) assert.equal((await sharp(output.buffer).metadata()).format, 'webp');
  const main = await sharp(result.outputs[0].buffer).metadata();
  assert.equal(main.width, 1100); assert.equal(main.height, 850);
  assert.match(result.keys.main, /^managed\/v1\/product\/[a-f0-9]{64}\/1600\.webp$/);
});
test('portrait photo becomes a valid 4:3 category image without upscaling', async () => {
  const input = await sharp({ create: { width: 400, height: 800, channels: 3, background: '#fefefe' } }).png().toBuffer();
  const image = await transformImage(input, { kind: 'category', focus: 'centre' });
  const meta = await sharp(image.outputs[0].buffer).metadata();
  assert.equal(meta.width, 400); assert.equal(meta.height, 300);
});
test('invalid image bytes are refused', async () => {
  await assert.rejects(transformImage(Buffer.from('nothing'), { kind: 'product', focus: 'attention' }), { code: 'INVALID_MEDIA_REQUEST' });
});
test('immutable keys are safe and responsive filenames are derived only for managed images', () => {
  const keys = outputKeys('product', 'a'.repeat(64));
  assert.equal(responsiveKey(keys.main, 640), keys.card);
  assert.equal(responsiveKey('Home & Decor/image.webp', 640), null);
});
