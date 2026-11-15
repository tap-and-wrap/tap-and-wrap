import test from 'node:test';
import assert from 'node:assert/strict';
import { orderSummaryRows } from '../../shared/order-summary.mjs';
import { renderEmailTemplate } from '../src/email/templates.js';

test('summary separates products, boxes and included engraving without double counting', () => {
  const rows = orderSummaryRows([
    {kind:'product', quantity:2, lineTotalPiastres:30000, productEngravingSnapshot:{surchargePiastres:5000}},
    {kind:'gift_box_v2',quantity:2,lineTotalPiastres:40000,giftPersonalization:{engravings:[{pricePiastres:2000}]}},
    {kind:'engraving_service_v2',quantity:1,lineTotalPiastres:10000},
  ]);
  assert.deepEqual(rows.map(row => [row.label,row.amountPiastres]),[['Products',20000],['Gift Boxes',36000],['Engraving',24000]]);
  assert.equal(rows.reduce((sum,row)=>sum+row.amountPiastres,0),80000);
  assert.deepEqual(orderSummaryRows([{kind:'product',quantity:1,lineTotalPiastres:10000}]).map(row=>row.label),['Products']);
  assert.deepEqual(orderSummaryRows([{kind:'engraving_service_v2',quantity:1,lineTotalPiastres:10000}]).map(row=>row.label),['Engraving']);
});
const snapshot={orderNumber:'123456',accountingVersion:2,groupedPayments:true,totalPiastres:61000,paymentMethod:'instapay',paymentState:'awaiting_verification',items:[{name:'Gift Box',kind:'gift_box_v2',quantity:2,giftBox:{components:[{name:'PRIVATE COMPONENT',quantity:1}]}},{name:'<script>engraving</script>',quantity:1}],financial:{collectedPiastres:0,refundedPiastres:0,outstandingPiastres:61000},charges:[{label:'Delivery',amountPiastres:null,state:'pending'}]};
test('receipt is compact, escapes names, has an original logo and keeps payment unverified',()=>{
  const {text,html}=renderEmailTemplate({event:'order_received',snapshot},{clientOrigin:'https://tapandwrap.example.test'});
  assert.match(text,/Order #123456/);assert.match(text,/EGP 610.00/);assert.match(text,/Awaiting verification/);
  assert.doesNotMatch(text,/Recorded collections|Outstanding balance|PRIVATE COMPONENT|transfer to/i);
  assert.match(html,/<table role="presentation"/);assert.match(html,/tap-wrap-email-logo.png/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.ok(text.length<700);
});
test('material refund and charge changes remain in customer email and text',()=>{
  const {text,html}=renderEmailTemplate({event:'refund_recorded',snapshot:{...snapshot,financial:{collectedPiastres:61000,refundedPiastres:20000,outstandingPiastres:0},charges:[{label:'Delivery',amountPiastres:5000,state:'accepted',collectionMethod:'cod'}]}});
  for(const expected of ['Refunded: EGP 200.00','Outstanding balance: EGP 0.00','Delivery: EGP 50.00']){assert.ok(text.includes(expected));assert.ok(html.includes(expected));}
});

test('email PNG preserves original visible colors, alpha and proportions at high density',async()=>{
  const {default:sharp}=await import('sharp');
  const source=new URL('../../client/public/tap-wrap-logo.webp',import.meta.url), png=new URL('../../client/public/tap-wrap-email-logo.png',import.meta.url);
  const {fileURLToPath}=await import('node:url');
  const [original,converted]=await Promise.all([source,png].map(url=>sharp(fileURLToPath(url)).ensureAlpha().raw().toBuffer({resolveWithObject:true})));
  assert.deepEqual(converted.info,original.info);
  for(let index=0;index<original.data.length;index+=4) {
    assert.equal(converted.data[index+3],original.data[index+3]);
    if(original.data[index+3]>0)assert.deepEqual(converted.data.subarray(index,index+3),original.data.subarray(index,index+3));
    else assert.deepEqual([...converted.data.subarray(index,index+3)],[0,0,0]);
  }
  const metadata=await sharp(fileURLToPath(png)).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.hasAlpha,true);assert.equal(metadata.width/metadata.height,3);assert.ok(metadata.width>=720);
  const {stat}=await import('node:fs/promises');assert.ok((await stat(png)).size<300000);
  assert.ok(converted.data.some((value,index)=>index%4===3&&value===0));
});
test('normal confirmation and proof acknowledgements use concise unverified wording in HTML and text',()=>{
 for(const event of ['order_received','proof_submitted']) {
  const message=renderEmailTemplate({event,snapshot},{clientOrigin:'https://tapandwrap.example.test'});
  for(const body of [message.html,message.text])assert.doesNotMatch(body,/don.t transfer again|do not transfer again/i);
  assert.doesNotMatch(message.text,/Payment confirmed[.!]/);
 }
});
