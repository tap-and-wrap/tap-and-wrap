import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { publicImageUrl } from '../../shared/product-seo.mjs';

// Explicitly invoked by an authorized release/renewal operator only. Normal
// builds never fetch media. Reads public catalog objects; never signs private URLs.
export async function verifyPublicCatalogMedia(urls, { fetchImage = fetch, now = () => new Date(), concurrency = 4, lifetimeSeconds = 86400 } = {}) {
  if (!Array.isArray(urls) || urls.length > 10000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8
    || !Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > 86400) throw new Error('Invalid media verification bounds');
  const queue=[...new Set(urls)], objects=[], failures=[]; let cursor=0;
  if(queue.some(url=>!publicImageUrl(url,['https://media.tapandwrap.net'])))throw new Error('Only approved public catalog media may be verified');
  async function worker(){for(;;){const index=cursor++;if(index>=queue.length)return;const url=queue[index];
    try{
      const response=await fetchImage(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'image/avif,image/webp,image/png,image/jpeg'}});
      const contentType=(response.headers.get('content-type')||'').split(';')[0];
      if(!response.ok||!['image/webp','image/jpeg','image/png','image/avif'].includes(contentType))throw Error('MEDIA_RESPONSE_INVALID');
      const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.byteLength;if(size>20*1024*1024)throw Error('MEDIA_TOO_LARGE');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);if(!size)throw Error('MEDIA_EMPTY');
      const metadata=await sharp(bytes,{limitInputPixels:400000000}).metadata();
      if(!['webp','jpeg','png','avif','heif'].includes(metadata.format)||!metadata.width||!metadata.height||metadata.width>20000||metadata.height>20000)throw Error('MEDIA_DECODE_INVALID');
      if(({webp:'image/webp',jpeg:'image/jpeg',png:'image/png',avif:'image/avif',heif:'image/avif'})[metadata.format]!==contentType)throw Error('MEDIA_MIME_MISMATCH');
      await sharp(bytes,{limitInputPixels:40000000}).stats();
      const sha256=createHash('sha256').update(bytes).digest('hex'), verifiedAt=now();
      const etag=(response.headers.get('etag')||'').replace(/^W\//,'').replaceAll('"','');
      objects.push({url,approved:true,sha256,objectVersion:/^[a-zA-Z0-9._:-]{1,200}$/.test(etag)?etag:sha256,contentType,sizeBytes:size,width:metadata.width,height:metadata.height,verifiedAt:verifiedAt.toISOString(),validUntil:new Date(verifiedAt.valueOf()+lifetimeSeconds*1000).toISOString()});
    }catch{failures.push({url,reason:'Public object read, type, size or image decoding failed'});}
  }}
  await Promise.all(Array.from({length:concurrency},worker));objects.sort((a,b)=>a.url.localeCompare(b.url));failures.sort((a,b)=>a.url.localeCompare(b.url));
  return {version:1,source:'authorized-media-object-verification',objects,failures};
}
