import { test,expect } from '@playwright/test';
import { localCheckoutFixture } from './gift-box-checkout-fixture.js';
import { beginGiftBox } from './gift-box-fixtures.js';
import { isolatedImageFile } from './commerce-fixtures.js';

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    window.revokedGiftUrls=[];
    const revoke=URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL=url=>{window.revokedGiftUrls.push(url);revoke(url);};
  });
});
async function personalize(page) {
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
  await page.locator('.gb-personal-section').first().locator('summary').click();
  await page.getByLabel('Choose your photos').setInputFiles(isolatedImageFile('synthetic.png'));
  await page.locator('.gb-personal-section').last().locator('summary').click();
  await page.getByLabel('Write a name, special date, or heartfelt message').fill('Nour, with love');
  await page.getByRole('radio',{name:'Gold',exact:true}).check();
}
test('SPA navigation preserves photos, all choices, poses and review; explicit reset revokes only discarded previews',async({page})=>{
  const {fixture,audit}=await localCheckoutFixture(page,{personalized:true});await beginGiftBox(page);
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  await page.locator('.gb-placed').first().focus();await page.locator('.gb-placed').first().press('ArrowRight');
  await personalize(page);
  const url=await page.locator('.gb-free-photo img').getAttribute('src');
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
  while(!await page.getByRole('button',{name:'Choose Fixture ribbon-navy',exact:true}).count()) await page.getByRole('button',{name:'Show 6 more'}).click();
  await page.getByRole('button',{name:'Choose Fixture ribbon-navy',exact:true}).click();
  await page.locator('.gb-finishing summary').click();
  await page.getByLabel('Your message (optional)').fill('For your special day');
  await page.getByRole('button',{name:'Next: Review'}).click();
  const poses=await page.locator('.gb-placed').evaluateAll(els=>els.map(el=>el.getAttribute('style')));
  await page.getByRole('banner').getByRole('link',{name:'Tap and Wrap home',exact:true}).click();await page.goBack();
  await expect(page.getByRole('button',{name:'Add Your Gift to Cart'})).toBeVisible();
  await expect(page.locator('.gb-free-photo img')).toHaveAttribute('src',url);
  expect(await page.locator('.gb-placed').evaluateAll(els=>els.map(el=>el.getAttribute('style')))).toEqual(poses);
  expect(await page.evaluate(()=>window.revokedGiftUrls)).not.toContain(url);
  await page.getByRole('button',{name:'Edit your gift',exact:true}).click();
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
  await expect(page.getByLabel('Your message (optional)')).toHaveValue('For your special day');
  await expect(page.getByRole('button',{name:'Choose Fixture ribbon-navy',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
  await page.locator('.gb-personal-section').last().locator('summary').click();
  await expect(page.getByLabel('Write a name, special date, or heartfelt message')).toHaveValue('Nour, with love');
  await expect(page.getByRole('radio',{name:'Gold',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Start a new gift',exact:true}).click();
  await page.getByRole('button',{name:'Keep editing'}).click();await expect(page.locator('.gb-free-photo img')).toHaveAttribute('src',url);
  await page.getByRole('button',{name:'Start a new gift',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Start new gift'}).click();
  await expect(page.locator('.gb-placed')).toHaveCount(0);await expect(page.locator('.gb-preview-empty')).toBeVisible();
  expect(await page.evaluate(()=>window.revokedGiftUrls)).toContain(url);
  expect(fixture.uploads).toHaveLength(0);expect(audit.adds).toHaveLength(0);
});

for(const width of [390,1440]) for(const box of [1,5,7,11,12]) test(`insertion sequence and unrestricted dragging: Box ${box} at ${width}px`,async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:1000});await localCheckoutFixture(page);await page.goto('/customize/gift-box');
  // Exercise the same state reducer and interactive renderer for every box,
  // including Box 1's corrected local overlay, without changing DEV eligibility.
  await page.evaluate(async boxNumber=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {default:Canvas}=await import('/src/gift-box/FreeArrangementCanvas.jsx');
    const {initialArrangement,arrangementReducer,changeArrangement}=await import('/src/gift-box/state.mjs');
    const {FREE_PRESENTATION}=await import('/src/gift-box/free-presentation.mjs');
    document.querySelector('#root').style.display='none';const host=document.createElement('main');host.id='release-preview';host.style.cssText='max-width:640px;margin:20px auto;padding:16px;background:#fffcfb';document.body.append(host);
    const components=[{componentId:'rose-red',displayName:'Red rose'},{componentId:'plush-1',category:'plush',displayName:'Plush 1'},{componentId:'chocolate-18',displayName:'Lindt milk chocolate'}];
    let history={present:changeArrangement({...initialArrangement(),freePlacement:true},{type:'box',id:`box-${boxNumber}`,presentationVersion:FREE_PRESENTATION}),past:[]};
    const root=createRoot(host);
    function dispatch(action) {history=arrangementReducer(history,action);render();}
    function render() {
      window.preReleaseDesign=history.present;
      root.render(React.createElement(React.Fragment,null,React.createElement('h1',{style:{fontSize:30}},`Your gift · Box ${boxNumber}`),React.createElement('div',{'data-add-controls':true,style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}},...components.map((item,index)=>React.createElement('button',{key:item.componentId,type:'button',className:'button button-secondary',onClick:()=>dispatch({type:'add',id:item.componentId,instanceId:crypto.randomUUID(),study:true,flexible:true})},['Add rose','Add Soft Toy','Add chocolate'][index]))),React.createElement(Canvas,{state:history.present,components,dispatch,undo:()=>dispatch({type:'undo'}),canUndo:history.past.length>0})));
    }
    render();
  },box);
  const preview=page.locator('#release-preview'),canvas=preview.locator('.gb-canvas');
  await expect(canvas).toBeVisible();const frame=await canvas.boundingBox();
  async function screenshot(stage) {
    await preview.locator('img').evaluateAll(async images=>{for(const image of images){image.loading='eager';await image.decode();}});
    await preview.screenshot({path:info.outputPath(`box-${box}-${width}-${stage}.png`)});
  }
  await screenshot('empty');
  for(const [index,name] of ['Add rose','Add Soft Toy','Add chocolate'].entries()) {
    await page.getByRole('button',{name,exact:true}).click();await expect(preview.locator('.gb-placed')).toHaveCount(index+1);
    await screenshot(['rose','soft-toy','chocolate'][index]);
    expect((await canvas.boundingBox()).height).toBeCloseTo(frame.height);
  }
  const design=await page.evaluate(()=>window.preReleaseDesign);
  for(const item of design.instances) {
    expect(item.x).toBeGreaterThanOrEqual(0);expect(item.y).toBeGreaterThanOrEqual(0);expect(item.x+item.width).toBeLessThanOrEqual(1);expect(item.y+item.height).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole('button',{name:'Move Soft Toy 1',exact:true})).toBeVisible();
  const rose=page.getByRole('button',{name:'Move Red rose',exact:true});
  for(const target of [{x:.5,y:.1},{x:.5,y:.88},{x:.1,y:.5}]) {
    const from=await rose.boundingBox(),area=await canvas.boundingBox();
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(area.x+area.width*target.x,area.y+area.height*target.y,{steps:8});await page.mouse.up();
    const position=await rose.boundingBox();expect(position.x).toBeGreaterThanOrEqual(area.x-1);expect(position.y).toBeGreaterThanOrEqual(area.y-1);expect(position.x+position.width).toBeLessThanOrEqual(area.x+area.width+1);expect(position.y+position.height).toBeLessThanOrEqual(area.y+area.height+1);
    expect(Math.abs((position.x+position.width/2-area.x)/area.width-target.x)).toBeLessThan(.04);
    expect(Math.abs((position.y+position.height/2-area.y)/area.height-target.y)).toBeLessThan(.04);
    expect((await page.evaluate(()=>window.preReleaseDesign.instances[0])).placementZone).toBe('beside');
  }
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByRole('heading',{name:`Your gift · Box ${box}`}).click();await expect(page.getByRole('button',{name:'Delete selected item'})).toBeDisabled();
  expect(errors).toEqual([]);
});
test('owner generation change discards private draft and revokes URLs before another owner can use it',async({page})=>{
  const {fixture,audit}=await localCheckoutFixture(page,{personalized:true});await beginGiftBox(page);await personalize(page);
  const url=await page.locator('.gb-free-photo img').getAttribute('src');
  fixture.state.user={id:'710000000000000000000051',name:'Synthetic new owner',role:'customer'};
  await page.evaluate(async()=>{const session=await import('/src/auth/session.js');session.sessionChangedElsewhere();});
  await expect(page.locator('.gb-preview-empty')).toBeVisible();await expect(page.locator('.gb-free-photo')).toHaveCount(0);
  expect(await page.evaluate(()=>window.revokedGiftUrls)).toContain(url);expect(audit.adds).toHaveLength(0);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toMatch(/Nour|synthetic\.png|blob:/);
  await page.getByRole('button',{name:'Choose Fixture box-2',exact:true}).click();await personalize(page);
  const nextUrl=await page.locator('.gb-free-photo img').getAttribute('src');fixture.state.user=null;
  await page.evaluate(async()=>{const session=await import('/src/auth/session.js');session.sessionChangedElsewhere();});
  await expect(page.locator('.gb-preview-empty')).toBeVisible();expect(await page.evaluate(()=>window.revokedGiftUrls)).toContain(nextUrl);
});

test('all forty artworks: original versus calibrated size contact sheet',async({page},info)=>{
  await page.setViewportSize({width:1440,height:1000});await localCheckoutFixture(page);await page.goto('/customize/gift-box');
  await page.evaluate(async()=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {default:Artwork}=await import('/src/gift-box/Artwork.jsx');
    const {freeFootprint}=await import('/src/gift-box/state.mjs');
    const {freePresentation}=await import('/src/gift-box/free-presentation.mjs');
    const {ARTWORK_METRICS}=await import('/src/gift-box/artwork-metrics.mjs');
    document.querySelector('#root').style.display='none';const host=document.createElement('main');host.id='asset-calibration';host.style.cssText='padding:20px;background:#fffcfb;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px';document.body.append(host);
    const ids=Object.keys(ARTWORK_METRICS).filter(id=>/^(rose-|plush-|chocolate-)/.test(id));
    createRoot(host).render(React.createElement(React.Fragment,null,...ids.map(id=>React.createElement('section',{key:id,style:{padding:12,border:'1px solid #eadad5',borderRadius:12}},React.createElement('h2',{style:{fontSize:18}},id),React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},...['gift-box-presentation-v1','gift-box-presentation-v2'].map((version,i)=>{
      const size=freeFootprint('box-2',id,version),aspect=freePresentation('box-2',version).aspect;
      return React.createElement('div',{key:version},React.createElement('p',null,i?'Calibrated':'Original'),React.createElement('div',{style:{height:190,display:'grid',placeItems:'center',background:'#fff'}},React.createElement('div',{style:{position:'relative',width:size.width*300,height:size.height*300/aspect}},React.createElement(Artwork,{componentId:id,role:'placement',normalize:true}))));
    }))))));
  });
  await expect(page.locator('#asset-calibration section')).toHaveCount(40);
  await page.locator('#asset-calibration img').evaluateAll(async images=>{for(const img of images){img.loading='eager';await img.decode();}});
  await page.screenshot({path:info.outputPath('all-40-artworks-original-calibrated.png'),fullPage:true});
});
test('outside pointer clears selection while arrows, Undo, fullscreen and delete remain usable',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await localCheckoutFixture(page);await beginGiftBox(page);
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  const item=page.locator('.gb-placed').first();await item.focus();
  const left=await item.evaluate(el=>el.style.left);await page.getByRole('button',{name:'Move right',exact:true}).click();expect(await item.evaluate(el=>el.style.left)).not.toBe(left);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await item.evaluate(el=>el.style.left)).toBe(left);
  await page.getByRole('heading',{name:'Fill With Flowers',exact:true}).click();await expect(page.getByRole('button',{name:'Delete selected item'})).toBeDisabled();
  await page.setViewportSize({width:390,height:844});await item.focus();await page.getByRole('button',{name:'Expand preview'}).click();await expect(page.getByRole('button',{name:'Delete selected item'})).toBeEnabled();
  await page.getByRole('button',{name:'Move down',exact:true}).click();await page.getByRole('button',{name:'Close expanded preview'}).click();
  await page.setViewportSize({width:1440,height:1000});await item.focus();await item.press('Escape');await expect(page.getByRole('button',{name:'Delete selected item'})).toBeDisabled();
  await item.click();await page.getByRole('button',{name:'Delete selected item'}).click();await expect(page.locator('.gb-placed')).toHaveCount(0);
});
test('sticker input is readable and charges once; generic legacy toy names are normalized in options and cart',async({page})=>{
  const {fixture}=await localCheckoutFixture(page,{personalized:true});fixture.components.find(item=>item.componentId==='plush-1').displayName='Plush 1';
  await beginGiftBox(page);await page.getByRole('button',{name:'Add Soft Toys',exact:true}).click();
  await page.getByRole('button',{name:'Add Soft Toy 1',exact:true}).click();await expect(page.getByRole('button',{name:'Move Soft Toy 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();await page.locator('.gb-personal-section').last().locator('summary').click();
  const input=page.getByLabel('Write a name, special date, or heartfelt message');
  const styles=await input.evaluate(el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,border:s.borderTopWidth,color:s.color,background:s.backgroundColor};});
  expect(styles.height).toBeGreaterThanOrEqual(44);expect(parseFloat(styles.border)).toBeGreaterThan(0);expect(styles.color).not.toBe(styles.background);
  await expect(page.locator('.gb-live-total strong')).toContainText('20.00');await input.fill('Nour');await expect(page.locator('.gb-live-total strong')).toContainText('40.00');
  await input.fill('Nour and family');await expect(page.locator('.gb-live-total strong')).toContainText('40.00');
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.getByRole('button',{name:'Next: Review'}).click();
  await page.getByRole('button',{name:'Add Your Gift to Cart'}).click();await expect(page).toHaveURL(/\/cart$/);await expect(page.locator('main')).toContainText('Soft Toy 1');
});

// Render the real shared canvas with synthetic data, without changing catalog
// eligibility (including the development-only Box 1 warning) or calling APIs.
for(const width of [320,390,440,1440]) test(`dense shared renderer evidence at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await localCheckoutFixture(page);await page.goto('/customize/gift-box');
  const result=await page.evaluate(async()=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {default:Canvas}=await import('/src/gift-box/FreeArrangementCanvas.jsx');
    const {freeFootprint}=await import('/src/gift-box/state.mjs');
    const {FREE_PRESENTATION}=await import('/src/gift-box/free-presentation.mjs');
    const {ARTWORK_METRICS}=await import('/src/gift-box/artwork-metrics.mjs');
    const {freePlacementZone}=await import('/src/gift-box/free-presentation.mjs');
    document.querySelector('#root').style.display='none';const host=document.createElement('main');host.id='calibration-evidence';host.style.cssText='padding:12px;background:#fffcfb';document.body.append(host);
    const photos=[.5,1,2].map((aspectRatio,index)=>({id:`photo-${index}`,aspectRatio,url:`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${120*aspectRatio}" height="120"><rect width="100%" height="100%" fill="#b8cece"/><text x="8" y="60">Synthetic ${aspectRatio}</text></svg>`)}`}));
    const all=Object.keys(ARTWORK_METRICS).filter(id=>/^(rose-|plush-|chocolate-)/.test(id));
    const frames=innerWidth>=1000?Array.from({length:12},(_,i)=>i+1):[1,5,7,11,12];
    const measurements=[];
    createRoot(host).render(React.createElement('div',{style:{display:'grid',gridTemplateColumns:innerWidth>=1000?'repeat(3,minmax(0,1fr))':'1fr',gap:16}},frames.map(number=>{
      const boxId=`box-${number}`,ids=['rose-red','rose-yellow','rose-black','plush-1','chocolate-14','chocolate-18'];
      const instances=ids.map((componentId,i)=>{const size=freeFootprint(boxId,componentId,FREE_PRESENTATION),x=[.3,.42,.54,.08,.56,.78][i],y=[.28,.3,.32,.48,.48,.15][i];return {id:`item-${i}`,componentId,...size,x,y,placementZone:freePlacementZone(boxId,size,{x,y},FREE_PRESENTATION)};});
      for(const id of all) measurements.push({boxId,componentId:id,old:freeFootprint(boxId,id,'gift-box-presentation-v1'),current:freeFootprint(boxId,id,FREE_PRESENTATION)});
      return React.createElement('section',{key:boxId,'data-box':boxId},React.createElement('h2',null,`Box ${number}`),React.createElement(Canvas,{readOnly:true,state:{boxId,presentationVersion:FREE_PRESENTATION,instances,ribbonId:'ribbon-navy'},components:[],personal:{photos,photoPositions:{}},dispatch:()=>{}}));
    })));
    return measurements;
  });
  await expect(page.locator('#calibration-evidence .gb-free-box').first()).toBeVisible();
  await page.locator('#calibration-evidence img').evaluateAll(async images=>{for(const img of images){img.loading='eager';await img.decode().catch(()=>{});}});
  expect(await page.locator('#calibration-evidence .gb-artwork-missing').count()).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const number of [1,5,7,11,12]) {
    const card=page.locator(`[data-box="box-${number}"]`);await card.screenshot({path:info.outputPath(`box-${number}-${width}.png`)});
    const bounds=await card.locator('.gb-canvas').boundingBox();for(const item of await card.locator('.gb-placed').all()) {const rect=await item.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(bounds.x-1);expect(rect.y).toBeGreaterThanOrEqual(bounds.y-1);expect(rect.x+rect.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);expect(rect.y+rect.height).toBeLessThanOrEqual(bounds.y+bounds.height+1);}
  }
  await page.screenshot({path:info.outputPath(`dense-contact-sheet-${width}.png`),fullPage:true});
  await info.attach('component-measurements.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
});
