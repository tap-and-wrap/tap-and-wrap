import { runtimeSettings } from './deployment.js';
// Operational scripts set this before dynamic imports; their offline paths never load .env.
if (process.env.TAP_WRAP_SKIP_DOTENV !== 'true') await import('dotenv/config');

export const env = {
  ...runtimeSettings(),
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || '',
  databaseTarget: process.env.DATABASE_TARGET || 'local',
  stagingPreviewEnabled: process.env.STAGING_PREVIEW_ENABLED === 'true',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || '',
  // Both gates remain OFF unless an operator explicitly authorizes launch.
  checkoutEnabled: process.env.CHECKOUT_ENABLED === 'true' && process.env.COMMERCE_LAUNCH_AUTHORIZED === 'true',
};
export function assertAuthConfig() {
  if (env.sessionSecret.length < 32 || env.sessionSecret.startsWith('REPLACE_')) {
    throw new Error('SESSION_SECRET must be a non-placeholder random secret at least 32 chars long');
  }
}
