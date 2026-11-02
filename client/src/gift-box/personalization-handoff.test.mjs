import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareGiftBoxPersonalizationHandoff } from './personalization-handoff.mjs';
const id='f0000000-0000-4000-8000-000000000001', uploadId='a'.repeat(24);
const personal={photos:[{id,file:{type:'image/png',size:100},name:'secret-family-photo.png',url:'blob:never-send'}],photoPositions:{},
 engravings:[{id:'line-1',text:'أحمد ٢٠٢٦',styleId:'lettering-12',colorId:'black'}]};
const complete={boxId:'box-2',personal,uploaded:[{photoId:id,uploadId}],printOptionsByPhoto:{[id]:'standard-print'},surfaceOptionsByEngraving:{'line-1':'engraving-front'}};
test('intended photo order, zones and Unicode text survive while files and prices never leave browser',()=>{
 const handoff=prepareGiftBoxPersonalizationHandoff(complete);
 assert.equal(handoff.photoPrints.length,1);assert.equal(handoff.photoPrints[0].uploadId,uploadId);
 assert.equal(handoff.engravings[0].text,'أحمد ٢٠٢٦');
 const json=JSON.stringify(handoff);for(const disallowed of ['secret-family-photo','blob:','pricePiastres','approval','type":"image/png'])assert.equal(json.includes(disallowed),false);
});
test('missing print options, photo upload and selected engraving surface are rejected',()=>{
 assert.throws(()=>prepareGiftBoxPersonalizationHandoff({...complete,uploaded:[]}),/Upload every/);
 assert.throws(()=>prepareGiftBoxPersonalizationHandoff({...complete,printOptionsByPhoto:{}}),/Choose a print/);
 assert.throws(()=>prepareGiftBoxPersonalizationHandoff({...complete,surfaceOptionsByEngraving:{}}),/Choose a surface/);
});
test('photo identities cannot repeat, forge upload ids or change to unrelated boxes',()=>{
 assert.throws(()=>prepareGiftBoxPersonalizationHandoff({...complete,uploaded:[{photoId:id,uploadId:'blob:forged'}]}),/Invalid/);
 assert.throws(()=>prepareGiftBoxPersonalizationHandoff({...complete,boxId:'not-a-box'}),/Choose a print/);
});
