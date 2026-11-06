import { createServer, build, preview } from 'vite';
if(process.env.TAP_WRAP_ISOLATED_TEST!=='true'||process.env.NODE_ENV!=='test'||!process.send||process.env.MONGODB_URI||process.env.CATALOG_IMPORT_STAGING_URI)throw Error('Use the isolated browser launcher.');
// Existing synthetic route/SEO fixtures import the canonical optimized React
// module. Keep Vite's normal cache URL so they use the same React instance.
const productionPreview=process.env.TAP_WRAP_BROWSER_PREVIEW==='true';
let server;
if(productionPreview){
  // This is still a scrubbed local fixture. Compile actual production lazy chunks
  // to an ignored output; never overwrite a merchant dist or load .env files.
  process.env.NODE_ENV='production';
  const outDir='test-results-engraving-browser-preview';
  await build({configFile:'vite.config.js',build:{outDir}});
  const {writeSeoOutput}=await import('./seo/generator.js');
  await writeSeoOutput({outputDirectory:new URL(`../${outDir}/`,import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')});
  server=await preview({configFile:'vite.config.js',build:{outDir},preview:{host:'127.0.0.1',port:5191,strictPort:true}});
}else server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port:5191,strictPort:true}});
let stopping;
function stop(){return stopping||=(async()=>{server.httpServer?.closeAllConnections();if(productionPreview)await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));else await server.close();})();}
process.on('message',async message=>{
  if(message!=='stop')return;
  try{await stop();process.send?.({stopped:true});}catch{process.exitCode=1;}finally{process.disconnect();}
});
process.once('disconnect',()=>{void stop();});
if(!productionPreview)await server.listen();process.send({ready:true});
