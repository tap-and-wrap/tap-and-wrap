import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Own the Vite child through IPC, as the connected runner does. Windows shell
// process-tree termination can otherwise leave successful tests waiting forever.
// No existing development server or inherited merchant environment is reused.
const cwd=fileURLToPath(new URL('../',import.meta.url));
const allowed=['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','PLAYWRIGHT_CHANNEL'];
const safe=Object.fromEntries(allowed.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
const args=process.argv.slice(2),forwarded=[];let selected='playwright.config.js';
for(let index=0;index<args.length;index++){
  if(['--config','-c'].includes(args[index]))selected=args[++index];
  else if(args[index].startsWith('--config='))selected=args[index].slice(9);
  else forwarded.push(args[index]);
}
const configPath=resolve(cwd,selected||''),within=relative(cwd,configPath);
if(!within||within.startsWith('..')||isAbsolute(within)||!/^playwright(?:\.[a-z0-9-]+)?\.config\.js$/.test(basename(configPath)))throw Error('Select an existing project Playwright configuration.');
const configuration=(await import(pathToFileURL(configPath).href)).default;
const env={...safe,...configuration.webServer?.env,NODE_ENV:'test',NODE_OPTIONS:'',TAP_WRAP_ISOLATED_TEST:'true',TAP_WRAP_BROWSER_CONFIG:configPath,TAP_WRAP_BROWSER_PREVIEW:String(configuration.metadata?.browserFixture==='production-preview'),MONGODB_URI:'',CATALOG_IMPORT_STAGING_URI:''};
let vite,browser,stopping;
async function stop(){return stopping||=(async()=>{
  if(!vite||vite.exitCode!==null)return;
  let timer;const closed=once(vite,'exit');vite.send('stop');
  try{const [code]=await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned browser fixture shutdown timed out.')),30000);})]);if(code!==0)throw Error('Owned browser fixture cleanup failed.');}
  finally{clearTimeout(timer);}
})();}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{browser?.kill(signal);void stop().catch(()=>{process.exitCode=1;});});
try{
  vite=fork(fileURLToPath(new URL('./browser-vite-server.js',import.meta.url)),[],{cwd,env,stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
  await new Promise((resolveReady,reject)=>{
    const timer=setTimeout(()=>reject(Error('Owned browser fixture startup timed out.')),30000);
    const ready=value=>{if(value?.ready){clearTimeout(timer);vite.off('message',ready);resolveReady();}};
    vite.on('message',ready);vite.once('error',error=>{clearTimeout(timer);reject(error);});vite.once('exit',code=>{clearTimeout(timer);reject(Error(`Owned browser fixture exited before readiness (${code}).`));});
  });
  browser=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/@playwright/test/cli.js',import.meta.url)),'test','--config','scripts/owned-browser.config.js',...forwarded],{cwd,env,stdio:'inherit',windowsHide:true});
  const [code]=await once(browser,'exit');process.exitCode=code??1;
}catch(error){console.error(error.message);process.exitCode=1;}
finally{try{await stop();console.log('Owned browser fixture stopped cleanly.');}catch(error){console.error(error.message);process.exitCode=1;}}
