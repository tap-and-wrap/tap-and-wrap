import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {exportApprovedContent} from './export-seo-catalog.js';
import {verifyPublicCatalogMedia} from './verify-seo-public-media.js';
import {readPublicSeoCatalog,publicCatalogDigest,waitForPublicSeoApi} from './read-public-seo-catalog.js';

const beforePath='local-data/seo-renewal-before.json',finalPath='local-data/seo-renewal-catalog.json',mediaPath='local-data/seo-renewal-media.json',contentPath='local-data/seo-renewal-content.json';
export async function prepareProductionSeo({readCatalog=readPublicSeoCatalog,verifyMedia=verifyPublicCatalogMedia,writeJson=async(file,value)=>{await mkdir('local-data',{recursive:true});await writeFile(file,JSON.stringify(value));},log=console.log}={}){
  const before=await readCatalog();
  await writeJson(beforePath,before);
  const verification=await verifyMedia(before.products.map(p=>p.mainImageUrl));
  if(verification.failures.length||verification.objects.length!==new Set(before.products.map(p=>p.mainImageUrl)).size)throw Error('Production media verification incomplete');
  await writeJson(mediaPath,verification);
  const after=await readCatalog();
  if(publicCatalogDigest(before)!==publicCatalogDigest(after))throw Error('Catalog or checkout changed during SEO verification; no publication prepared');
  if(verification.objects.some(object=>!Number.isFinite(Date.parse(object.validUntil))||Date.parse(object.validUntil)<=Date.now()+3600000))throw Error('Verified media is too near expiry');
  after.mediaVerification=verification;
  await writeJson(finalPath,after);await writeJson(contentPath,exportApprovedContent());
  const report={prepared:true,databaseConnections:false,databaseWrites:false,products:after.products.length,categories:after.categories.length,verifiedImages:verification.objects.length,checkoutEnabled:after.checkoutEnabled};log(JSON.stringify(report));return report;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 if(process.argv.length===3&&process.argv[2]==='--prepare-authorized-production')waitForPublicSeoApi().then(()=>prepareProductionSeo()).catch(()=>{console.error('Production SEO preparation failed. Check exact read-only target, provider access, current media and source drift; nothing was deployed.');process.exitCode=1;});
 else if(process.argv.length===2)console.log(JSON.stringify({mode:'offline-dry-run',databaseConnected:false,databaseWrites:false,deployed:false,requiredAction:'Explicit --prepare-authorized-production reads only approved public API pages and public media'}));
 else{console.error('Use offline default or --prepare-authorized-production.');process.exitCode=1;}
}
