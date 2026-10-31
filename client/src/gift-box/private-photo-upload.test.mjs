import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGiftBoxPhotoBatch, uploadGiftBoxPrivatePhotos } from './private-photo-upload.mjs';
const id1='f0000000-0000-4000-8000-000000000001', id2='f0000000-0000-4000-8000-000000000002';
const a={type:'image/png',size:200}, b={type:'image/webp',size:300};
const photos=[{id:id1,file:a,name:'private family image.png',url:'blob:never-send'}, {id:id2,file:b,url:'blob:never-send-2'}];
test('photo upload is scoped to a real gift box and never sends local files or previews in its result', async () => {
  const calls=[], uploadedIds=[], cache=new Map();
  const uploadFile=async (file,options,ids) => {calls.push({file,options});const id=String(calls.length).padStart(24,'0'); ids.push(id); return id;};
  const result=await uploadGiftBoxPrivatePhotos({photos,boxId:'box-2',ownerKey:'guest-scope-1',uploadFile,uploadedIds,cache});
  assert.deepEqual(result,[{photoId:id1,uploadId:'000000000000000000000001'}, {photoId:id2,uploadId:'000000000000000000000002'}]);
  assert.equal(JSON.stringify(result).includes('private family'),false);
  assert.equal(JSON.stringify(result).includes('blob:'),false);
  assert.deepEqual(calls.map(x=>x.options),[{purpose:'gift_box_photo',giftBoxId:'box-2',onProgress:undefined},{purpose:'gift_box_photo',giftBoxId:'box-2',onProgress:undefined}]);
  const retry=await uploadGiftBoxPrivatePhotos({photos,boxId:'box-2',ownerKey:'guest-scope-1',uploadFile,uploadedIds,cache});
  assert.deepEqual(retry,result); assert.equal(calls.length,2);
});
test('unsupported and duplicate photos, wrong boxes and invalid file sizes fail before an upload', async () => {
  assert.throws(()=>validateGiftBoxPhotoBatch(photos,'not-a-box'),/Choose a gift box/);
  assert.throws(()=>validateGiftBoxPhotoBatch([{...photos[0],file:{type:'image/svg+xml',size:10}}],'box-2'),/distinct supported/);
  assert.throws(()=>validateGiftBoxPhotoBatch([{...photos[0],file:{type:'image/png',size:0}}],'box-2'),/distinct supported/);
  assert.throws(()=>validateGiftBoxPhotoBatch([photos[0],{...photos[0],id:id2}],'box-2'),/distinct supported/);
  assert.throws(()=>validateGiftBoxPhotoBatch(Array(21).fill(photos[0]),'box-2'),/20 private files/);
});
test('failed upload cannot become a verified photo reference or cached success', async () => {
  const cache=new Map();
  await assert.rejects(uploadGiftBoxPrivatePhotos({photos:photos.slice(0,1),boxId:'box-2',ownerKey:'guest-scope-1',cache,
    uploadFile:async()=>{throw new Error('private storage unavailable');}}),/unavailable/);
  assert.equal(cache.size,0);
  await assert.rejects(uploadGiftBoxPrivatePhotos({photos:photos.slice(0,1),boxId:'box-2',ownerKey:'guest-scope-1',cache,
    uploadFile:async()=> 'blob:not-an-upload'}),/could not be verified/);
  assert.equal(cache.size,0);
});

test('cache cannot reuse a private upload across boxes or shopping sessions', async () => {
  const cache=new Map(); let n=0;
  const uploadFile=async()=>String(++n).padStart(24,'0');
  const first=await uploadGiftBoxPrivatePhotos({photos:photos.slice(0,1),boxId:'box-2',ownerKey:'session-1',uploadFile,cache});
  const second=await uploadGiftBoxPrivatePhotos({photos:photos.slice(0,1),boxId:'box-3',ownerKey:'session-1',uploadFile,cache});
  const third=await uploadGiftBoxPrivatePhotos({photos:photos.slice(0,1),boxId:'box-3',ownerKey:'session-2',uploadFile,cache});
  assert.notEqual(first[0].uploadId,second[0].uploadId);
  assert.notEqual(second[0].uploadId,third[0].uploadId);
  assert.equal(n,3);
});
