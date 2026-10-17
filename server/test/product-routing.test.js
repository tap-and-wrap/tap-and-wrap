import { createServer } from 'node:http';
﻿import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { ProductAddress } from '../src/models/ProductAddress.js';
import { Category } from '../src/models/Category.js';
import { createProduct, updateProduct } from '../src/catalog/service.js';
import { startTestDatabase } from './helpers/database.js';
import { handleSeoRequest } from '../../client/worker/seo-worker.js';
import { buildApprovedSeoExport } from '../scripts/export-seo-catalog.js';
import { buildSeoPlan } from '../../client/scripts/seo/generator.js';
import { stableDigest } from '../../client/scripts/seo/publication.js';
let db, server, base, category, workerConfig;
const actor={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',role:'admin',active:true};
before(async()=>{db=await startTestDatabase({models:Object.values(mongoose.models),transactions:true});server=createServer(async(req,res)=>{
  if (!req.url.startsWith('/__worker/')) return app(req,res);
  const response=await handleSeoRequest(new Request('https://shop.example'+req.url.slice('/__worker'.length),{method:req.method}),workerConfig);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;env.productAliasesEnabled=true;});
after(async()=>{env.productAliasesEnabled=false;server.closeAllConnections();await new Promise(r=>server.close(r));await db.stop();});
beforeEach(async()=>{await Product.deleteMany({});await ProductAddress.deleteMany({});await Category.deleteMany({});category=await Category.create({name:'Routing gifts',slug:'routing-gifts',active:true});});
const create=(extra={})=>createProduct({name:'Permanent Test Gift',slug:'legacy-source-123',categoryId:category._id,visibility:'public',status:'draft',mainImageKey:'fixtures/gift.webp',galleryKeys:['fixtures/gift.webp'],...extra},{actor});
async function resolution(slugs){const r=await fetch(base+'/api/v1/public/product-addresses?slugs='+encodeURIComponent(slugs));return{status:r.status,body:await r.json(),headers:r.headers};}
function worker(){const assets=new Map([['/spa.html','<h1>React catalog</h1>'],['/404.html','<h1>Missing</h1>']]);const config={SEO_INDEXING_ENABLED:'false',ASSETS:{fetch:async r=>new Response(assets.get(new URL(r.url).pathname)||'Missing',{status:assets.has(new URL(r.url).pathname)?200:404})},ADDRESS_SERVICE:{fetch:input=>fetch(base+new URL(input).pathname+new URL(input).search)}};workerConfig=config;return{config,get:(path,method='GET')=>fetch(base+'/__worker'+path,{method,redirect:'manual'})};}

test('actual API and Worker lifecycle: creation, rename, aliases, withdrawal, deletion and reserved ownership',async()=>{
 const p=await create(), w=worker(), canonical='/products/permanent-test-gift';
 for(const method of ['GET','HEAD']){const r=await w.get('/products/legacy-source-123/?q=a%2Bb&x=1&x=2',method);assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://shop.example'+canonical+'?q=a%2Bb&x=1&x=2');const c=await w.get(canonical,method);assert.equal(c.status,200);if(method==='HEAD')assert.equal(await c.text(),'');}
 await updateProduct(p._id,{expectedRevision:0,name:'Renamed Gift',slug:'new-stored-slug'},{actor});
 for(const slug of ['legacy-source-123','new-stored-slug'])assert.equal((await w.get('/products/'+slug)).headers.get('location'),'https://shop.example'+canonical);
 await assert.rejects(create({slug:'permanent-test-gift',name:'Conflicting owner'}),{code:'PRODUCT_ADDRESS_RESERVED'});
 await updateProduct(p._id,{expectedRevision:1,visibility:'withdrawn'},{actor});for(const path of [canonical,'/products/legacy-source-123','/products/new-stored-slug'])assert.equal((await w.get(path)).status,404);
 await Product.deleteOne({_id:p._id});assert.equal((await w.get(canonical)).status,404);assert.equal((await w.get('/products/unknown')).status,404);
 assert.ok(await ProductAddress.exists({slug:'permanent-test-gift',productId:p._id}));await assert.rejects(create({slug:'legacy-source-123'}),{code:'PRODUCT_ADDRESS_RESERVED'});
});

test('public enquiry, approved purchase, zero stock and hidden states produce only current opaque attestations',async()=>{
 const p=await create(), w=worker();let r=await resolution('legacy-source-123');assert.equal(r.status,200);assert.deepEqual(Object.keys(r.body.data.products[0]).sort(),['canonicalPath','requestedPath','seoSignature']);assert.equal(r.body.data.products[0].seoSignature,null);assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.doesNotMatch(JSON.stringify(r.body),/Permanent Test Gift|pricePiastres|quantity|fixtures|_id/);
 await updateProduct(p._id,{expectedRevision:0,status:'ready',priceApproved:true,pricePiastres:45000,inventory:{mode:'tracked',quantity:1,approved:true,available:true}},{actor});
 r=await resolution('permanent-test-gift');const signature=r.body.data.products[0].seoSignature;assert.match(signature,/^[a-f0-9]{64}$/);
 await updateProduct(p._id,{expectedRevision:1,inventory:{mode:'tracked',quantity:0,approved:true,available:true}},{actor});r=await resolution('permanent-test-gift');assert.notEqual(r.body.data.products[0].seoSignature,signature);assert.equal((await w.get('/products/permanent-test-gift')).status,200);
 await updateProduct(p._id,{expectedRevision:2,visibility:'hidden'},{actor});assert.equal((await w.get('/products/permanent-test-gift')).status,404);
 await updateProduct(p._id,{expectedRevision:3,visibility:'public'},{actor});await Category.updateOne({_id:category._id},{$set:{active:false}});assert.equal((await w.get('/products/permanent-test-gift')).status,404);
});

test('address endpoint is bounded, rejects malformed input and discloses no hidden or unknown records',async()=>{
 await create({visibility:'hidden'});for(const slugs of ['',Array(21).fill('slug').join(','),'../private','%2f','BAD'])assert.equal((await resolution(slugs)).status,400);
 const r=await resolution('legacy-source-123,unknown');assert.equal(r.status,200);assert.ok(r.body.data.products.every(p=>p.notFound===true));
 const bad=await fetch(base+'/api/v1/public/product-addresses?slugs=unknown&price=1');assert.equal(bad.status,400);
});

test('conflicting registered owner and an unavailable authority fail closed without falling back to another product',async()=>{
 const p=await create();await Product.create({name:'Bypass writer',slug:'permanent-test-gift',categoryId:category._id,visibility:'public',status:'draft'});
 const w=worker();assert.equal((await w.get('/products/permanent-test-gift')).status,503);
 assert.equal((await ProductAddress.findOne({slug:'permanent-test-gift'})).productId.toString(),p._id.toString());
 w.config.ADDRESS_SERVICE.fetch=async()=>new Response('Unavailable',{status:503});assert.equal((await w.get('/products/legacy-source-123')).status,503);
});

test('hide/reopen, category reopen, deep description edits and checkout closure revoke former SEO fingerprints',async()=>{
 const p=await create({status:'ready',priceApproved:true,pricePiastres:45000,inventory:{mode:'tracked',quantity:2,approved:true,available:true},description:'x'.repeat(200)+'first'});
 const signature=async()=>(await resolution('permanent-test-gift')).body.data.products[0].seoSignature;
 const original=await signature();assert.match(original,/^[a-f0-9]{64}$/);
 await updateProduct(p._id,{expectedRevision:0,visibility:'hidden'},{actor});await updateProduct(p._id,{expectedRevision:1,visibility:'public'},{actor});assert.notEqual(await signature(),original);
 const reopened=await signature();await Category.updateOne({_id:category._id},{$set:{active:false},$inc:{__v:1}});await Category.updateOne({_id:category._id},{$set:{active:true},$inc:{__v:1}});assert.notEqual(await signature(),reopened);
 const prior=await signature();await updateProduct(p._id,{expectedRevision:2,description:'x'.repeat(200)+'second'},{actor});assert.notEqual(await signature(),prior);
 const saved=env.checkoutEnabled;try { env.checkoutEnabled=true;const enabled=await signature();env.checkoutEnabled=false;assert.notEqual(await signature(),enabled); } finally {env.checkoutEnabled=saved;}
});

test('approved export, generator and actual resolver share one canonical/revision/commerce fingerprint',async()=>{
 await create({status:'ready',priceApproved:true,pricePiastres:45000,inventory:{mode:'tracked',quantity:2,approved:true,available:true}});
 const source={readMainCategoryPage:()=>Category.find({parentId:null}).lean(),readSubcategoryPage:async()=>[],readProductPage:()=>Product.find({}).lean(),readProductAddressPage:()=>ProductAddress.find({}).sort({_id:1}).lean()};
 const {catalog}=await buildApprovedSeoExport(source,{PRODUCT_ALIASES_ENABLED:'true'});
 const plan=buildSeoPlan({catalog,siteOrigin:'https://shop.example'}), route=plan.routes.get('/products/permanent-test-gift');
 assert.ok(route);assert.equal(route.indexable,false,'A freshness fingerprint alone never authorizes SEO/media publication.');
 assert.equal(stableDigest([route.productSignature,catalog.checkoutEnabled===true,route.routingVersion]),(await resolution('permanent-test-gift')).body.data.products[0].seoSignature);
});
