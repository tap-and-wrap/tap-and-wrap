import { isIP } from 'node:net';

export class OperationalConfigurationError extends Error {
  constructor(code) {
    super('Operational configuration is invalid. Review the approved deployment configuration privately.');
    this.name = 'OperationalConfigurationError';
    this.code = code;
    this.status = 503;
  }
}

const invalid = (code) => { throw new OperationalConfigurationError(code); };
export function boundedInteger(value, fallback, minimum, maximum, code) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))
    || Number(value) < minimum || Number(value) > maximum) invalid(code);
  return Number(value);
}

function origin(value, httpsRequired) {
  try {
    const parsed = new URL(value);
    if (parsed.origin !== value || parsed.username || parsed.password
      || !['http:', 'https:'].includes(parsed.protocol)
      || (httpsRequired && parsed.protocol !== 'https:')) invalid('AUTH_ORIGIN_INVALID');
    return parsed;
  } catch { invalid('AUTH_ORIGIN_INVALID'); }
}

/** This is configuration validation, not public-suffix/domain ownership verification. */
export function validateAuthTopology(configuration = {}) {
  const mode = configuration.authDeploymentMode || 'local';
  const production = configuration.nodeEnv === 'production';
  const client = origin(configuration.clientOrigin || 'http://localhost:5173', production);
  if (mode === 'local') {
    if (production || !['localhost', '127.0.0.1', '[::1]'].includes(client.hostname)) invalid('AUTH_TOPOLOGY_REJECTED');
    return { mode, secureCookies: false, sameSite: 'lax', hostOnly: true };
  }
  // Existing host-only cookies use NODE_ENV=production for Secure. Remote HTTPS
  // topologies must use that runtime so no session/CSRF/cart cookie loses Secure.
  if (!production || !['same-origin', 'same-site'].includes(mode) || configuration.authTopologyApproved !== true) invalid('AUTH_TOPOLOGY_REJECTED');
  const api = origin(configuration.apiPublicOrigin, true);
  if (client.protocol !== 'https:') invalid('AUTH_TOPOLOGY_REJECTED');
  if (mode === 'same-origin') {
    if (api.origin !== client.origin) invalid('AUTH_TOPOLOGY_REJECTED');
  } else {
    const domain = configuration.authSiteDomain;
    // Restrict to an explicitly approved apex/www storefront and its API subdomain.
    // An operator must separately verify ownership and that this is a registrable site.
    if (typeof domain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)
      || ['workers.dev', 'pages.dev', 'onrender.com', 'github.io', 'co.uk', 'com.eg'].includes(domain)
      || ![domain, `www.${domain}`].includes(client.hostname)
      || !api.hostname.endsWith(`.${domain}`) || api.hostname === client.hostname) invalid('AUTH_TOPOLOGY_REJECTED');
  }
  return { mode, secureCookies: production, sameSite: 'lax', hostOnly: true, domainOwnershipReviewRequired: true };
}

/** Explicit address/CIDR allowlist. Never accept true, hop counts, or unrestricted ranges. */
export function validateTrustedProxies(value = '') {
  if (typeof value !== 'string') invalid('TRUST_PROXY_INVALID');
  if (!value.trim()) return [];
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.length > 16 || new Set(entries).size !== entries.length) invalid('TRUST_PROXY_INVALID');
  for (const entry of entries) {
    const [address, prefix, ...rest] = entry.split('/');
    const family = isIP(address);
    if (rest.length || !family || ['0.0.0.0', '::'].includes(address)
      || (family === 4 && /^(?:127|22[4-9]|23\d|24\d|25[0-5])\./.test(address) && prefix !== undefined)) invalid('TRUST_PROXY_INVALID');
    if (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < (family === 4 ? 8 : 32)
      || Number(prefix) > (family === 4 ? 32 : 128))) invalid('TRUST_PROXY_INVALID');
  }
  return entries;
}

export function runtimeSettings(configuration = process.env) {
  return {
    databaseConnectAttempts: boundedInteger(configuration.DATABASE_CONNECT_ATTEMPTS, 3, 1, 5, 'DATABASE_RETRY_CONFIGURATION_INVALID'),
    databaseRetryBaseMs: boundedInteger(configuration.DATABASE_RETRY_BASE_MS, 500, 1, 5000, 'DATABASE_RETRY_CONFIGURATION_INVALID'),
    shutdownTimeoutMs: boundedInteger(configuration.SHUTDOWN_TIMEOUT_MS, 15000, 100, 30000, 'SHUTDOWN_CONFIGURATION_INVALID'),
    authDeploymentMode: configuration.AUTH_DEPLOYMENT_MODE || 'local',
    authTopologyApproved: configuration.AUTH_TOPOLOGY_APPROVED === 'true',
    apiPublicOrigin: configuration.API_PUBLIC_ORIGIN || '',
    authSiteDomain: configuration.AUTH_SITE_DOMAIN || '',
    trustedProxyCidrs: validateTrustedProxies(configuration.TRUST_PROXY_CIDRS || ''),
    productionDatabaseAuthorized: configuration.PRODUCTION_DATABASE_AUTHORIZED === 'true',
    productionDatabaseHost: configuration.PRODUCTION_DATABASE_HOST || '',
    mongoDnsOverrideEnabled: configuration.MONGODB_DNS_OVERRIDE_ENABLED === 'true',
    mongoDnsServers: configuration.MONGODB_DNS_SERVERS || '',
  };
}
