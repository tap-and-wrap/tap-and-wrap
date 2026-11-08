import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSelectedImages } from './selected-images.mjs';
const png = Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
const make = (name='photo.png',type='image/png',bytes=png) => new File([Array.isArray(bytes)?Uint8Array.from(bytes):bytes],name,{type,lastModified:123});
const inspect = async()=>{};
test('native bytes are retained until copied, and owned File survives handle invalidation',async()=>{
  let alive=true,release;const source=make(),read=source.arrayBuffer.bind(source);
  source.arrayBuffer=async()=>{await new Promise(r=>{release=r;});assert.equal(alive,true);return read();};
  const promise=prepareSelectedImages([source],{inspect});await Promise.resolve();release();const [owned]=await promise;alive=false;
  source.arrayBuffer=async()=>{throw Error('native handle invalid');};
  assert.notEqual(source,owned);assert.deepEqual(new Uint8Array(await owned.arrayBuffer()),png);assert.equal(owned.name,source.name);assert.equal(owned.lastModified,123);
});
test('FileReader fallback handles providers failing arrayBuffer without premature release',async()=>{
  const previous=globalThis.FileReader;let reads=0;const file=make();file.arrayBuffer=async()=>{throw new DOMException('unreadable','NotReadableError');};
  globalThis.FileReader=class {readAsArrayBuffer(){reads++;this.result=png.slice().buffer;queueMicrotask(()=>this.onload());}abort(){this.onabort();}};
  try{const [owned]=await prepareSelectedImages([file],{inspect});assert.equal(reads,1);assert.equal(owned.size,png.length);}finally{globalThis.FileReader=previous;}
});
test('failed native reads preserve a retryable error without accepting a selection',async()=>{
  const file=make();file.arrayBuffer=async()=>{throw Error('not readable');};await assert.rejects(prepareSelectedImages([file],{inspect}),/could not be read/);
});
test('cancelled and empty selections produce no owned files',async()=>{
  assert.deepEqual(await prepareSelectedImages([],{inspect}),[]);const controller=new AbortController();controller.abort();await assert.rejects(prepareSelectedImages([make()],{inspect,signal:controller.signal}),{name:'AbortError'});
});
test('cancellation during byte copy prevents a stale selection from being delivered',async()=>{
  const file=make(),controller=new AbortController();file.arrayBuffer=async()=>{controller.abort();return png.buffer;};await assert.rejects(prepareSelectedImages([file],{inspect,signal:controller.signal}),{name:'AbortError'});
});
test('valid multi-image batches preserve order and distinct owned file identities',async()=>{
  const files=[make('one.png'),make('two.png')],result=await prepareSelectedImages(files,{inspect,maxFiles:2});assert.deepEqual(result.map(f=>f.name),['one.png','two.png']);assert.ok(result.every((f,i)=>f!==files[i]));
});
for(const [name,file,options,pattern] of [
 ['empty file',make('empty.png','image/png',[]),{},/empty/],
 ['HEIC',make('photo.heic','image/heic'),{},/HEIC/],
 ['MIME mismatch',make('photo.jpg','image/jpeg'),{},/unsupported/],
 ['bad signature',make('bad.png','image/png',[1,2,3]),{},/unsupported/],
 ['per-file budget',make(),{maxBytes:5},/smaller/],
 ['total budget',make(),{maxTotalBytes:5},/smaller/],
 ['field MIME policy',make(),{acceptedTypes:['image/jpeg']},/unsupported/]
])test(name+' is rejected before delivery',async()=>{await assert.rejects(prepareSelectedImages([file],{inspect,...options}),pattern);});
test('count limit rejects the complete batch',async()=>{await assert.rejects(prepareSelectedImages([make(),make()],{inspect}),/no more than 1/);});
test('short native reads never become uploadable images',async()=>{const file=make();file.arrayBuffer=async()=>png.slice(0,8).buffer;await assert.rejects(prepareSelectedImages([file],{inspect}),/fully read/);});
test('empty browser MIME is inferred from actual image bytes',async()=>{const [owned]=await prepareSelectedImages([make('photo.png','')],{inspect});assert.equal(owned.type,'image/png');});
test('preview decoding failure rejects the entire batch without replacing the previous file',async()=>{await assert.rejects(prepareSelectedImages([make()],{inspect:async()=>{throw Error('decode failure');}}),/decode failure/);});
test('zero last-modified dates remain stable for duplicate selection identity',async()=>{const [owned]=await prepareSelectedImages([new File([png],'photo.png',{type:'image/png',lastModified:0})],{inspect});assert.equal(owned.lastModified,0);});
test('hung native providers time out with an actionable retry message',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const file=make();file.arrayBuffer=()=>new Promise(()=>{});
  const result=assert.rejects(prepareSelectedImages([file],{inspect}),/too long to read/);t.mock.timers.tick(30001);await result;
});
test('cancel interrupts a provider that never resolves its byte read',async()=>{
  const file=make(),controller=new AbortController();file.arrayBuffer=()=>new Promise(()=>{});
  const result=assert.rejects(prepareSelectedImages([file],{inspect,signal:controller.signal}),{name:'AbortError'});controller.abort();await result;
});
for(const [type,bytes] of [['image/jpeg',[255,216,255,224]],['image/webp',[82,73,70,70,1,0,0,0,87,69,66,80]]])test(type+' bytes preserve their original format',async()=>{const [owned]=await prepareSelectedImages([make('photo',type,bytes)],{inspect});assert.equal(owned.type,type);assert.equal(owned.size,bytes.length);});
