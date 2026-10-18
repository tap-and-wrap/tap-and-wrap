import { app } from './app.js';
import { env, assertAuthConfig } from './config/env.js';
import { connectDatabase } from './config/db.js';
import mongoose from 'mongoose';
import { beginDatabaseDrain } from './config/db.js';
import { validateAuthTopology } from './config/deployment.js';
import { createGracefulShutdown } from './config/shutdown.js';
import { startInlineEmailDispatch } from './email/inline-dispatch.js';

try {
  validateAuthTopology(env);
  if (env.nodeEnv === 'production') assertAuthConfig();
  const controller = new AbortController();
  const server = app.listen(env.port, () => console.log(JSON.stringify({ event: 'api_listening', port: env.port })));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  const startup = connectDatabase({ signal: controller.signal });
  let inlineEmail;
  let shuttingDown = false;
  void startup.then(() => {
    if (!shuttingDown) inlineEmail = startInlineEmailDispatch();
  }).catch(() => {});
  const shutdown = createGracefulShutdown({ server,
    disconnect: async () => { inlineEmail?.stop(); await startup; await mongoose.disconnect(); },
    beginDrain: () => { shuttingDown = true; inlineEmail?.stop(); beginDatabaseDrain(); },
    abortStartup: () => controller.abort(), timeoutMs: env.shutdownTimeoutMs });
  server.once('error', () => {
    console.error(JSON.stringify({ event: 'startup_rejected', code: 'SERVER_LISTEN_FAILED' }));
    shutdown().then(() => process.exit(1)).catch(() => process.exit(1));
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    shutdown(signal).then(result => { process.exit(result.disconnected ? 0 : 1); }).catch(() => { process.exit(1); });
  });
} catch {
  console.error(JSON.stringify({ event: 'startup_rejected', code: 'OPERATIONAL_CONFIGURATION_INVALID' }));
  process.exitCode = 1;
}
