// Offline review evidence only. Never repairs sources or publishes media.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { DRAFT_BOX_GEOMETRY, DRAFT_GEOMETRY_VERSION } from '../../shared/gift-box/geometry-drafts.mjs';
import { auditAssetCollection, containedPath, PROJECT_ROOT, readManifest, SOURCE_ROOT } from './lib/gift-box-assets.js';
import { writeOwnedFile } from './lib/prepare-gift-box-assets.js';

const destination=path.join(PROJECT_ROOT,'server','.cache','gift-box-phase35','geometry-reviewed');
const manifest=await readManifest(), audit=await auditAssetCollection({manifest});
const labels=[];
function shape(region,style){
  if(region.type==='polygon')return `<polygon points="${region.points.map(point=>point.join(',')).join(' ')}" ${style}/>`;
  return `<ellipse cx="${region.x+region.width/2}" cy="${region.y+region.height/2}" rx="${region.width/2}" ry="${region.height/2}" ${style}/>`;
}
for(const draft of DRAFT_BOX_GEOMETRY){
  const source=`boxes/${draft.boxId}-open-top.webp`, input=await readFile(containedPath(SOURCE_ROOT,source));
  const width=800,height=Math.round(width*draft.sourceSize[1]/draft.sourceSize[0]);
  const regions=draft.regions.map(region=>shape(region,'fill="#DA9B8D" fill-opacity=".14" stroke="#9a3c67" stroke-width=".004"')).join('');
  const masks=draft.foregroundMasks.map(mask=>mask.rimEdge?`<polyline points="${mask.rimEdge.map(point=>point.join(',')).join(' ')}" fill="none" stroke="#9c681a" stroke-dasharray=".012 .008" stroke-width=".002"/>`:shape(mask,'fill="none" stroke="#9c681a" stroke-dasharray=".012 .008" stroke-width=".002"')).join('');
  const overlay=Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 1 1" preserveAspectRatio="none">${masks}${regions}</svg>`);
  const art=await sharp(input).resize({width}).flatten({background:'#ffffff'}).composite([{input:overlay}]).png().toBuffer();
  const title=`${draft.boxId.toUpperCase()} | ${draft.regions.length} proposed floor region${draft.regions.length===1?'':'s'}${draft.assetBlocked?' | ARTWORK BLOCKED':''}`;
  const label=Buffer.from(`<svg width="800" height="76"><rect width="800" height="76" fill="#FFFCFB"/><text x="16" y="26" font-size="20" fill="#62483F">${title}</text><text x="16" y="52" font-size="14" fill="#62483F">DRAFT / UNREVIEWED | Rose: floor. Ochre dashed: foreground. No physical capacity.</text></svg>`);
  const bytes=await sharp({create:{width,height:height+76,channels:3,background:'#fff'}}).composite([{input:label,top:0,left:0},{input:art,top:76,left:0}]).png().toBuffer();
  await writeOwnedFile(path.join(destination,`${draft.boxId}-draft-boundary.png`),bytes);
  labels.push({boxId:draft.boxId,source,sourceSha256:manifest.files.find(item=>item.path===source).sha256,reviewStatus:'unreviewed',productionApproved:false,...draft});
}
const original=await readFile(containedPath(SOURCE_ROOT,'boxes/box-1-open-top.webp'));
const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let rightStripOpaque=0,rightStripHiddenRgb=0;const rows=[];
for(let y=0;y<info.height;y++){
  let colored=0;
  for(let x=1303;x<info.width;x++){
    const index=(y*info.width+x)*4;
    if(data[index+3]>0)rightStripOpaque++;
    else if(data[index]||data[index+1]||data[index+2])rightStripHiddenRgb++;
    if(data[index]>30&&data[index]>data[index+1]*1.2)colored++;
  }
  if(colored>40)rows.push(y);
}
const bands=[];for(const y of rows){const last=bands.at(-1);if(last&&last[1]===y-1)last[1]=y;else bands.push([y,y]);}
const diagnostic={source:'boxes/box-1-open-top.webp',sourceSize:[info.width,info.height],rightStrip:{x:1303,width:150,nonzeroAlphaPixels:rightStripOpaque,hiddenRgbPixels:rightStripHiddenRgb,redBandRows:bands},status:'blocked-awaiting-reviewed-replacement',sourceModified:false};
const matte=await sharp(original).flatten({background:'#fff'}).resize({width:700}).png().toBuffer();
const rgb=await sharp(original).removeAlpha().resize({width:700}).png().toBuffer();
const imageHeight=Math.round(info.height/info.width*700);
const title=Buffer.from('<svg width="1400" height="60"><rect width="1400" height="60" fill="#fff"/><text x="16" y="24" font-size="20">BOX-1 DIAGNOSTIC / unchanged source</text><text x="16" y="48" font-size="16">Left: alpha composited on white. Right: RGB channels ignoring alpha (diagnostic only).</text></svg>');
await writeOwnedFile(path.join(destination,'box-1-defect-diagnostic.png'),await sharp({create:{width:1400,height:imageHeight+60,channels:3,background:'#fff'}}).composite([{input:title,top:0,left:0},{input:matte,top:60,left:0},{input:rgb,top:60,left:700}]).png().toBuffer());
await writeOwnedFile(path.join(destination,'box-1-defect-diagnostic.json'),Buffer.from(JSON.stringify(diagnostic,null,2)+'\n'));
await writeOwnedFile(path.join(destination,'draft-geometry-review.json'),Buffer.from(JSON.stringify({version:DRAFT_GEOMETRY_VERSION,productionApproved:false,sourceInventorySha256:audit.sourceInventorySha256,boxes:labels},null,2)+'\n'));
console.log(JSON.stringify({mode:'offline-review-only',boxes:labels.length,sourceInventorySha256:audit.sourceInventorySha256,box1Diagnostic:diagnostic,productionApproved:false,networkRequests:false,databaseConnections:false},null,2));
