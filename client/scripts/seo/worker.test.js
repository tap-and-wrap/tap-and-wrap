import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleSeoRequest } from '../../worker/seo-worker.js';

function fixture() {
  const id = 'a'.repeat(64), origin = 'https://shop.example', createdAt = Date.now();
  const paths = ['/', '/shop', '/products/approved', '/categories/gifts', '/about', '/404'];
  const routeFiles = Object.fromEntries(paths.map(path => [path, `/seo-pages/${id}/${path === '/' ? 'index' : path.slice(1)}.html`]));
  const manifest = { version:2, origin, indexingEnabled:true, publicRoutes:paths.filter(p=>p!=='/404'), indexableRoutes:paths.filter(p=>!['/about','/404'].includes(p)), productSlugs:['approved'], routeFiles,
    publication:{ version:1,id,maximumAgeSeconds:3600,generatedAt:new Date(createdAt).toISOString(),expiresAt:new Date(createdAt+3600000).toISOString(),routes:[] },
    productSignatures:{'/products/approved':id},routeProducts:{'/':['/products/approved'],'/shop':['/products/approved'],'/categories/gifts':['/products/approved']},
    productRedirects:{'/products/old-approved':'/products/approved'},categoryRedirects:{'/categories/old-gifts':'/categories/gifts'} };
  const owners = new Map([['approved',{canonicalPath:'/products/approved',seoSignature:id}],['old-approved',{canonicalPath:'/products/approved',seoSignature:id}],['draft',{canonicalPath:'/products/draft',seoSignature:null}],['old-draft',{canonicalPath:'/products/draft',seoSignature:null}]]);
  const assets = new Map([['/spa.html','<html><h1>React shell</h1></html>'],['/404.html','<h1>Page not found</h1>'],['/assets/app.js','fixture-js']]);
  for (const path of paths) assets.set(routeFiles[path],`<html><h1>Approved ${path}</h1>${path.startsWith('/products/') ? '<script type="application/ld+json">{"@type":"Product"}</script>' : ''}</html>`);
  const seen=[], calls=[];
  const env = { SEO_INDEXING_ENABLED:'true',SEO_EXPECTED_PUBLICATION_ID:id, ASSETS:{fetch:async request=>{const p=new URL(request.url).pathname;seen.push(p);return new Response(assets.get(p)||'Not found',{status:assets.has(p)?200:404});}},
    ADDRESS_SERVICE:{fetch:async (input,options)=>{calls.push({input,options});const slugs=new URL(input).searchParams.get('slugs').split(',');return Response.json({ok:true,data:{version:1,products:slugs.map(slug=>owners.has(slug)?{requestedPath:'/products/'+slug,...owners.get(slug)}:{requestedPath:'/products/'+slug,notFound:true})}});}} };
  const save=()=>assets.set('/seo-manifest.json',JSON.stringify(manifest));save();
  const get=(path,method='GET')=>handleSeoRequest(new Request(origin+path,{method}),env);
  return {env,manifest,owners,assets,seen,calls,save,get};
}

test('F06: expired former map and an ordinary map-free cold start preserve canonical 200 and permanent 308 GET/HEAD queries',async()=>{
  const f=fixture();f.env.SEO_INDEXING_ENABLED='false';
  f.manifest.productCompatibility={version:1,source:'reviewed-registered-public-product-addresses',origin:f.manifest.origin,generatedAt:'2020-01-01',expiresAt:'2020-01-02',products:[{canonicalPath:'/products/draft',aliases:['/products/old-draft']}]};f.save();
  for(const map of [true,false]){if(!map){delete f.manifest.productCompatibility;f.save();}
    for(const method of ['GET','HEAD']){
      const alias=await f.get('/products/old-draft/?q=a%2Bb&x=1&x=2',method);assert.equal(alias.status,308);assert.equal(alias.headers.get('location'),'https://shop.example/products/draft?q=a%2Bb&x=1&x=2');assert.equal(await alias.text(),'');
      const canonical=await f.get('/products/draft',method);assert.equal(canonical.status,200);assert.match(canonical.headers.get('x-robots-tag'),/noindex/);assert.equal(await canonical.text(),method==='HEAD'?'':'<html><h1>React shell</h1></html>');
      assert.equal(canonical.headers.get('link'),'<https://shop.example/products/draft>; rel="canonical"');
    }
  }
  assert.ok(f.calls.every(c=>c.options.cache==='no-store'&&!c.options.headers));
  assert.ok(f.calls.every(c=>c.options.cf.cacheTtlByStatus['100-599']===-1));
});

