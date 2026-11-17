import test from 'node:test';
import assert from 'node:assert/strict';
import { PREPARATION_LIMIT, validPreparation, restoredPreparationStatus, uncertainCartFailure,
  canCancelPreparation, visiblePreparation, reusableEngravingUploadId } from './background-cart-contract.mjs';
const key='a0000000-0000-4000-8000-000000000001';
const owner='a'.repeat(64);
const base={kind:'gift_box_v2',ownerContext:owner,operationKey:key,snapshot:{personal:{photos:[]}},receipts:{},status:'queued',stage:'uploading'};
test('only correctly formed scoped operations are restorable',()=>{
 assert.equal(validPreparation(base),true);
 assert.equal(validPreparation({...base,ownerContext:'user:one'}),false);
 assert.equal(validPreparation({...base,operationKey:'not-uuid'}),false);
 assert.equal(validPreparation({...base,snapshot:null}),false);
 assert.equal(PREPARATION_LIMIT,12);
});
test('an interrupted cart write never auto-replays after refresh',()=>{
 assert.equal(restoredPreparationStatus({...base,status:'preparing',payload:{kind:'gift_box_v2',operationKey:key}}),'uncertain');
 assert.equal(restoredPreparationStatus({...base,status:'preparing',stage:'saving'}),'uncertain');
 assert.equal(restoredPreparationStatus({...base,status:'preparing'}),'queued');
 assert.equal(restoredPreparationStatus({...base,status:'failed'}),'failed');
});
test('network and 5xx after a cart write are uncertain; 4xx is explicit failure',()=>{
 const sent={...base,payload:{operationKey:key}};
 assert.equal(uncertainCartFailure(sent,new Error('connection closed')),true);
 assert.equal(uncertainCartFailure(sent,{response:{status:502}}),true);
 assert.equal(uncertainCartFailure(sent,{response:{status:409,data:{error:{code:'OPERATION_IN_PROGRESS'}}}}),true);
 assert.equal(uncertainCartFailure(sent,{response:{status:400,data:{error:{code:'INVALID_UPLOAD_REFERENCES'}}}}),false);
 assert.equal(uncertainCartFailure(base,new Error('upload interrupted')),false);
});
test('cancel only before a potentially applied cart write',()=>{
 assert.equal(canCancelPreparation(base),true);
 assert.equal(canCancelPreparation({...base,status:'uncertain'}),false);
 assert.equal(canCancelPreparation({...base,stage:'saving'}),false);
 assert.equal(canCancelPreparation({...base,payload:{operationKey:key}}),false);
 assert.equal(canCancelPreparation({...base,status:'failed',stage:'saving',payload:{operationKey:key},definitiveReject:true}),true);
 assert.equal(restoredPreparationStatus({...base,status:'failed',stage:'saving',payload:{operationKey:key},definitiveReject:true}),'failed');
});
test('the cart view never exposes stored private files, request payloads or receipts',()=>{
 const shown=visiblePreparation({...base,label:'Gift Box',snapshot:{secret:'private'},receipts:{file:'receipt'},payload:{secret:'private'}});
 assert.equal(JSON.stringify(shown).includes('private'),false);
 assert.equal('snapshot' in shown,false);
 assert.equal('receipts' in shown,false);
 assert.equal('payload' in shown,false);
});

test('same-owner verified engraving edit reuses only existing 24-character upload references',()=>{
 const original='6afca956fc55128ef65e0844', fingerprint='b'.repeat(64);
 const edit={assetId:original,replaceLineId:key,replaceFingerprint:fingerprint,ownerScope:owner,ownerContext:owner};
 assert.equal(reusableEngravingUploadId(edit),original);
 assert.equal(reusableEngravingUploadId({...edit,assetId:'new-image-uuid'}),null);
 assert.equal(reusableEngravingUploadId({...edit,replaceLineId:null}),null);
 assert.equal(reusableEngravingUploadId({...edit,replaceFingerprint:null}),null);
 assert.equal(reusableEngravingUploadId({...edit,replaceFingerprint:'wrong'}),null);
 assert.equal(reusableEngravingUploadId({...edit,ownerContext:'c'.repeat(64)}),null);
 assert.equal(reusableEngravingUploadId({...edit,ownerScope:'c'.repeat(64)}),null);
 assert.equal(reusableEngravingUploadId({...edit,replaceLineId:'not a cart line'}),null);
 assert.equal(reusableEngravingUploadId({...edit,assetId:original+'1'}),null);
});
