import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDatabase } from './helpers/database.js';
import { env } from '../src/config/env.js';
import { Upload } from '../src/models/Upload.js';
import { UploadQuota } from '../src/models/UploadQuota.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { signUpload, completeUpload, validateGiftBoxPhotoUploadReferences, validateUploadReferences } from '../src/commerce/uploads.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
const owner = `guest:${'a'.repeat(64)}`;
const other = `guest:${'b'.repeat(64)}`;
let db, storage;
const previous = env.giftBoxBuilderBackendEnabled;

before(async () => { db=await startTestDatabase({models:[Upload,UploadQuota,AdminAudit],transactions:true}); });
after(async () => { env.giftBoxBuilderBackendEnabled=previous; setStorageForTests(); await db?.stop(); });
beforeEach(async () => {
  await Promise.all([Upload.deleteMany({}), UploadQuota.deleteMany({}),AdminAudit.deleteMany({})]);
  env.giftBoxBuilderBackendEnabled=true;
  storage=createMemoryStorage(); setStorageForTests(storage);
});

const photoInput = (patch={}) => ({purpose:'gift_box_photo',giftBoxId:'box-2',mimeType:'image/png',sizeBytes:PNG.length,...patch});

test('private Gift Box upload is owner-bound, box-bound, image-verified and has no public R2 key', async () => {
  const signed=await signUpload(owner,photoInput());
  assert.equal(signed.upload.purpose,'gift_box_photo');
  assert.equal(signed.upload.giftBoxId,'box-2');
  assert.equal(signed.upload.productId,null);
  assert.equal(JSON.stringify(signed.upload).includes('objectKey'),false);
  const record=await Upload.findById(signed.upload.id).select('+temporaryKey +objectKey');
  assert.equal(record.giftBoxId,'box-2');
  assert.equal(record.productId == null,true);
  storage.put(record.temporaryKey,PNG);
  const complete=await completeUpload(signed.upload.id,owner);
  assert.equal(complete.state,'complete');
  assert.equal(complete.width,1);
  const references=await validateGiftBoxPhotoUploadReferences([signed.upload.id],owner,'box-2');
  assert.deepEqual(references,[{id:signed.upload.id,width:1,height:1}]);
  await assert.rejects(validateGiftBoxPhotoUploadReferences([signed.upload.id],other,'box-2'),{code:'INVALID_UPLOAD_REFERENCES'});
  await assert.rejects(validateGiftBoxPhotoUploadReferences([signed.upload.id],owner,'box-1'),{code:'INVALID_UPLOAD_REFERENCES'});
  await assert.rejects(validateUploadReferences([signed.upload.id],owner,{purpose:'personalization'}),{code:'INVALID_UPLOAD_REFERENCES'});
  await assert.rejects(validateGiftBoxPhotoUploadReferences([signed.upload.id,signed.upload.id],owner,'box-2'),{code:'INVALID_UPLOAD_REFERENCES'});
});

test('scope cannot be forged with fake products, unrelated upload fields, or invalid boxes',async()=>{
  for(const patch of [{productId:'a'.repeat(24)},{fieldKey:'photo'},{requestKey:'00000000-0000-4000-8000-000000000001'},
    {orderId:'a'.repeat(24)},{templateVersion:1},{giftBoxId:'box-99'},{giftBoxId:'plush-1'},{giftBoxId:undefined}]){
    await assert.rejects(signUpload(owner,photoInput(patch)),{code:'GIFT_BOX_UPLOAD_SCOPE_INVALID'});
  }
  await assert.rejects(signUpload(owner,photoInput({sizeBytes:8*1024*1024+1})),{code:'INVALID_UPLOAD_FILE'});
  await assert.rejects(signUpload(owner,{...photoInput(),purpose:'service_reference'}),{code:'GIFT_BOX_UPLOAD_SCOPE_INVALID'});
  await assert.rejects(validateGiftBoxPhotoUploadReferences([],owner,'not-a-box'),{code:'GIFT_BOX_UPLOAD_SCOPE_INVALID'});
});

test('feature closure denies Gift Box photo signing while leaving other private storage paths untouched', async () => {
  env.giftBoxBuilderBackendEnabled=false;
  await assert.rejects(signUpload(owner,photoInput()),{code:'GIFT_BOX_UPLOAD_DISABLED'});
  assert.equal(await Upload.countDocuments(),0);
  assert.equal(await UploadQuota.countDocuments(),0);
});