test('F07: indexing and public enquiry browsing are independent; no draft Product/Offer or sitemap disclosure',async()=>{
  const f=fixture();for(const indexing of ['false','true']){f.env.SEO_INDEXING_ENABLED=indexing;const r=await f.get('/products/draft');assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.doesNotMatch(await r.text(),/Product|Offer|price/);assert.equal((await f.get('/products/old-draft')).status,308);}
  const xml=await(await f.get('/sitemaps/1.xml')).text();assert.match(xml,/products\/approved/);assert.doesNotMatch(xml,/draft|old-approved/);
  assert.match(await(await f.get('/sitemap.xml')).text(), /sitemapindex/); assert.match(await(await f.get('/sitemap.xml')).text(), /sitemaps\/1.xml/);
  const approved=await f.get('/products/approved');assert.equal(approved.status,200);assert.equal(approved.headers.get('x-robots-tag'),null);assert.match(await approved.text(),/application\/ld\+json/);
});

test('live hidden, deleted and unknown ownership overrides even fresh publications, aliases and customization',async()=>{
  const f=fixture();f.owners.delete('approved');f.owners.delete('old-approved');
  for(const path of ['/products/approved','/products/old-approved','/products/approved/customize','/products/unknown','/products/draft-123','/products/x/private']){const r=await f.get(path);assert.equal(r.status,404,path);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.doesNotMatch(await r.text(),/application\/ld\+json/);}
  assert.doesNotMatch(await(await f.get('/sitemaps/1.xml')).text(),/products\/approved/);
  assert.match(await(await f.get('/shop')).text(),/React shell/);
});

test('publication expiry, partial update and unreviewed ID downgrade public pages without stale prices or 503',async()=>{
  for(const change of [f=>{f.manifest.publication.expiresAt='2020-01-01';f.save();},f=>{f.env.SEO_EXPECTED_PUBLICATION_ID='b'.repeat(64);},f=>{f.owners.get('approved').seoSignature='b'.repeat(64);}]){
    const f=fixture();change(f);for(const path of ['/products/approved','/shop','/categories/gifts']){const r=await f.get(path);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(await r.text(),/React shell/);}
    assert.equal((await f.get('/products/old-approved')).status,308);assert.doesNotMatch(await(await f.get('/sitemaps/1.xml')).text(),/products\/approved/);
  }
});

test('positive results are not cached: hide, reopen as enquiry-only and restore verified publication immediately',async()=>{
  const f=fixture();assert.equal((await f.get('/products/approved')).headers.get('x-robots-tag'),null);
  f.owners.delete('approved');assert.equal((await f.get('/products/approved')).status,404);
  f.owners.set('approved',{canonicalPath:'/products/approved',seoSignature:null});assert.match((await f.get('/products/approved')).headers.get('x-robots-tag'),/noindex/);
  f.owners.get('approved').seoSignature='b'.repeat(64);assert.match((await f.get('/products/approved')).headers.get('x-robots-tag'),/noindex/);
  f.manifest.productSignatures['/products/approved']='b'.repeat(64);f.save();assert.equal((await f.get('/products/approved')).headers.get('x-robots-tag'),null);assert.equal(f.calls.length,5);
});

test('API outage, malformed response, oversized response, conflicting resolution and redirect fail closed',async()=>{
  for(const fetch of [async()=>{throw Error('private credential');},async()=>new Response('Bad',{status:503}),async()=>Response.json({ok:true,data:{version:1,products:[]}}),async()=>new Response('x'.repeat(16001)),async()=>Response.json({ok:true,data:{version:1,products:[{requestedPath:'/products/draft',canonicalPath:'https://evil.example',seoSignature:null}]}})]){
    const f=fixture();f.env.ADDRESS_SERVICE={fetch};const r=await f.get('/products/draft');assert.equal(r.status,503);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.doesNotMatch(await r.text(),/credential|Approved/);assert.equal((await f.get('/checkout')).status,200);
  }
});

