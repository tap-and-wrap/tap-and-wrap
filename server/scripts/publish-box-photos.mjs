// Fixed public selection-photo release only. No DB, customer files or runtime env.
// Default: offline verification. --apply --confirm-selection-photos publishes
// missing keys via the existing Wrangler OAuth authorization, never replacements.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import manifest from '../../shared/gift-box/box-photos.v1.json' with {type:'json'};
import {assertNoLinks} from './lib/gift-box-assets.js';
const args=process.argv.slice(2),apply=args.length===2&&args.includes('--apply')&&args.includes('--confirm-selection-photos');
if(args.length&&!apply)throw Error('Use no arguments, or --apply --confirm-selection-photos.');
const client=fileURLToPath(new URL('../../client/',import.meta.url)),evidence=new URL('../../local-data/box-photo-publication/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(manifest.releaseId!=='box-photos-2026-11-07.2'||manifest.bucket!=='tapandwrap-catalog'||manifest.entries.length!==36)throw Error('Unexpected selection release.');
const keys=new Set(),files=[];
for(const entry of manifest.entries){
  if(!/^(thumbnail\/(320|640)|original\/960)\/box-(?:[1-9]|1[0-2])\.webp$/.test(entry.file)||entry.key!==`gift-box/${manifest.releaseId}/${entry.file}`||keys.has(entry.key))throw Error('Unexpected or duplicated selection key.');keys.add(entry.key);
  const file=fileURLToPath(new URL(`../../client/.gift-box-assets/${manifest.releaseId}/${entry.file}`,import.meta.url));await assertNoLinks(file);
  const bytes=await readFile(file),metadata=await sharp(bytes).metadata();
  if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256||metadata.format!=='webp'||metadata.width!==entry.width||metadata.height!==entry.height)throw Error('Local selection integrity failed.');
  files.push({entry,file});
}
console.log(JSON.stringify({mode:apply?'authorized-selection-publication':'offline',release:manifest.releaseId,files:files.length,bytes:manifest.entries.reduce((sum,e)=>sum+e.bytes,0)}));
if(!apply)process.exit(0);
await mkdir(evidence,{recursive:true});
function cli(args){const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','r2','object',...args],{cwd:client,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024});if(result.error)throw Error('Cloudflare operation did not complete.');return result;}
async function exists(entry){
  const copy=fileURLToPath(new URL(`${entry.componentId}-${entry.role}-${entry.width}.webp`,evidence));
  const result=cli(['get',`${manifest.bucket}/${entry.key}`,'--remote','--file',copy]);
  if(result.status!==0){if((result.stderr+result.stdout).includes('The specified key does not exist.'))return false;throw Error('Cloudflare read failed; no write authorized by this result.');}
  const bytes=await readFile(copy);if(sha(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw Error('Existing selection object conflicts; refusing replacement.');return true;
}
const pending=[];
// Scan the whole release before writing anything. Reruns only verify equal keys.
for(const {entry,file} of files)if(!await exists(entry))pending.push({entry,file});
console.log(JSON.stringify({verifiedExisting:36-pending.length,missing:pending.length}));
const results=[];
for(const {entry,file} of files){
  if(pending.some(item=>item.entry.key===entry.key)&&!await exists(entry)){
    const result=cli(['put',`${manifest.bucket}/${entry.key}`,'--remote','--file',file,'--content-type','image/webp','--cache-control','public, max-age=31536000, immutable']);
    if(result.status!==0&&!await exists(entry))throw Error('Selection upload unconfirmed. Stop and inspect; do not overwrite.');
  }
  if(!await exists(entry))throw Error('Selection upload missing.');
  const url=`https://media.tapandwrap.net/${entry.key}`,response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/webp')||bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error('Public selection verification failed.');
  results.push({url,status:response.status,bytes:bytes.length,sha256:sha(bytes)});
  console.log(`Verified public selection media ${results.length}/36`);
  await writeFile(new URL('report.json',evidence),JSON.stringify({release:manifest.releaseId,results,previousMediaUnchanged:true},null,2));
}
console.log('Selection photo release published and verified. No existing keys or customer files changed.');
