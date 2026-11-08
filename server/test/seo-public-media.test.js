import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {verifyPublicCatalogMedia} from '../scripts/verify-seo-public-media.js';
const url='https://media.tapandwrap.net/fixture.webp';
test('media verifier reads and hashes actual bytes, checks dimensions and deduplicates URLs',async()=>{
 const bytes=await sharp({create:{width:4,height:2,channels:3,background:'#915b50'}}).webp().toBuffer();let reads=0;
 const result=await verifyPublicCatalogMedia([url,url],{fetchImage:async()=>{reads++;return new Response(bytes,{headers:{'content-type':'image/webp',etag:'"verified-fixture"'}});}});
 assert.equal(reads,1);assert.equal(result.failures.length,0);assert.equal(result.objects[0].sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(result.objects[0].width,4);assert.equal(result.objects[0].height,2);
});
test('private/foreign URLs are rejected before any provider request',async()=>{
 for(const value of ['https://media.tapandwrap.net/private/photo.webp','https://foreign.example/photo.webp','https://media.tapandwrap.net/photo.webp?signature=private'])await assert.rejects(verifyPublicCatalogMedia([value],{fetchImage:()=>{throw Error('must not fetch');}}));
});
test('failed, undecodable or incorrectly labelled images never gain media approval',async()=>{
 const png=await sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).png().toBuffer();
 for(const response of [()=>new Response('missing',{status:404}),()=>new Response('broken',{headers:{'content-type':'image/webp'}}),()=>new Response(png,{headers:{'content-type':'image/webp'}})]){
  const result=await verifyPublicCatalogMedia([url],{fetchImage:async()=>response()});assert.equal(result.objects.length,0);assert.equal(result.failures.length,1);
 }
});