test('authority timeout aborts and returns bounded no-store 503 without stale fallback',async()=>{
  const f=fixture();f.env.ADDRESS_SERVICE.fetch=(input,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}));
  const r=await f.get('/products/draft');assert.equal(r.status,503);assert.match(r.headers.get('cache-control'),/no-store/);
});

test('positive-age and explicitly cached authority replies cannot authorize a stale product',async()=>{
  for(const headers of [{Age:'10'},{'CF-Cache-Status':'HIT'},{'CF-Cache-Status':'STALE'}]) {
    const f=fixture(), original=f.env.ADDRESS_SERVICE.fetch;f.env.ADDRESS_SERVICE.fetch=async(...args)=>{const r=await original(...args);return new Response(r.body,{headers});};assert.equal((await f.get('/products/approved')).status,503);
  }
});

test('missing or invalid SEO manifest does not break authoritative product browsing',async()=>{
  const f=fixture();for(const content of [null,'malformed']){content===null?f.assets.delete('/seo-manifest.json'):f.assets.set('/seo-manifest.json',content);assert.equal((await f.get('/products/draft')).status,200);assert.equal((await f.get('/products/old-draft')).status,308);assert.equal((await f.get('/products/unknown')).status,404);assert.equal(await(await f.get('/robots.txt')).text(),'User-agent: *\nDisallow: /\n');}
});

test('emergency canonical/alias withdrawal and private generation URLs override public access',async()=>{
  const f=fixture();for(const path of ['/products/approved','/products/old-approved']){f.env.SEO_WITHDRAWN_PATHS=path;for(const candidate of ['/products/approved','/products/old-approved','/products/approved/customize'])assert.equal((await f.get(candidate)).status,404);}
  f.env.SEO_WITHDRAWN_PATHS='';assert.equal((await f.get(f.manifest.routeFiles['/products/approved'])).status,404);assert.equal((await f.get('/spa.html')).status,404);
  f.env.SEO_WITHDRAWN_PATHS='/products/old-draft';assert.equal((await f.get('/products/draft')).status,404);assert.equal((await f.get('/products/old-draft/customize')).status,404);
  f.env.SEO_WITHDRAWN_PATHS='/products/old-approved';assert.doesNotMatch(await(await f.get('/sitemaps/1.xml')).text(),/products\/approved/);assert.match(await(await f.get('/shop')).text(),/React shell/);
});

test('GET/HEAD normalization preserves query and rejects malformed/encoded product identities without suffix guessing',async()=>{
  const f=fixture();for(const path of ['/products/%64raft','/products/draft%2Fother','/products/Draft','/products/draft--one'])assert.equal((await f.get(path)).status,404,path);
  const r=await f.get('/products/approved/?ref=one','HEAD');assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://shop.example/products/approved?ref=one');assert.equal(await r.text(),'');
  const query=await f.get('/products/approved?q=1');assert.match(query.headers.get('x-robots-tag'),/noindex/);
  const customization=await f.get('/products/old-draft/customize?ref=1','HEAD');assert.equal(customization.status,308);assert.equal(customization.headers.get('location'),'https://shop.example/products/draft/customize?ref=1');assert.equal(await customization.text(),'');
});

test('category redirects and approved thin-category/fixed-page noindex gates remain intact',async()=>{
  const f=fixture();for(const method of ['GET','HEAD']){const r=await f.get('/categories/old-gifts?q=one',method);assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://shop.example/categories/gifts?q=one');}
  assert.equal((await f.get('/categories/gifts')).status,200);assert.match((await f.get('/about')).headers.get('x-robots-tag'),/noindex/);
  f.manifest.indexableRoutes=f.manifest.indexableRoutes.filter(p=>p!=='/categories/gifts');f.save();assert.match((await f.get('/categories/gifts')).headers.get('x-robots-tag'),/noindex/);
  assert.doesNotMatch(await(await f.get('/sitemaps/1.xml')).text(),/categories\/gifts/);
  f.manifest.publication.expiresAt='2020-01-01';f.save();assert.equal((await f.get('/categories/old-gifts')).status,308);
});

test('private documents stay private while public assets bypass authority and manifest',async()=>{
  const f=fixture();for(const path of ['/admin/products','/cart','/checkout','/orders/fixture','/my-orders','/track-order','/products/draft/customize']){const r=await f.get(path);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('x-robots-tag'),/noindex/);}
  f.seen.length=0;f.calls.length=0;assert.equal((await f.get('/assets/app.js')).status,200);assert.deepEqual(f.seen,['/assets/app.js']);assert.equal(f.calls.length,0);assert.equal((await f.get('/shop','POST')).status,405);
});

