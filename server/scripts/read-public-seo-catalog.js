import {createHash} from 'node:crypto';
import {publicImageUrl} from '../../shared/product-seo.mjs';

// The current free Render instance can take about a minute to wake. Only this
// explicit release reader retries readiness; Worker request deadlines stay strict.
export async function waitForPublicSeoApi({fetchHealth=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=0;attempt<8;attempt++){
  try{
   const response=await fetchHealth('https://api.tapandwrap.net/health/ready',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
   if(response.status>=400&&response.status<500&&response.status!==429)throw Object.assign(Error('Public readiness rejected'),{terminal:true});
   if(response.ok){const body=await response.json();if(body.ok===true&&body.data?.database==='connected')return;}
  }catch(error){if(error.terminal)throw error;}
  if(attempt<7)await sleep(10000);
 }
 throw Error('Public production API did not become ready within the bounded startup attempts');
}

// No credentials, database, cookies or analytics requests. The dedicated public
// endpoint supplies allowlisted DTOs and current opaque revision attestations.
export async function readPublicSeoCatalog({fetchPage=fetch,maximumPages=200}={}){
 if(!Number.isInteger(maximumPages)||maximumPages<1||maximumPages>200)throw Error('Invalid public SEO page bound');
 const catalog={version:1,source:'approved-public-catalog',generatedAt:null,checkoutEnabled:null,mediaOrigins:['https://media.tapandwrap.net'],products:[],categories:[]};
 for(const kind of ['categories','products']){
  let after=null;const seen=new Set();let complete=false;
  for(let page=0;page<maximumPages;page++){
   const url=new URL('https://api.tapandwrap.net/api/v1/public/seo-publication');url.searchParams.set('kind',kind);if(after)url.searchParams.set('after',after);
   const response=await fetchPage(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});if(!response.ok)throw Error('Public SEO source unavailable');
   const payload=await response.json(),data=payload.data,rows=data?.[kind];
   if(payload.ok!==true||data.version!==1||data.source!=='approved-public-catalog'||!Array.isArray(rows)||rows.length>20||typeof data.checkoutEnabled!=='boolean'||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('Invalid bounded public SEO source');
   if(catalog.checkoutEnabled!==null&&catalog.checkoutEnabled!==data.checkoutEnabled)throw Error('Checkout changed during public export');catalog.checkoutEnabled=data.checkoutEnabled;
   catalog.generatedAt=catalog.generatedAt&&Date.parse(catalog.generatedAt)<Date.parse(data.generatedAt)?catalog.generatedAt:data.generatedAt;
   for(const row of rows){if(!/^[a-f0-9]{24}$/.test(row._id||'')||seen.has(row._id)||after&&row._id<=after)throw Error('Public SEO identity or cursor drift');seen.add(row._id);
    if(kind==='products'&&(row.visibility!=='public'||!/^[a-f0-9]{64}$/.test(row.routingAttestation||'')||!publicImageUrl(row.mainImageUrl,catalog.mediaOrigins)))throw Error('Unverified public product source');
    catalog[kind].push(row);
   }
   if(data.nextCursor===null){complete=true;break;}
   if(rows.length!==20||data.nextCursor!==rows.at(-1)._id||data.nextCursor===after)throw Error('Invalid public SEO pagination');after=data.nextCursor;
  }
  if(!complete)throw Error('Public SEO pagination bound exceeded');
 }
 if(!catalog.products.length||!catalog.categories.length)throw Error('Refusing an empty public SEO publication');
 return catalog;
}
export const publicCatalogDigest=catalog=>createHash('sha256').update(JSON.stringify({checkoutEnabled:catalog.checkoutEnabled,products:catalog.products,categories:catalog.categories})).digest('hex');
