// Owned test child. IPC shutdown works on Windows without npm/cmd process trees.
import { createServer } from 'vite';
if (process.env.TAP_WRAP_ISOLATED_TEST !== 'true' || !process.send) throw new Error('Isolated launcher required');
const server = await createServer({ configFile: 'vite.contract.config.js', cacheDir: 'test-results/contract-vite-cache-' + process.env.TAP_WRAP_CONTRACT_API_PORT, server: { host: '127.0.0.1', port: Number(process.env.TAP_WRAP_CONTRACT_WEB_PORT), strictPort: true } });
let stopping;
function stop() { return stopping ||= (async () => { server.httpServer?.closeAllConnections(); await server.close(); })(); }
process.on('message', async message => {
  if (message !== 'stop') return;
  try { await stop(); process.send?.({ stopped: true }); } catch { process.exitCode = 1; }
  finally { process.disconnect(); }
});
process.once('disconnect', () => { void stop(); });
await server.listen(); process.send({ ready: true });
