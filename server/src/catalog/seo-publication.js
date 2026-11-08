import mongoose from 'mongoose';
import {createHash} from 'node:crypto';
import {Product} from '../models/Product.js';
import {Category} from '../models/Category.js';
import {env} from '../config/env.js';
import {displayProductFilter} from './product-policy.js';
import {publicProductDetail,mediaUrlForKey} from './public-presentation.js';
import {attachProductPaths} from './product-addresses.js';
import {categoryPublicPaths} from '../../../shared/category-paths.mjs';
import {productRoutingVersion,productSeoSignature} from '../../../shared/product-seo.mjs';

// Public information only, twenty records per keyset page. This is a crawler
// publication source, never an admin/database dump, tracking action or mutation.
export async function publicSeoPublicationPage({kind='products',after}={}){
 const identities=await Category.find({}).select('_id name slug parentId active imageKey updatedAt __v').lean().maxTimeMS(3000);
 const paths=categoryPublicPaths(identities),roots=identities.filter(c=>c.active&&!c.parentId),rootIds=new Set(roots.map(c=>String(c._id)));
 const active=identities.filter(c=>c.active&&(!c.parentId||rootIds.has(String(c.parentId)))),byId=new Map(active.map(c=>[String(c._id),c]));
 const category=c=>({_id:String(c._id),name:c.name,slug:c.slug,parentId:c.parentId?String(c.parentId):null,publicPath:paths.get(String(c._id)),active:true,imageUrl:mediaUrlForKey(c.imageKey),updatedAt:c.updatedAt});
 const cursor=after?{_id:{$gt:new mongoose.Types.ObjectId(after)}}:{};
 let records;
 if(kind==='categories'){
  const rows=active.filter(c=>!after||String(c._id)>after).sort((a,b)=>String(a._id).localeCompare(String(b._id))).slice(0,20);
  records=rows.map(category);
 }else{
  const rootIds=roots.map(c=>c._id),children=roots.map(c=>({categoryId:c._id,subcategoryId:{$in:active.filter(child=>String(child.parentId)===String(c._id)).map(child=>child._id)}}));
  const rows=await Product.find({$and:[displayProductFilter(),cursor,{$or:[{categoryId:{$in:rootIds},subcategoryId:null},...children]}]})
   .select('_id __v name slug description visibility categoryId subcategoryId mainImageKey pricePiastres compareAtPiastres inventory variants personalization purchaseSetup updatedAt').sort({_id:1}).limit(20).lean().maxTimeMS(3000);
  records=await attachProductPaths(rows.map(row=>{
   const main=byId.get(String(row.categoryId)),child=byId.get(String(row.subcategoryId));
   const detail=publicProductDetail({...row,categoryId:main,subcategoryId:child||null});
   return {_id:detail._id,name:detail.name,slug:detail.slug,description:detail.description,visibility:'public',published:true,businessState:detail.businessState,category:category(main),subcategory:child?category(child):null,mainImageUrl:detail.mainImageUrl,pricePiastres:detail.pricePiastres,compareAtPiastres:detail.compareAtPiastres,priceApproved:detail.priceApproved,orderingAvailable:detail.orderingAvailable,inventoryMode:detail.inventory.mode,variants:detail.variants.map(v=>({pricePiastres:v.pricePiastres,orderingAvailable:v.orderingAvailable,stockConfirmed:v.stockConfirmed,inventoryMode:v.inventory.mode})),updatedAt:row.updatedAt,seoEligibility:{visibility:'public',published:true,categoriesActive:true},_routingVersion:productRoutingVersion({...row,categoryId:main,subcategoryId:child||null})};
  }));
  records=records.map(record=>{const {_routingVersion,...dto}=record;return {...dto,routingAttestation:createHash('sha256').update(JSON.stringify([productSeoSignature(dto),env.checkoutEnabled===true,_routingVersion])).digest('hex')};});
 }
 return {version:1,source:'approved-public-catalog',generatedAt:new Date().toISOString(),checkoutEnabled:env.checkoutEnabled===true,[kind]:records,nextCursor:records.length===20?String(records.at(-1)._id):null};
}
