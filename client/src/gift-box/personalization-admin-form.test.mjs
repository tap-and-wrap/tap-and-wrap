import test from 'node:test';
import assert from 'node:assert/strict';
import { giftBoxOptionDraft, newGiftBoxOption, giftBoxOptionEditorPayload } from './personalization-admin-form.mjs';

const saved = (kind='photo_print') => ({ optionId:'print-small',kind,displayName:'Small print', revision:3,
  configuredPricePiastres:2500,enabled:true,available:true,boxIds:['box-1'],
  approvedStyleIds: kind==='engraving_surface' ? ['lettering-01'] : [],
  approvedColorIds: kind==='engraving_surface' ? ['black'] : [],fontLicensesConfirmed: kind==='engraving_surface' });

test('editing availability never silently reapproves the existing saved price', () => {
  const record=saved(), draft=giftBoxOptionDraft(record); draft.available=false;
  assert.deepEqual(giftBoxOptionEditorPayload(record,draft),{expectedRevision:3,available:false,kind:'photo_print'});
});
test('new option starts unpublished and cannot spoof approval metadata', () => {
  const record=newGiftBoxOption('new-option','photo_print'); const draft=giftBoxOptionDraft(record);
  draft.displayName='New option'; draft.boxIds=['box-2'];
  const result=giftBoxOptionEditorPayload(record,draft);
  assert.equal(result.kind,'photo_print'); assert.equal(result.displayName,'New option');
  assert.equal(result.expectedRevision,0); assert.equal(result.enabled,undefined);
  assert.equal(result.pricePiastres,undefined);
});
test('zero price always requires deliberate complimentary confirmation', () => {
  const record=saved(), draft=giftBoxOptionDraft(record); draft.price='0';
  assert.throws(()=>giftBoxOptionEditorPayload(record,draft),/Explicitly confirm/);
  draft.confirmComplimentary=true;
  assert.deepEqual(giftBoxOptionEditorPayload(record,draft),{expectedRevision:3,pricePiastres:0,confirmComplimentary:true,kind:'photo_print'});
});
test('unpriced reset remains pending, not complimentary', () => {
  const record=saved(), draft=giftBoxOptionDraft(record); draft.price='';
  assert.deepEqual(giftBoxOptionEditorPayload(record,draft),{expectedRevision:3,pricePiastres:null,kind:'photo_print'});
});
test('engraving style and color changes use only approved immutable IDs', () => {
  const record=saved('engraving_surface'), draft=giftBoxOptionDraft(record);
  draft.approvedColorIds=['red','black']; draft.approvedStyleIds=['lettering-12'];
  assert.deepEqual(giftBoxOptionEditorPayload(record,draft),{expectedRevision:3,
    approvedStyleIds:['lettering-12'],approvedColorIds:['red','black'],kind:'engraving_surface'});
  draft.approvedStyleIds=['forged-font'];
  assert.throws(()=>giftBoxOptionEditorPayload(record,draft),/Invalid Gift Box/);
});
test('photo printing cannot gain an engraving license through a stale draft', () => {
  const record=saved(), draft=giftBoxOptionDraft(record); draft.available=false;
  draft.approvedStyleIds=['lettering-01']; draft.fontLicensesConfirmed=true;
  const payload=giftBoxOptionEditorPayload(record,draft);
  assert.equal(payload.approvedStyleIds,undefined); assert.equal(payload.fontLicensesConfirmed,undefined);
});
test('duplicate box IDs, invalid names, prices and forged option IDs are rejected', () => {
  assert.throws(()=>newGiftBoxOption('BAD-KEY','photo_print'));
  const record=saved(); const draft=giftBoxOptionDraft(record);
  draft.boxIds=['box-1','box-1']; assert.throws(()=>giftBoxOptionEditorPayload(record,draft));
  draft.boxIds=['box-1']; draft.price='1.234';assert.throws(()=>giftBoxOptionEditorPayload(record,draft));
  draft.price='25';draft.displayName=' Changed ';assert.throws(()=>giftBoxOptionEditorPayload(record,draft));
});
test('unchanged forms never write or consume a revision', () => {
  const record=saved();assert.throws(()=>giftBoxOptionEditorPayload(record,giftBoxOptionDraft(record)),/Nothing has changed/);
});
