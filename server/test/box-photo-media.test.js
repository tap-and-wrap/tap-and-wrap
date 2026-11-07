import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import manifest from '../../shared/gift-box/box-photos.v1.json' with {type:'json'};
import {BOX_PHOTO_FRAMES,BOX_PHOTO_RELEASE} from '../../shared/gift-box/box-photo-framing.mjs';
import {GIFT_BOX_MEDIA} from '../../shared/gift-box/public-media.v1.mjs';
test('selection release has two square thumbnails and an uncropped master for each of twelve boxes',()=>{
  assert.equal(manifest.releaseId,BOX_PHOTO_RELEASE);assert.equal(manifest.entries.length,36);assert.equal(new Set(manifest.entries.map(e=>e.key)).size,36);
  for(const frame of BOX_PHOTO_FRAMES){
    const entries=manifest.entries.filter(e=>e.componentId===frame.componentId);assert.equal(entries.length,3);
    assert.deepEqual(entries.map(e=>[e.role,e.width,e.height]),[['original',960,1280],['thumbnail',320,320],['thumbnail',640,640]]);
    assert.ok(frame.crop.left>=0&&frame.crop.top>=0&&frame.crop.left+frame.crop.width<=960&&frame.crop.top+frame.crop.height<=1280);
    assert.ok(Math.max(frame.crop.width,frame.crop.height)>=624,'No upscaling to fill the 640px thumbnail.');
    for(const entry of entries)assert.equal(entry.key,`gift-box/${BOX_PHOTO_RELEASE}/${entry.role}/${entry.width}/${entry.componentId}.webp`);
    assert.equal(entries[0].sha256,entries[0].sourceSha256,'Inspection source bytes remain unchanged.');
  }
});
test('selection-only release preserves every historical placement and original media mapping',()=>{
  assert.equal(GIFT_BOX_MEDIA.releaseId,'gift-box-media-2026-10-31.1');assert.equal(GIFT_BOX_MEDIA.entries.length,137);
  assert.ok(manifest.entries.every(entry=>!entry.key.includes('placement')&&!entry.key.includes('open-top')));
});
test('prepared selection bytes match published manifest hashes, formats and actual dimensions',async()=>{
  for(const entry of manifest.entries){
    const bytes=await readFile(new URL(`../../client/.gift-box-assets/${BOX_PHOTO_RELEASE}/${entry.file}`,import.meta.url));
    assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    const metadata=await sharp(bytes).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,entry.width);assert.equal(metadata.height,entry.height);
  }
});