test('disabled/preview indexing disallows robots and emits empty sitemap',async()=>{
  const f=fixture();f.env.SEO_INDEXING_ENABLED='false';assert.equal(await(await f.get('/robots.txt')).text(),'User-agent: *\nDisallow: /\n');assert.doesNotMatch(await(await f.get('/sitemaps/1.xml')).text(),/<loc>/);
  f.env.SEO_INDEXING_ENABLED='true';const r=await handleSeoRequest(new Request('https://preview.workers.dev/products/approved'),f.env);assert.match(r.headers.get('x-robots-tag'),/noindex/);
});

test('all response classes preserve browser headers and invalid policy does not reveal secrets',async()=>{
  const f=fixture();for(const path of ['/shop','/products/approved','/products/old-draft','/assets/app.js','/unknown','/sitemap.xml']){const r=await f.get(path);assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.ok(r.headers.has('content-security-policy-report-only'));}
  f.env.BROWSER_API_ORIGINS='https://user:private-password@api.example';const r=await f.get('/shop');assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private-password/);
});

test('checked-in Static Assets config runs documents through Worker without enabling indexing',async()=>{
  const config=JSON.parse(await readFile(new URL('../../wrangler.jsonc',import.meta.url),'utf8'));assert.equal(config.main,'./worker/seo-worker.js');assert.equal(config.vars.SEO_INDEXING_ENABLED,'false');assert.equal(config.assets.html_handling,'none');assert.ok(config.assets.run_worker_first.includes('/*'));
});

test('sitemap pages bound live checks and never advertise withdrawn or unchecked product URLs',async()=>{
  const f=fixture();for(let i=1;i<=25;i++){const p='/products/item-'+i;f.manifest.publicRoutes.push(p);f.manifest.indexableRoutes.push(p);f.manifest.productSlugs.push('item-'+i);f.manifest.routeFiles[p]=`/seo-pages/${'a'.repeat(64)}/products/item-${i}.html`;f.manifest.productSignatures[p]='a'.repeat(64);f.owners.set('item-'+i,{canonicalPath:p,seoSignature:'a'.repeat(64)});}f.save();
  const index=await(await f.get('/sitemap.xml')).text();assert.match(index,/sitemaps\/2.xml/);assert.equal(f.calls.length,0);
  f.owners.delete('item-25');const page=await(await f.get('/sitemaps/2.xml')).text();assert.match(page,/products\/item-24/);assert.doesNotMatch(page,/products\/item-25/);
  assert.ok(f.calls.every(call=>new URL(call.input).searchParams.get('slugs').split(',').length<=20));assert.equal((await f.get('/sitemaps/3.xml')).status,404);
  f.env.ADDRESS_SERVICE.fetch=async()=>new Response('Unavailable',{status:503});assert.equal((await f.get('/sitemaps/2.xml')).status,503);assert.equal((await f.get('/checkout')).status,200);
});

test('noindex product shell uses its own canonical and cannot inherit conditional/range or encoding headers',async()=>{
  const f=fixture(), fetch=f.env.ASSETS.fetch;f.assets.set('/spa.html','<html><head></head><body>Safe shell</body></html>');
  f.env.ASSETS.fetch=async request=>{if(new URL(request.url).pathname==='/spa.html'){for(const name of ['cookie','authorization','range','if-none-match'])assert.equal(request.headers.get(name),null);const r=await fetch(request);return new Response(r.body,{headers:{'Content-Length':'1',ETag:'old','Content-Encoding':'identity'}});}return fetch(request);};
  const r=await handleSeoRequest(new Request('https://shop.example/products/draft',{headers:{Cookie:'synthetic-private-cookie',Range:'bytes=0-10','If-None-Match':'old'}}),f.env);
  assert.equal(r.status,200);assert.match(await r.text(),/rel="canonical" href="https:\/\/shop.example\/products\/draft"/);for(const name of ['content-length','etag','content-encoding'])assert.equal(r.headers.get(name),null);assert.match(r.headers.get('x-robots-tag'),/noindex/);
});
