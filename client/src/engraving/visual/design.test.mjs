import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDesign, fitLayer, editLayer, layerHeight, validateDesign, createVisualDraft, restoreVisualDraft, designReadiness, newHistory, commitHistory, undoHistory, redoHistory } from './design.mjs';

const design = () => ({ ...emptyDesign(), surface: { assetId: 'surface', aspectRatio: 1.5 }, layers: [{ id: 'words', type: 'text', x: .5, y: .5, width: .4, aspectRatio: 3, text: 'Our story', fontId: 'engraving-amiri-v1', color: 'black' }, { id: 'art', type: 'image', assetId: 'artwork', x: .6, y: .6, width: .2, aspectRatio: 2 }] });
test('text and image rotations preserve aspect ratio, bounds and old unrotated snapshots', () => {
  assert.deepEqual(validateDesign(design()), design());
  for (const surfaceRatio of [.05,1,1.5,20]) for (const rotation of [-180,-135,-90,-35,0,45,90,135,180]) for (const source of design().layers) {
    const layer=fitLayer({...source,x:0,y:1,width:2,rotation},surfaceRatio),r=rotation*Math.PI/180,c=Math.abs(Math.cos(r)),s=Math.abs(Math.sin(r)),height=layerHeight(layer,surfaceRatio);
    const w=c*layer.width+s*height/surfaceRatio,h=s*layer.width*surfaceRatio+c*height;
    assert.ok(layer.x-w/2>=-1e-7&&layer.x+w/2<=1+1e-7&&layer.y-h/2>=-1e-7&&layer.y+h/2<=1+1e-7);
    const value={...emptyDesign(),surface:{assetId:'surface',aspectRatio:surfaceRatio},layers:[layer]};
    assert.deepEqual(validateDesign(JSON.parse(JSON.stringify(value))),value);
  }
  for(const rotation of [NaN,Infinity,null,'90',181,-181])assert.throws(()=>validateDesign({...design(),layers:[{...design().layers[0],rotation}]}));
});
test('proportional draft survives JSON reconstruction with exact layering and separate assets', () => {
  const saved = JSON.parse(JSON.stringify(createVisualDraft('guest:3:cart', design())));
  assert.deepEqual(restoreVisualDraft(saved, 'guest:3:cart'), design());
  assert.throws(() => restoreVisualDraft(saved, 'guest:4:cart'));
  const copy = restoreVisualDraft(saved, 'guest:3:cart'); copy.layers[0].text = 'changed'; assert.equal(saved.design.layers[0].text, 'Our story');
});
test('free placement and proportional resize remain within uncropped surface at every aspect ratio', () => {
  for (const surfaceRatio of [.05, .8, 1.5, 20]) for (const aspectRatio of [.05, 1, 2, 20]) {
    const layer = fitLayer({ ...design().layers[1], x: -1, y: 2, width: 3, aspectRatio }, surfaceRatio);
    assert.ok(layer.x >= layer.width / 2 && layer.x <= 1 - layer.width / 2);
    const height = layerHeight(layer, surfaceRatio); assert.ok(height <= 1);
    assert.equal(layer.width * surfaceRatio / height, aspectRatio);
    validateDesign({ ...emptyDesign(), surface: { assetId: 'surface', aspectRatio: surfaceRatio }, layers: [layer] });
  }
});
test('one committed drag is one undo, redo preserves geometry and an edit invalidates redo', () => {
  const first = design(), next = editLayer(first, 'art', { x: .7, width: .3 });
  const history = commitHistory(newHistory(first), next), undone = undoHistory(history);
  assert.deepEqual(undone.present, first); assert.deepEqual(redoHistory(undone).present, next);
  assert.equal(commitHistory(undone, editLayer(first, 'art', { y: .4 })).future.length, 0);
});
test('saved designs reject URLs, prices, missing roles, icons, unapproved font identities and unsafe text', () => {
  const invalid = [
    d => { d.pricePiastres = 10000; }, d => { d.layers[0].url = 'https://private.test'; },
    d => { d.layers[1].assetId = 'surface'; }, d => { d.layers[1].type = 'icons'; },
    d => { d.layers[0].fontId = 'random'; }, d => { d.layers[0].text = '\u0000'; },
    d => { d.layers[0].x = NaN; }, d => { d.layers[1].id = 'words'; },
    d => { d.layers[0].text = 'ذكريات'; d.layers[0].fontId = 'engraving-rochester-v1'; },
    d => { d.surface = null; }, d => { d.layers[0].width = 4; },
  ];
  for (const mutate of invalid) { const value = design(); mutate(value); assert.throws(() => validateDesign(value)); }
});
test('Arabic stays literal and legacy icon specifications are never silently converted', () => {
  const value = design(); value.layers[0].text = 'أجمل ذكرى\nلينا'; value.layers[0].color = 'white';
  assert.deepEqual(validateDesign(value), value);
  assert.throws(() => validateDesign({ contractVersion: 'engraving-spec-v1', content: { mode: 'icons', iconId: 'engraving-heart-v1' } }));
});
test('readiness fails closed for expired assets, blank text and withdrawn font approval', () => {
  assert.equal(designReadiness(design()).ready, false);
  const inputs = { approvedFontIds: ['engraving-amiri-v1'], availableAssetIds: ['surface', 'artwork'] };
  assert.equal(designReadiness(design(), inputs).ready, true);
  const blank = design(); blank.layers[0].text = '  ';
  assert.deepEqual(designReadiness(blank, inputs).issues, ['text_empty']);
  assert.deepEqual(designReadiness(design(), { ...inputs, approvedFontIds: [] }).issues, ['font_unapproved']);
  assert.deepEqual(designReadiness(design(), { ...inputs, availableAssetIds: ['surface'] }).issues, ['artwork_unavailable']);
});
