// Assemble existing local review evidence. Source/product artwork is never edited.
import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PROJECT_ROOT } from './lib/gift-box-assets.js';
import { writeOwnedFile } from './lib/prepare-gift-box-assets.js';

const reviewed=path.join(PROJECT_ROOT,'client','test-results-gift-box-phase35-reviewed');
const output=path.join(PROJECT_ROOT,'server','.cache','gift-box-phase35','review');
async function collect(directory){const list=[];for(const entry of await readdir(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())list.push(...await collect(target));else if(entry.isFile()&&entry.name.endsWith('.png'))list.push(target);}return list;}
const files=[...await collect(reviewed),...await collect(path.join(PROJECT_ROOT,'client','test-results-gift-box-phase35-mixed-final'))], index=[];
for(const file of files){const name=path.basename(file);if(index.some(item=>item.name===name))throw new Error('Duplicate review artifact name.');await writeOwnedFile(path.join(output,name),await readFile(file));index.push({name,source:path.relative(PROJECT_ROOT,file).replaceAll('\\','/')});}
const beforeRoot=path.join(PROJECT_ROOT,'client','test-results-gift-box-phase3-complete');
const before=await collect(beforeRoot);
for(const width of [320,390]){
  const source=before.find(file=>path.basename(file)===`builder-${width}.png`);if(!source)throw new Error('Preserved before evidence is missing.');
  await writeOwnedFile(path.join(output,`mobile-${width}-before.png`),await readFile(source));
}
for(let n=1;n<=12;n++){const name=`box-${n}-draft-boundary.png`;await writeOwnedFile(path.join(output,name),await readFile(path.join(output,'..','geometry-reviewed',name)));}
for(const name of ['box-1-defect-diagnostic.png','box-1-defect-diagnostic.json','draft-geometry-review.json'])await writeOwnedFile(path.join(output,name),await readFile(path.join(output,'..','geometry-reviewed',name)));

const tiles=[],width=1800,columnWidth=450;
async function tile(name,label,left,top,height,crop){
  const file=path.join(output,name);let image=sharp(await readFile(file));const meta=await image.metadata();
  if(crop){const y=Math.min(crop.top,meta.height-1),h=Math.min(crop.height,meta.height-y);image=image.extract({left:0,top:y,width:meta.width,height:h});}
  const picture=await image.resize({width:columnWidth-24,height:height-50,fit:'contain',background:'#ffffff',withoutEnlargement:true}).flatten({background:'#fff'}).png().toBuffer();
  const pictureMeta=await sharp(picture).metadata();
  tiles.push({input:picture,left:left+Math.floor((columnWidth-pictureMeta.width)/2),top:top+42});
  const title=Buffer.from(`<svg width="${columnWidth}" height="36"><rect width="${columnWidth}" height="36" fill="#FFFCFB"/><text x="12" y="23" font-size="17" fill="#62483F">${label}</text></svg>`);tiles.push({input:title,left,top});
}
await tile('mobile-320-before.png','320px BEFORE / Phase 3',0,0,600,{top:95,height:2300});
await tile('mobile-320-after.png','320px AFTER / options precede Next',450,0,600,{top:95,height:2300});
await tile('mobile-390-before.png','390px BEFORE / Phase 3',900,0,600,{top:95,height:2200});
await tile('mobile-390-after.png','390px AFTER / options precede Next',1350,0,600,{top:95,height:2200});
await tile('desktop-mixed-arrangement-after.png','Mixed layout / draft proportions',0,610,440,{top:400,height:1000});
await tile('oversized-plush-beside-proposal.png','Plush beside / extended-scene draft',450,610,440);
await tile('step-5-finishing-touches.png','Step 5 / card text, price pending',900,610,440,{top:400,height:1000});
await tile('restricted-admin-component-editor.png','Restricted fixed-component settings',1350,610,440);
for(let n=1;n<=12;n++)await tile(`box-${n}-draft-boundary.png`,`BOX ${n} / ${n===11?'two floors':'floor'} / UNREVIEWED`,((n-1)%4)*450,1060+Math.floor((n-1)/4)*460,450);
await writeOwnedFile(path.join(output,'phase35-review-contact-sheet.jpg'),await sharp({create:{width,height:2440,channels:3,background:'#fff'}}).composite(tiles).jpeg({quality:88}).toBuffer());
await writeOwnedFile(path.join(output,'review-artifact-index.json'),Buffer.from(JSON.stringify({developmentOnly:true,productionApproved:false,syntheticFixtureNamesAndPrices:true,artwork:'actual owner-supplied images',copiedBrowserEvidence:index},null,2)+'\n'));
console.log(JSON.stringify({mode:'local-review-only',contactSheet:'server/.cache/gift-box-phase35/review/phase35-review-contact-sheet.jpg',browserArtifacts:index.length,geometryOverlays:12,sourceModified:false,databaseConnections:false,networkRequests:false}));
