import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {app} from '../src/app.js';
import {Product} from '../src/models/Product.js';
import {Category} from '../src/models/Category.js';
import {ProductAddress} from '../src/models/ProductAddress.js';
import {startTestDatabase} from './helpers/database.js';
import {readPublicSeoCatalog,waitForPublicSeoApi} from '../scripts/read-public-seo-catalog.js';
import {prepareProductionSeo} from '../scripts/prepare-production-seo.js';
let database,server,origin,products;
before(async()=>{
 database=await startTestDatabase({models:[Category,Product,ProductAddress],transactions:true});process.env.CATALOG_MEDIA_BASE_URL='https://media.tapandwrap.net';
 const root=await Category.create({name:'Public test gifts',slug:'public-test-gifts'});
 products=await Product.create(Array.from({length:21},(_,i)=>({name:'Public test gift '+i,slug:'public-test-gift-'+i+'-legacy',categoryId:root._id,visibility:'public',description:'Public test information',mainImageKey:'fixtures/gift.webp',galleryKeys:['fixtures/gift.webp'],merchantReviewNotes:'PRIVATE-NOTE',status:'hold',reviewRequired:true,pricePiastres:null,inventory:{mode:'tracked',quantity:10,approved:false,available:true}})));
 await ProductAddress.create(products.flatMap((p,i)=>[{productId:p._id,slug:p.slug,canonical:false},{productId:p._id,slug:'public-test-gift-'+i,canonical:true}]));
 await Product.create({name:'Private gift',slug:'private-gift',categoryId:root._id,visibility:'hidden'});
 server=app.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{delete process.env.CATALOG_MEDIA_BASE_URL;if(server)await new Promise(resolve=>server.close(resolve));await database?.stop();});
const get=async path=>{const response=await fetch(origin+'/api/v1/public/'+path);return {response,body:await response.json()};};
test('public SEO source is bounded, no-store/noindex and contains all unpriced public products without private configuration',async()=>{
 const first=await get('seo-publication?kind=products');assert.equal(first.response.status,200);assert.match(first.response.headers.get('cache-control'),/no-store/);assert.match(first.response.headers.get('x-robots-tag'),/noindex/);assert.equal(first.body.data.products.length,20);
 const text=JSON.stringify(first.body);for(const value of ['PRIVATE-NOTE','mainImageKey','galleryKeys','personalization','catalogSource','_routingVersion','reviewRequired'])assert.equal(text.includes(value),false,value);
 assert.ok(first.body.data.products.every(p=>p.pricePiastres===null&&p.businessState==='price_on_request'&&p.orderingAvailable===false&&p.publicPath!==('/products/'+p.slug)));
 const second=await get('seo-publication?kind=products&after='+first.body.data.nextCursor);assert.equal(second.body.data.products.length,1);assert.equal(second.body.data.nextCursor,null);
 for(const query of ['kind=orders','after=bad','kind=products&limit=100'])assert.equal((await get('seo-publication?'+query)).response.status,400);
});
test('public export attestation exactly matches current URL authority including unpriced records',async()=>{
 let page=(await get('seo-publication?kind=products')).body.data;
 const record=page.products[0],authority=(await get('product-addresses?slugs='+record.slug)).body.data.products[0];assert.equal(record.routingAttestation,authority.seoSignature);assert.equal(record.publicPath,authority.canonicalPath);
 await Product.updateOne({_id:record._id},{$set:{pricePiastres:12345,'inventory.approved':true,'inventory.quantity':2},$inc:{__v:1}});
 page=(await get('seo-publication?kind=products')).body.data;assert.equal(page.products[0].orderingAvailable,true);assert.notEqual(page.products[0].routingAttestation,record.routingAttestation);
});
test('renewal uses only public HTTP pages and retains all twenty-one products',async()=>{
 const catalog=await readPublicSeoCatalog({fetchPage:(url,options)=>fetch(origin+new URL(url).pathname+new URL(url).search,options)});
 assert.equal(catalog.products.length,21);assert.equal(catalog.categories.length,1);assert.equal(catalog.products.some(p=>p.slug==='private-gift'),false);
});
test('targeted product deletion retains URL ownership and excludes only that product from catalog and SEO',async()=>{
 const record=await Product.create({externalCatalogId:'TEST-REMOVE-ONE',name:'Disposable removal target',slug:'disposable-removal-target-legacy',categoryId:products[0].categoryId,visibility:'public',featured:true,bestSeller:true,mainImageKey:'fixtures/gift.webp',galleryKeys:['fixtures/gift.webp']});
 await ProductAddress.create([{productId:record._id,slug:record.slug,canonical:false},{productId:record._id,slug:'disposable-removal-target',canonical:true}]);
 const before=await Product.countDocuments();
 assert.equal((await get('products/disposable-removal-target')).response.status,200);
 const removed=await Product.deleteOne({_id:record._id,externalCatalogId:'TEST-REMOVE-ONE',name:'Disposable removal target',__v:record.__v});
 assert.equal(removed.deletedCount,1);assert.equal(await Product.countDocuments(),before-1);
 for(const slug of [record.slug,'disposable-removal-target'])assert.equal((await get('products/'+slug)).response.status,404);
 const authority=(await get('product-addresses?slugs=disposable-removal-target,disposable-removal-target-legacy')).body.data.products;
 assert.ok(authority.every(p=>p.notFound===true));
 assert.equal(await ProductAddress.countDocuments({productId:record._id}),2);
 assert.equal((await get('products?q=Disposable%20removal%20target')).body.data.products.length,0);
 const exported=await readPublicSeoCatalog({fetchPage:(url,options)=>fetch(origin+new URL(url).pathname+new URL(url).search,options)});
 assert.equal(exported.products.length,21);assert.ok(exported.products.every(p=>p._id!==String(record._id)));
 assert.equal(await Product.countDocuments({_id:{$in:products.map(p=>p._id)}}),21);
});

test('source drift and media failure prevent preparation of a deployable renewal',async()=>{
 const first={products:[{_id:'one',mainImageUrl:'https://media.tapandwrap.net/fixture.webp',pricePiastres:null}],categories:[{_id:'root'}],checkoutEnabled:true};let reads=0,writes=[];
 const verification={objects:[{url:first.products[0].mainImageUrl}],failures:[]};
 await assert.rejects(prepareProductionSeo({readCatalog:async()=>({...structuredClone(first),checkoutEnabled:reads++===0}),verifyMedia:async()=>verification,writeJson:async(file)=>writes.push(file),log:()=>{}}),/changed/);
 assert.equal(writes.includes('local-data/seo-renewal-catalog.json'),false);
 await assert.rejects(prepareProductionSeo({readCatalog:async()=>structuredClone(first),verifyMedia:async()=>({objects:[],failures:[{}]}),writeJson:async()=>{},log:()=>{}}),/incomplete/);
});

test('public readiness handles cold starts with bounded read-only retries and fails honestly',async()=>{
 let calls=0,delays=0;
 await waitForPublicSeoApi({fetchHealth:async()=>++calls<7?new Response('Starting',{status:503}):Response.json({ok:true,data:{database:'connected'}}),sleep:async ms=>{assert.equal(ms,10000);delays++;}});
 assert.equal(calls,7);assert.equal(delays,6);
 calls=0;await assert.rejects(waitForPublicSeoApi({fetchHealth:async()=>{calls++;return new Response('',{status:503});},sleep:async()=>{}}),/bounded/);assert.equal(calls,8);
 calls=0;await assert.rejects(waitForPublicSeoApi({fetchHealth:async()=>{calls++;return new Response('',{status:403});},sleep:async()=>{}}),/rejected/);assert.equal(calls,1);
});
