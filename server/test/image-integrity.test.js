import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { verifyImageIntegrity } from '../src/media/image-integrity.js';
import { validateCatalogImage, storeCatalogImage } from '../src/catalog/media-storage.js';
import { createMemoryStorage, inspectStoredImage } from '../src/commerce/storage.js';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';

const image = format => sharp({ create: { width: 4, height: 3, channels: 3, background: '#da9b8d' } })[format]().toBuffer();
async function both(bytes, mime) {
  const storage = createMemoryStorage(); storage.put('synthetic', bytes, mime);
  await assert.rejects(inspectStoredImage(storage, 'synthetic', { mimeType: mime, sizeBytes: bytes.length }), error => error.status === 400);
  await assert.rejects(validateCatalogImage(bytes, mime), error => error.status === 400);
}
for (const [format, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp']]) {
  test(`F05 ${format} full decode accepts valid bytes, rejects truncated/corrupt/forged bytes in public and private validators`, async () => {
    const bytes = await image(format), storage = createMemoryStorage(); storage.put('synthetic', bytes, mime);
    const verified = await inspectStoredImage(storage, 'synthetic', { mimeType: mime, sizeBytes: bytes.length }); assert.equal(verified.width, 4); assert.equal(verified.height, 3);
    assert.deepEqual(await validateCatalogImage(bytes, mime), { width: 4, height: 3 });
    await both(bytes.subarray(0, format === 'png' ? 33 : Math.floor(bytes.length / 2)), mime);
    await both(bytes.subarray(0, bytes.length - (format === 'png' ? 12 : 1)), mime);
    const corrupt = Buffer.from(bytes);
    if (format === 'png') corrupt[corrupt.indexOf('IDAT') + 4] ^= 255;
    else if (format === 'webp') corrupt.fill(255, 20);
    else { corrupt.fill(0, 2, bytes.length - 2); }
    await both(corrupt, mime); await both(bytes, mime === 'image/png' ? 'image/jpeg' : 'image/png');
  });
}
test('F05 original audit PNG cases, empty, HEIC, excessive bytes and huge dimensions fail without storage writes', async () => {
  const original = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X8kQAAAAASUVORK5CYII=', 'base64');
  await both(original.subarray(0, 33), 'image/png');
  const corrupt = Buffer.from(original); corrupt[45] ^= 255; await both(corrupt, 'image/png');
  await both(Buffer.alloc(0), 'image/png'); await both(Buffer.from('ftypheic'), 'image/heic');
  await both(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png');
  const giant = await image('png'); giant.writeUInt32BE(12001, 16); await both(giant, 'image/png');
  const overPixels = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: '#ffffff' } }).png().toBuffer();
  await both(overPixels, 'image/png');
  let puts = 0; await assert.rejects(storeCatalogImage(corrupt, 'image/png', { put: async () => { puts++; } })); assert.equal(puts, 0);
});
test('F05 validates every decoded pixel, retains original bytes and supports provider retry without duplicate objects', async () => {
  const bytes = await image('png'); let fail = true, puts = 0; const objects = new Map();
  const storage = { put: async (key, data, mimeType) => { puts++; if (fail) throw Error('provider error'); objects.set(key, { bytes: data, mimeType }); }, read: async key => objects.get(key) };
  await assert.rejects(storeCatalogImage(bytes, 'image/png', storage), error => error.status === 503);
  fail = false; const result = await storeCatalogImage(bytes, 'image/png', storage), repeated = await storeCatalogImage(bytes, 'image/png', storage);
  assert.equal(result.key, repeated.key); assert.equal(objects.size, 1); assert.deepEqual(objects.get(result.key).bytes, bytes); assert.equal(puts, 3);
  const privateStorage = createMemoryStorage(); privateStorage.put('source', bytes);
  await assert.rejects(inspectStoredImage({ ...privateStorage, readImage: async () => { throw Error('provider read unavailable'); } }, 'source', { mimeType: 'image/png', sizeBytes: bytes.length }));
  assert.deepEqual(privateStorage.objects.get('source').bytes, bytes);
});
test('F05 native decoding concurrency is bounded without accumulating an upload queue', async () => {
  const bytes = await image('png');
  const first = verifyImageIntegrity(bytes, 'image/png'), second = verifyImageIntegrity(bytes, 'image/png');
  await assert.rejects(verifyImageIntegrity(bytes, 'image/png'), error => error.code === 'IMAGE_VERIFICATION_BUSY');
  await Promise.all([first, second]); assert.deepEqual(await verifyImageIntegrity(bytes, 'image/png'), { width: 4, height: 3 });
});
test('F05 decoder process is killed at the hard deadline and releases its concurrency slot', async context => {
  const bytes = await image('png'), child = new EventEmitter(); let killed;
  child.stdout = new EventEmitter(); child.stdin = new EventEmitter(); child.stdin.end = () => {};
  child.kill = signal => { killed = signal; child.emit('close', null); };
  const original = childProcess.spawn;
  childProcess.spawn = () => child; syncBuiltinESMExports();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const verifying = verifyImageIntegrity(bytes, 'image/png');
    const rejection = assert.rejects(verifying, error => error.code === 'IMAGE_VERIFICATION_UNAVAILABLE');
    context.mock.timers.tick(8000); await rejection; assert.equal(killed, 'SIGKILL');
  } finally { context.mock.timers.reset(); childProcess.spawn = original; syncBuiltinESMExports(); }
  assert.deepEqual(await verifyImageIntegrity(bytes, 'image/png'), { width: 4, height: 3 });
});
