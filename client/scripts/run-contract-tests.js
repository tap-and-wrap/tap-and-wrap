import { fork, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const keys = ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','PLAYWRIGHT_CHANNEL'];
const safe = Object.fromEntries(keys.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const args = process.argv.slice(2), enabled = args.includes('--enabled-checkout');
const children = []; let browser, shuttingDown;
async function port() { const socket = createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening'); const value = socket.address().port; await new Promise(resolve => socket.close(resolve)); return value; }
const apiPort = await port(); let webPort = await port(); while (webPort === apiPort) webPort = await port();
const env = { ...safe, NODE_ENV:'test', NODE_OPTIONS:'', TAP_WRAP_ISOLATED_TEST:'true', MONGODB_URI:'', CATALOG_IMPORT_STAGING_URI:'', TAP_WRAP_CONTRACT_API_PORT:String(apiPort), TAP_WRAP_CONTRACT_WEB_PORT:String(webPort), TAP_WRAP_CONTRACT_CHECKOUT:String(enabled), VITE_API_BASE_URL:'http://127.0.0.1:' + apiPort + '/api/v1', VITE_META_ENABLED:'false', VITE_SEO_INDEXING_ENABLED:'false' };
async function start(file) {
  const child = fork(file, ['--isolated-contract-tests'], { cwd, env, stdio:['ignore','inherit','inherit','ipc'], windowsHide:true });
  children.push(child);
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => finish(new Error('Isolated fixture startup timed out')),120000);
    const message = value => { if (value.ready) finish(); }, exit = () => finish(new Error('Isolated fixture exited before readiness'));
    function finish(error) { clearTimeout(timer); child.off('message',message); child.off('exit',exit); error ? reject(error) : resolve(); }
    child.on('message',message); child.once('exit',exit); child.once('error',finish);
  });
}
async function cleanup() {
  return shuttingDown ||= (async () => {
    const failures = [];
    for (const child of children.reverse()) {
      if (child.exitCode !== null || child.signalCode) { if (child.exitCode !== 0) failures.push(new Error('Fixture exited unexpectedly')); continue; }
      const closed = once(child,'exit'); child.send('stop');
      // Deadline reports a lifecycle failure; it never kills a successful child.
      let timer; try { const [code] = await Promise.race([closed, new Promise((_,reject) => { timer=setTimeout(() => reject(new Error('Isolated fixture shutdown did not complete')),30000); })]); if (code !== 0) failures.push(new Error('Fixture cleanup failed')); } catch (error) { failures.push(error); } finally { clearTimeout(timer); }
    }
    if (failures.length) throw new AggregateError(failures, 'Fixture cleanup failed');
  })();
}
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { browser?.kill(signal); void cleanup().catch(() => { process.exitCode=1; }); });
try {
  await start('../server/test/helpers/connected-api-server.js'); await start('scripts/contract-vite-server.js');
  console.log(JSON.stringify({ isolatedFixturePorts: [apiPort, webPort], fixturePids: children.map(child => child.pid) }));
  browser = spawn(process.execPath, ['node_modules/@playwright/test/cli.js','test','--config','playwright.contract.config.js',...args.filter(a => a !== '--enabled-checkout')], { cwd, env, stdio:'inherit', windowsHide:true });
  const [code] = await once(browser,'exit'); process.exitCode = code ?? 1;
} catch { console.error('Isolated connected fixtures failed; no merchant configuration was used.'); process.exitCode=1; }
finally { try { await cleanup(); console.log('Connected fixtures stopped cleanly.'); } catch { console.error('Connected fixture cleanup failed.'); process.exitCode=1; } }
