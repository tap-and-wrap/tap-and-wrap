import test from 'node:test';
import assert from 'node:assert/strict';
import { photoPrintFootprint, photoPrintPosition, movePhotoPrint } from '../../client/src/gift-box/photo-print-study.mjs';

test('photo print geometry remains a separate visual-only proposal', () => {
  assert.equal(photoPrintPosition('box-1',0),null); // Known broken source remains blocked.
  const first=photoPrintPosition('box-2',0), second=photoPrintPosition('box-2',1);
  assert.equal(first.placementZone,'beside');
  assert.equal(second.placementZone,'beside');
  assert.notEqual(first.x,second.x);
  assert.ok(first.width>0 && first.height>0);
  assert.ok(photoPrintFootprint('box-2').height>photoPrintFootprint('box-7').height);
});
test('photo can move beside to inside and back without touching component selections', () => {
  const before=photoPrintPosition('box-2',0);
  const inside=movePhotoPrint('box-2',before,{x:.45,y:.48});
  assert.equal(inside.placementZone,'inside');
  const beside=movePhotoPrint('box-2',inside,{x:1.10,y:.57});
  assert.equal(beside.placementZone,'beside');
  assert.deepEqual(photoPrintPosition('box-2',0,beside),beside);
  const forced=movePhotoPrint('box-2',inside,inside,'beside');
  assert.equal(forced.placementZone,'beside');
});
test('invalid photo movement stays unchanged and photo coordinates do not imply approval', () => {
  const before=photoPrintPosition('box-2',0);
  assert.equal(movePhotoPrint('box-2',before,{x:Infinity,y:.5}),before);
  assert.deepEqual(Object.keys(before).sort(), ['anchorOffsetY','height','layerBase','placementZone','regionId','width','x','y'].sort());
});
