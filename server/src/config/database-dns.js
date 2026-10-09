import dns from 'node:dns';
import { isIP } from 'node:net';
import { OperationalConfigurationError } from './deployment.js';

export function validateDatabaseDns(configuration = {}) {
  const enabled = configuration.mongoDnsOverrideEnabled === true;
  const value = configuration.mongoDnsServers || '';
  if (!enabled) {
    if (value) throw new OperationalConfigurationError('DATABASE_DNS_OVERRIDE_NOT_ENABLED');
    return [];
  }
  if (configuration.nodeEnv !== 'development' || configuration.databaseTarget !== 'staging') {
    throw new OperationalConfigurationError('DATABASE_DNS_OVERRIDE_REJECTED');
  }
  if (typeof value !== 'string') throw new OperationalConfigurationError('DATABASE_DNS_CONFIGURATION_INVALID');
  const servers = value.split(',').map(server => server.trim());
  if (servers.length < 1 || servers.length > 3 || new Set(servers).size !== servers.length
    || servers.some(server => !isIP(server) || ['0.0.0.0', '::'].includes(server))) {
    throw new OperationalConfigurationError('DATABASE_DNS_CONFIGURATION_INVALID');
  }
  return servers;
}

/** Opt-in, process-only resolver setup; never changes OS networking or performs DNS here. */
export function initializeDatabaseDns(configuration, { setServers = dns.setServers } = {}) {
  const servers = validateDatabaseDns(configuration);
  if (servers.length) {
    if (!configuration.mongoUri?.startsWith('mongodb+srv://')) throw new OperationalConfigurationError('DATABASE_DNS_SRV_REQUIRED');
    setServers(servers);
  }
  return { overrideEnabled: servers.length > 0, resolverCount: servers.length };
}
