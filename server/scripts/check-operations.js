import { pathToFileURL } from 'node:url';
import { validateDatabaseUri, databaseDiagnostic } from '../src/config/database-safety.js';
import { runtimeSettings, validateAuthTopology } from '../src/config/deployment.js';
import { validateDatabaseDns } from '../src/config/database-dns.js';

/** Offline only: terminal configuration, no .env, DNS, provider or database calls. */
export function checkOperationalConfiguration(configuration = process.env) {
  const settings = { ...runtimeSettings(configuration), nodeEnv: configuration.NODE_ENV || 'development',
    databaseTarget: configuration.DATABASE_TARGET || 'local', mongoUri: configuration.MONGODB_URI || '',
    clientOrigin: configuration.CLIENT_ORIGIN || 'http://localhost:5173' };
  const topology = validateAuthTopology(settings);
  const target = validateDatabaseUri(settings.mongoUri, { target: settings.databaseTarget, nodeEnv: settings.nodeEnv,
    productionDatabaseAuthorized: settings.productionDatabaseAuthorized, productionDatabaseHost: settings.productionDatabaseHost });
  const dns = validateDatabaseDns(settings);
  return { mode: 'offline', connected: false, writes: false, target: target.target, database: target.dbName,
    topology, trustedProxyRanges: settings.trustedProxyCidrs.length, dnsOverrideEnabled: dns.length > 0,
    connectAttempts: settings.databaseConnectAttempts };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(JSON.stringify({ ok: true, ...checkOperationalConfiguration() }, null, 2)); }
  catch (error) {
    console.error(JSON.stringify({ ok: false, error: databaseDiagnostic(error) }));
    process.exitCode = 1;
  }
}
