import test from 'node:test';
import assert from 'node:assert/strict';
import { GIFT_BOX_MEDIA } from '../../../shared/gift-box/public-media.v1.mjs';
import { configuredGiftBoxMedia, publicGiftBoxMediaUrl, validGiftBoxMediaBaseUrl } from './public-media-url.mjs';

const baseUrl='https://media.example.com';
const releaseId=GIFT_BOX_MEDIA.releaseId;
test('public Gift Box media remains disabled without an exact HTTPS origin and release', () => {
  for (const base of [undefined,'','http://media.example.com','https://localhost','https://media.example.com/extra',
    'https://a:b@media.example.com','https://media.example.com/?x=1','https://media.example.com/#x']) {
    assert.equal(validGiftBoxMediaBaseUrl(base),false);
    assert.equal(publicGiftBoxMediaUrl({baseUrl:base,releaseId,componentId:'box-2',role:'selection'}),null);
  }
  assert.equal(configuredGiftBoxMedia({baseUrl,releaseId:'another-version'}),false);
  assert.equal(publicGiftBoxMediaUrl({baseUrl,releaseId:'another-version',componentId:'box-2',role:'selection'}),null);
});

test('fixed component artwork URLs use exact immutable R2 keys and corrected Box 1 placement', () => {
  const entries=GIFT_BOX_MEDIA.entries;
  for (const entry of entries.filter(e=>e.role !== 'bow')) {
    const url=publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:entry.componentId,role:entry.role,width:entry.width});
    assert.equal(url,`${baseUrl}/${entry.key}`);
  }
  assert.match(publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:'box-1',role:'placement'}),/corrected-box1\/1200\/boxes\/box-1-open-top\.webp$/);
  assert.equal(publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:'not-a-component',role:'selection'}),null);
  assert.equal(publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:'box-2',role:'placement',width:640}),
    publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:'box-2',role:'placement'}));
});

test('all 21 ribbon URLs are mapped without exposing private or client-chosen keys', () => {
  for (const entry of GIFT_BOX_MEDIA.entries.filter(e=>e.role==='bow')) {
    assert.equal(publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:entry.componentId,role:'bow'}),`${baseUrl}/${entry.key}`);
  }
  assert.equal(publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:'ribbon-nonsense',role:'bow'}),null);
  assert.equal(publicGiftBoxMediaUrl({baseUrl,releaseId,componentId:'box-2',role:'admin'}),null);
});
