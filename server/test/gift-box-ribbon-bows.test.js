import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';
import { RIBBON_BOW_FILES, RIBBON_BOW_VERSION, ribbonBowFilename, ribbonBowLocalUrl } from '../../shared/gift-box/ribbon-bows.mjs';
import { allowedRibbonBowEntry } from '../../client/scripts/gift-box-ribbon-bows.mjs';

const bows=FIXED_COMPONENTS.filter(item=>item.category==='ribbon');
test('21 bow filenames correspond exactly to immutable ribbon color identities',()=>{
  assert.equal(RIBBON_BOW_FILES.length,21);
  assert.equal(new Set(RIBBON_BOW_FILES.map(x=>x.filename)).size,21);
  assert.deepEqual(RIBBON_BOW_FILES.map(x=>x.componentId),bows.map(x=>x.id));
  for(const item of bows){
    assert.equal(ribbonBowFilename(item.id),`ribbon-${item.id.slice(7)}-bow.webp`);
    assert.equal(ribbonBowLocalUrl(item.id),`/__gift-box-ribbon-bows/${RIBBON_BOW_VERSION}/${ribbonBowFilename(item.id)}`);
  }
  assert.equal(ribbonBowFilename('ribbon-invented'),null);
  assert.equal(ribbonBowLocalUrl('../secret'),null);
});
test('local bow middleware allows only known, integrity-pinned image identities',()=>{
  const entry={componentId:'ribbon-red',filename:'ribbon-red-bow.webp',bytes:1024,width:1200,height:1200,sha256:'a'.repeat(64)};
  assert.equal(allowedRibbonBowEntry(entry,entry.filename),true);
  for(const patch of [{componentId:'ribbon-gold'},{filename:'../secret'},{sha256:'unsafe'},{bytes:0},{width:1}]){
    assert.equal(allowedRibbonBowEntry({...entry,...patch},entry.filename),false);
  }
  assert.equal(allowedRibbonBowEntry(entry,'development-manifest.json'),false);
});
