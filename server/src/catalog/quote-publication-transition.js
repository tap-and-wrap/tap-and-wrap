import {createHash} from 'node:crypto';
import {isSafeImageReference} from './fields.js';
const id=value=>String(value?.$oid||value?._id?.$oid||value?._id||value||'');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const publicationDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Explicit release operator only: builds compare-and-set operations from a
// reviewed plan. Never invoked by API startup, ordinary jobs or catalog reads.
// Full before-images protect even against out-of-band edits without revisions.
export function quotePublicationBatches(products, reviewedPlan, batchSize=100) {
  if (!Array.isArray(products)||reviewedPlan?.version!==1||reviewedPlan.release!=='owner-handoff-r2'||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>100) throw Error('Invalid reviewed publication batch');
  const byId=new Map(products.map(product=>[id(product),product]));
  if(byId.size!==products.length||reviewedPlan.changes.length!==reviewedPlan.counts.changes)throw Error('Ambiguous publication batch');
  const seen=new Set(), rows=reviewedPlan.changes.map(change=>{
    const product=byId.get(change.id);
    if(seen.has(change.id)||!product||publicationDigest(product)!==change.beforeHash||product.__v!==change.expectedRevision||JSON.stringify(change.patch)!==JSON.stringify({visibility:'public',published:true}))throw Error('Reviewed publication source changed');
    seen.add(change.id);return product;
  });
  return Array.from({length:Math.ceil(rows.length/batchSize)},(_,index)=>{
    const records=rows.slice(index*batchSize,(index+1)*batchSize);
    return {batch:index+1,ids:records.map(id),beforeHashes:records.map(publicationDigest),filter:{$or:records.map(product=>structuredClone(product))},update:{$set:{visibility:'public',published:true},$inc:{__v:1}},upsert:false};
  });
}
const inheritedWarnings=new Set(['Medium catalog confidence','Variant or customization grouping requires review','Variant product grouping requires merchant approval','Customization configuration requires merchant approval']);

// Pure, offline plan. Raw before-images remain evidence; no defaults, prices,
// configuration or stock approvals are invented. Explicit merchant holds win.
export function planQuotePublication(products,categories,addresses){
  if(!Array.isArray(products)||!products.length||products.length>10000||!Array.isArray(categories)||!Array.isArray(addresses))throw Error('Invalid publication snapshot');
  const graph=new Map(categories.map(c=>[id(c),c])), seen=new Set(), sources=new Set(), changes=[],unchanged=[],excluded=[];
  const reservations=new Map();for(const a of addresses){const list=reservations.get(id(a.productId))||[];list.push(a);reservations.set(id(a.productId),list);}
  for(const product of products){
    const productId=id(product);if(!productId||seen.has(productId)||!product.externalCatalogId||sources.has(product.externalCatalogId))throw Error('Ambiguous imported product identity');
    seen.add(productId);sources.add(product.externalCatalogId);let reason=null;
    const main=graph.get(id(product.categoryId)),child=product.subcategoryId?graph.get(id(product.subcategoryId)):null;
    if(['hidden','withdrawn'].includes(product.visibility))reason='Intentionally hidden or withdrawn';
    else if(product.visibility!==undefined&&product.visibility!=='public')reason='Unrecognized visibility';
    else if(!['Product','Customizable Product','Variant Product'].includes(product.catalogRole))reason='Not a legitimate catalog product';
    else if(!['draft','hold','ready'].includes(product.status))reason='Unrecognized historical status';
    else if(product.status==='hold'&&product.merchantReviewNotes?.trim())reason='Explicit merchant hold notes require review';
    else if((product.reviewReasons||[]).some(warning=>!inheritedWarnings.has(warning)))reason='Unrecognized review warning requires review';
    else if(!product.name?.trim()||!product.slug||!product.description?.trim())reason='Missing product identity or description';
    else if(main?.active!==true||main.parentId||product.subcategoryId&&(child?.active!==true||id(child.parentId)!==id(main)))reason='Inactive or incoherent category';
    else if(!product.mainImageKey||!isSafeImageReference(product.mainImageKey)||!Array.isArray(product.galleryKeys)||product.galleryKeys[0]!==product.mainImageKey||product.galleryKeys.some(key=>typeof key!=='string'||!isSafeImageReference(key)))reason='Unsafe or missing media references';
    const reserved=reservations.get(productId)||[];
    if(!reason&&(reserved.filter(a=>a.canonical).length!==1||!reserved.some(a=>a.slug===product.slug)))reason='Missing or ambiguous reserved product address';
    if(reason){excluded.push({id:productId,externalCatalogId:product.externalCatalogId,name:product.name,reason});continue;}
    const entry={id:productId,externalCatalogId:product.externalCatalogId,beforeHash:publicationDigest(product),expectedRevision:product.__v??0};
    if(product.visibility==='public'&&product.published===true)unchanged.push(entry);
    else changes.push({...entry,patch:{visibility:'public',published:true},beforePublished:product.published,beforeVisibility:product.visibility});
  }
  return {version:1,release:'owner-handoff-r2',snapshotHash:publicationDigest({products,categories,addresses}),counts:{total:products.length,changes:changes.length,unchanged:unchanged.length,excluded:excluded.length},changes,unchanged,excluded};
}
