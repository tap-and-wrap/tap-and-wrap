import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productBusinessState } from '../../shared/product-business-state.mjs';
import { publicProductCard } from '../src/catalog/public-presentation.js';

const item = overrides => ({ _id:'test', visibility:'public', status:'hold', published:false, reviewRequired:true,
  name:'Existing gift', slug:'existing-gift', categoryId:'category', mainImageKey:'catalog/gift.webp', pricePiastres:null, priceApproved:false,
  inventory:{mode:'tracked',quantity:10,approved:false,available:true},variants:[],...overrides });
for (const status of ['draft','hold','ready']) test(`${status} import history cannot hide a public unpriced product`,()=>{
  const state=productBusinessState(item({status}));assert.equal(state.published,true);assert.equal(state.state,'price_on_request');assert.equal(state.orderingAvailable,false);
});
test('positive price and genuine stock enable purchase without a second approval',()=>{
  const product=item({pricePiastres:12345,inventory:{mode:'tracked',quantity:2,approved:true,available:true}});
  assert.equal(productBusinessState(product).orderingAvailable,true);assert.equal(publicProductCard(product).pricePiastres,12345);
  product.pricePiastres=null;assert.equal(productBusinessState(product).state,'price_on_request');assert.equal(productBusinessState(product).orderingAvailable,false);
});
test('provisional ten never becomes genuine available inventory',()=>{
  const state=productBusinessState(item({pricePiastres:10000}));assert.equal(state.state,'confirm_stock');assert.equal(state.orderingAvailable,false);
});
test('confirmed zero is out of stock and remains published',()=>{
  const state=productBusinessState(item({pricePiastres:10000,inventory:{mode:'tracked',quantity:0,approved:true,available:true}}));assert.equal(state.state,'out_of_stock');assert.equal(state.published,true);
});
test('made-to-order requires an explicit confirmed policy',()=>{
  const product=item({pricePiastres:10000,inventory:{mode:'made_to_order',quantity:null,approved:false,available:true}});
  assert.equal(productBusinessState(product).orderingAvailable,false);product.inventory.approved=true;assert.equal(productBusinessState(product).state,'made_to_order');assert.equal(productBusinessState(product).orderingAvailable,true);
});
for(const visibility of ['hidden','withdrawn',undefined])test(`${visibility} cannot be publicly purchased`,()=>{
  assert.equal(productBusinessState(item({visibility,pricePiastres:10000,inventory:{mode:'tracked',quantity:3,approved:true,available:true}})).published,false);
});
test('explicit unresolved options block purchase, but never unpriced publication',()=>{
  const product=item({purchaseSetup:{version:1,options:'unresolved'},pricePiastres:10000,inventory:{mode:'tracked',quantity:3,approved:true,available:true}});
  assert.equal(productBusinessState(product).state,'options_required');assert.equal(productBusinessState(product).published,true);assert.equal(productBusinessState(product).orderingAvailable,false);
});
test('configured variants use their own real stock and price',()=>{
  const product=item({pricePiastres:10000,variants:[{pricePiastres:null,inventory:{mode:'tracked',quantity:2,approved:true,available:true}}]});
  assert.equal(productBusinessState(product).orderingAvailable,true);product.variants[0].inventory.approved=false;assert.equal(productBusinessState(product).orderingAvailable,false);
});
