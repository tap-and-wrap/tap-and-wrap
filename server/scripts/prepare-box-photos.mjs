// Offline, fixed paths; immutable selection-only derivatives. No DB/provider.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BOX_PHOTO_RELEASE, BOX_PHOTO_FRAMES } from '../../shared/gift-box/box-photo-framing.mjs';
import { SOURCE_ROOT, containedPath, assertNoLinks } from './lib/gift-box-assets.js';
import { writeOwnedFile } from './lib/prepare-gift-box-assets.js';
import path from 'node:path';
const output=new URL(`../../client/.gift-box-assets/${BOX_PHOTO_RELEASE}/`,import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const entries=[];
for(const frame of BOX_PHOTO_FRAMES) {
  const source=containedPath(SOURCE_ROOT,frame.source);await assertNoLinks(source);
  const original=await readFile(source),metadata=await sharp(original).metadata();
  if(metadata.width!==960||metadata.height!==1280)throw Error('Master dimensions changed: review framing.');
  // Preserve original bytes for inspection. No resampling or simulated detail.
  const variants=[{role:'original',width:metadata.width,height:metadata.height,bytes:original}];
  for(const size of [320,640]) {
    const bytes=await sharp(original).extract(frame.crop).resize(size-16,size-16,{fit:'contain',background:'#FFFCFB',withoutEnlargement:true}).extend({top:8,bottom:8,left:8,right:8,background:'#FFFCFB'}).webp({quality:88,effort:6}).toBuffer();
    variants.push({role:'thumbnail',width:size,height:size,bytes});
  }
  for(const variant of variants) {
    const file=`${variant.role}/${variant.width}/${frame.componentId}.webp`;
    await writeOwnedFile(path.join(output.pathname.replace(/^\/(?=[A-Za-z]:)/,''),file),variant.bytes);
    entries.push({componentId:frame.componentId,role:variant.role,width:variant.width,height:variant.height,source:frame.source,sourceSha256:sha(original),crop:variant.role==='thumbnail'?frame.crop:null,key:`gift-box/${BOX_PHOTO_RELEASE}/${file}`,file,bytes:variant.bytes.length,sha256:sha(variant.bytes)});
  }
}
const manifest={schemaVersion:1,releaseId:BOX_PHOTO_RELEASE,bucket:'tapandwrap-catalog',entries};
await writeOwnedFile(new URL('../../shared/gift-box/box-photos.v1.json',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,''),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
console.log(JSON.stringify({releaseId:BOX_PHOTO_RELEASE,files:entries.length,bytes:entries.reduce((sum,e)=>sum+e.bytes,0),writes:'local derivatives and manifest only'}));
