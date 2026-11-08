import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planQuotePublication,publicationDigest,quotePublicationBatches} from '../src/catalog/quote-publication-transition.js';
const root={_id:'root',active:true,parentId:null},child={_id:'child',parentId:'root',active:true};
const gift=patch=>({_id:'one',__v:0,externalCatalogId:'SOURCE-1',visibility:'public',published:false,status:'hold',catalogRole:'Product',reviewReasons:['Medium catalog confidence'],merchantReviewNotes:'',name:'Real existing gift',slug:'real-existing-gift',description:'Actual imported description',categoryId:'root',subcategoryId:'child',mainImageKey:'catalog/gift.webp',galleryKeys:['catalog/gift.webp'],pricePiastres:null,priceApproved:false,inventory:{mode:'tracked',quantity:10,approved:false,available:true},...patch});
const addresses=[{productId:'one',slug:'real-existing-gift',canonical:true}];
const plan=(p,c=[root,child],a=addresses)=>planQuotePublication([p],c,a);
test('quote publication changes no price, stock, source status, notes, media or address',()=>{
 const p=gift(),before=structuredClone(p),result=plan(p);assert.equal(result.counts.changes,1);assert.deepEqual(result.changes[0].patch,{visibility:'public',published:true});assert.deepEqual(p,before);assert.equal(result.changes[0].beforeHash,publicationDigest(p));
});
test('the transition is idempotent and digest-bound to every source field',()=>{
 const p=gift();assert.equal(plan({...p,published:true}).counts.changes,0);assert.equal(plan({...p,published:true}).counts.unchanged,1);
 assert.notEqual(plan(p).snapshotHash,plan({...p,inventory:{...p.inventory,quantity:9}}).snapshotHash);
 assert.notEqual(plan(p).snapshotHash,plan({...p,__v:1}).snapshotHash);
});
for(const [reason,patch] of [['hidden',{visibility:'hidden'}],['withdrawn',{visibility:'withdrawn'}],['merchant hold',{merchantReviewNotes:'Do not display this recalled item'}],['unknown warning',{reviewReasons:['Safety review required']}],['missing image',{mainImageKey:null}],['missing description',{description:''}]])test(`preserves ${reason} as an explicit exception`,()=>{
 const result=plan(gift(patch));assert.equal(result.counts.excluded,1);assert.equal(result.counts.changes,0);
});
test('inactive/wrong categories and missing reserved URLs cannot be published',()=>{
 assert.equal(plan(gift(),[root,{...child,active:false}]).counts.excluded,1);
 assert.equal(plan(gift(),[root,{...child,parentId:'other'}]).counts.excluded,1);
 assert.equal(plan(gift(),[root,child],[]).counts.excluded,1);
});
test('duplicate source identities fail before proposing any write',()=>{
 assert.throws(()=>planQuotePublication([gift(),gift({_id:'two'})],[root,child],addresses));
});

test('operator batches bind every before-field, never upsert and only publish/increment revision',()=>{
 const source=gift(),reviewed=plan(source),batches=quotePublicationBatches([source],reviewed);
 assert.equal(batches.length,1);assert.deepEqual(batches[0].filter,{$or:[source]});assert.equal(batches[0].upsert,false);
 assert.deepEqual(batches[0].update,{$set:{visibility:'public',published:true},$inc:{__v:1}});
 assert.throws(()=>quotePublicationBatches([{...source,pricePiastres:10000}],reviewed),/source changed/);
 assert.throws(()=>quotePublicationBatches([source],{...reviewed,changes:[{...reviewed.changes[0],patch:{inventory:{approved:true}}}]}),/source changed/);
 assert.throws(()=>quotePublicationBatches([source],{...reviewed,changes:[...reviewed.changes,...reviewed.changes],counts:{changes:2}}),/source changed/);
 assert.equal(quotePublicationBatches([{...source,published:true}],plan({...source,published:true})).length,0);
});
