import {test,expect} from '@playwright/test';
import {mockCatalog,adminProduct} from './catalog-fixtures.js';
import {commerceProduct} from './commerce-fixtures.js';
import {publicProductDetail} from '../../server/src/catalog/public-presentation.js';

const definitions=[
 ['Price on Request',null,{mode:'tracked',quantity:10,approved:false,available:true}],
 ['Available',25000,{mode:'tracked',quantity:2,approved:true,available:true}],
 ['Out of Stock',25000,{mode:'tracked',quantity:0,approved:true,available:true}],
 ['Confirm Stock',25000,{mode:'tracked',quantity:10,approved:false,available:true}],
 ['Made by Request',25000,{mode:'made_to_order',quantity:null,approved:true,available:true}],
];
function records(){return definitions.map(([label,pricePiastres,inventory],index)=>{
 const result=publicProductDetail({...commerceProduct,name:'Fixture '+label,slug:'fixture-business-'+index,_id:String(500+index).padStart(24,'0'),visibility:'public',status:'hold',published:false,reviewRequired:true,priceApproved:false,categoryId:commerceProduct.category,mainImageKey:'fixture/gift.webp',pricePiastres,inventory});
 return {...result,mainImageUrl:'https://fixture.invalid/business.svg',galleryUrls:['https://fixture.invalid/business.svg']};
});}
for(const width of [320,390,440,768,1024,1440])test(`published catalog matrix and customer actions at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});const products=records(),options={product:products[0]};const {requests}=await mockCatalog(page,options);
 await page.route('https://fixture.invalid/business.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#f1e5dc"/><rect x="130" y="160" width="340" height="300" rx="12" fill="#da9b8d"/></svg>'}));
 await page.route('**/api/v1/public/products?*',route=>route.fulfill({json:{ok:true,data:{products,pagination:{page:1,pages:1,total:5,limit:20},priceRange:{min:25000,max:25000}}}}));
 await page.goto('/shop');await expect(page.locator('.catalog-card')).toHaveCount(5);await page.screenshot({path:info.outputPath(width+'-business-shop.png'),fullPage:true});
 for(const product of products){options.product=product;await page.goto('/products/'+product.slug);await expect(page.locator('main h1')).toHaveText(product.name);
  const purchase=page.locator('.product-purchase-section');
  if(product.orderingAvailable)await expect(purchase.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();
  else if(product.businessState==='out_of_stock'){await expect(purchase.getByRole('button',{name:'Out of Stock',exact:true})).toBeDisabled();await expect(purchase.getByRole('link',{name:'Enquire on WhatsApp',exact:true})).toHaveCount(0);}
  else {await expect(purchase.getByRole('link',{name:'Enquire on WhatsApp',exact:true})).toBeVisible();await expect(purchase.getByRole('button',{name:'Add to Cart',exact:true})).toHaveCount(0);}
  await purchase.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(width+'-'+product.businessState+'.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(requests.some(r=>['POST','PATCH','DELETE'].includes(r.method)&&/cart|checkout|payment/.test(r.path))).toBe(false);
});
test('owner enters price and actual stock in one save, then clears price without an approval workflow',async({page},info)=>{
 const fixture=await mockCatalog(page,{role:'admin',adminProduct:{...adminProduct,status:'hold',visibility:'public',catalogRole:'Variant Product',variantSourceNotes:'Original import options note',variants:[],purchaseSetup:undefined,pricePiastres:null,compareAtPiastres:null,priceApproved:false,inventory:{mode:'tracked',quantity:10,approved:false,available:true}}});
 await page.goto('/admin/products/'+adminProduct._id+'/edit');await expect(page.getByLabel('Product quantity',{exact:true})).toHaveValue('');
 await page.getByRole('textbox',{name:/^Price \(EGP\)/}).fill('100');await page.getByLabel('Product quantity',{exact:true}).fill('2');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(()=>fixture.saves.length).toBe(1);
 expect(fixture.saves[0].payload).toMatchObject({pricePiastres:10000,optionStructure:'single',visibility:'public',status:'hold',inventory:{quantity:2,approved:true}});
 for(const width of [320,390,440,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:info.outputPath(width+'-owner-price-stock.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.getByRole('textbox',{name:/^Price \(EGP\)/}).fill('');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(()=>fixture.saves.length).toBe(2);expect(fixture.saves[1].payload).toMatchObject({pricePiastres:null,compareAtPiastres:null,inventory:{quantity:2,approved:true}});
 await expect(page.getByLabel('Purchase readiness',{exact:true})).toHaveCount(0);
});
