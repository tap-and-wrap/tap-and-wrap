import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==3||process.argv[2]!=='--write'){console.log('Readiness only: use --write after a reviewed current production SEO build. No deployment performed.');}
else try{
 const manifest=JSON.parse(await readFile(path.join(client,'dist/seo-manifest.json'),'utf8'));
 if(manifest.origin!=='https://tapandwrap.net'||manifest.indexingEnabled!==true||!manifest.productSlugs?.length||!/^[a-f0-9]{64}$/.test(manifest.publication?.id||'')||Date.parse(manifest.publication.expiresAt)<=Date.now()+3600000)throw Error('Publication unavailable or too near expiry');
 if(manifest.productSlugs.some(slug=>!manifest.indexableRoutes.includes('/products/'+slug)||!/^[a-f0-9]{64}$/.test(manifest.productSignatures?.['/products/'+slug]||'')))throw Error('Incomplete product indexing publication');
 const base=JSON.parse(await readFile(path.join(client,'wrangler.jsonc'),'utf8'));
 // --keep-vars with ONLY these explicit vars preserves emergency withdrawals,
 // CSP configuration and other operational settings already on Cloudflare.
 const config={...base,main:path.join(client,'worker/seo-worker.js'),assets:{...base.assets,directory:path.join(client,'dist')},vars:{SEO_INDEXING_ENABLED:'true',SEO_EXPECTED_PUBLICATION_ID:manifest.publication.id}};
 const directory=path.join(client,'test-results/seo-renewal');await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'wrangler.json'),JSON.stringify(config,null,2));
 console.log(JSON.stringify({prepared:true,publicationId:manifest.publication.id,expiresAt:manifest.publication.expiresAt,products:manifest.productSlugs.length,config:'test-results/seo-renewal/wrangler.json',deployed:false}));
}catch{console.error('SEO deployment preparation failed; review the current publication and production origin. Nothing deployed.');process.exitCode=1;}
