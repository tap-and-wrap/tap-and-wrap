/**
 * Gift Box R2 media uploader. Default: offline SHA256 verification only.
 * --verify-r2: remote HEAD reads only. --apply --confirm-giftbox-upload: conditional create-only uploads.
 * Does NOT access MongoDB, replace catalog files, change production flags, or deploy.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GIFT_BOX_MEDIA } from '../../shared/gift-box/public-media.v1.mjs';
import { verifyLocalGiftBoxMedia } from './lib/gift-box-r2-publication.mjs';

const args=process.argv.slice(2);
const offline=args.length===0;
const verifying=args.length===1 && args[0]==='--verify-r2';
const uploading=args.length===2 && args.includes('--apply') && args.includes('--confirm-giftbox-upload');
if (!offline && !verifying && !uploading) { console.error('USAGE: no flags (offline), --verify-r2, OR --apply --confirm-giftbox-upload'); process.exit(1); }
const cleanEtag = value => String(value || '').replace(/^"|"$/g,'').toLowerCase();
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
function safeError(error) {
  const status=error?.$metadata?.httpStatusCode;
  return Number.isInteger(status) ? `HTTP_${status}` : 'STORAGE_OPERATION_FAILED';
}
let s3;
async function run() {
  const local=await verifyLocalGiftBoxMedia();
  console.log(JSON.stringify({mode:local.mode,releaseId:local.releaseId,bucket:local.bucket,
    files:local.files,bytes:local.bytes,digest:local.digest,networkRequests:false,writes:false},null,2));
  if (offline) return;
  const env=process.env;
  if (env.CATALOG_R2_BUCKET !== 'tapandwrap-catalog' || !/^[a-f0-9]{32}$/i.test(env.CATALOG_R2_ACCOUNT_ID || '')
    || !env.CATALOG_R2_ACCESS_KEY_ID || !env.CATALOG_R2_SECRET_ACCESS_KEY) throw new Error('R2_CONFIGURATION_INCOMPLETE');
  const {S3Client,HeadObjectCommand,PutObjectCommand}=await import('@aws-sdk/client-s3');
  s3=new S3Client({region:'auto',endpoint:`https://${env.CATALOG_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials:{accessKeyId:env.CATALOG_R2_ACCESS_KEY_ID,secretAccessKey:env.CATALOG_R2_SECRET_ACCESS_KEY},
    maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
  const send=(cmd,ms=25000)=>s3.send(cmd,{abortSignal:AbortSignal.timeout(ms)});
  async function head(entry,body) {
    let object;
    try { object=await send(new HeadObjectCommand({Bucket:GIFT_BOX_MEDIA.bucket,Key:entry.key})); }
    catch (error) { if (error?.$metadata?.httpStatusCode===404 || error?.name==='NotFound' || error?.name==='NoSuchKey') return false; throw error; }
    const valid = Number(object.ContentLength) === body.length && object.ContentType === 'image/webp'
      && object.Metadata?.sha256 === entry.sha256 && cleanEtag(object.ETag) === md5(body);
    if (!valid) throw new Error(`R2_EXISTING_OBJECT_CONFLICT: ${entry.key}`);
    return true;
  }
  const pending=[];
  for (const entry of local.verifiedFiles) {
    const body=await readFile(entry.file);
    if (!await head(entry,body)) pending.push({entry,body});
  }
  console.log(JSON.stringify({remoteCheck:true,bucket:GIFT_BOX_MEDIA.bucket,verifiedExisting:local.files-pending.length,
    pending:pending.length,existingCatalogObjectsUnchanged:true,writeAuthorized:uploading}));
  if (!uploading) { console.log('READ-ONLY R2 VERIFICATION COMPLETE. No writes.'); return; }
  // All existing objects have been verified before any writes. Every key is a NEW namespaced prefix.
  let uploaded=0;
  for (const {entry,body} of pending) {
    try {
      await send(new PutObjectCommand({Bucket:GIFT_BOX_MEDIA.bucket,Key:entry.key,Body:body,
        ContentType:'image/webp',CacheControl:'public, max-age=31536000, immutable',Metadata:{sha256:entry.sha256},
        IfNoneMatch:'*'}),45000);
    } catch (error) {
      // A timeout may mean a completed upload. Recheck before deciding whether to stop.
      if (!await head(entry,body)) throw error;
    }
    if (!await head(entry,body)) throw new Error('R2_UPLOAD_NOT_VERIFIABLE');
    uploaded++;
    if (uploaded%25===0 || uploaded===pending.length) console.log(`Verified newly created objects: ${uploaded}/${pending.length}`);
  }
  console.log(`DONE: ${local.files} versioned Gift Box objects verified in R2; previous catalog keys untouched.`);
}
try { await run(); } catch (error) { console.error(`STOPPED: ${safeError(error)} ${/^R2_[A-Z_]+$/.test(error.message||'') ? error.message : ''}`); process.exitCode=1; }
finally { s3?.destroy(); }
