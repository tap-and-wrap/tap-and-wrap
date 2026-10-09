import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const availableTests = readdirSync(new URL('../test/', import.meta.url))
  .filter(name => name.endsWith('.test.js')).sort().map(name => `test/${name}`);
const requestedTests = process.argv.slice(2);
if (requestedTests.some(name => !availableTests.includes(name))) {
  console.error('Only existing test/*.test.js files may be selected.');
  process.exit(1);
}
const tests = requestedTests.length ? requestedTests : availableTests;
// Tests never load a developer's .env or connect through an existing MongoDB URI.
const inheritedKeys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA'];
const safeEnvironment = Object.fromEntries(inheritedKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: serverRoot, stdio: 'inherit',
  env: {
    ...safeEnvironment, NODE_OPTIONS: '', NODE_ENV: 'test', MONGODB_URI: '', CATALOG_MEDIA_BASE_URL: '',
    CATALOG_IMPORT_STAGING_URI: '', DATABASE_TARGET: 'local', STAGING_PREVIEW_ENABLED: 'false',
    CHECKOUT_ENABLED: 'false', COMMERCE_LAUNCH_AUTHORIZED: 'false', STORAGE_ENABLED: 'false',
    EMAIL_PROVIDER: 'gmail', EMAIL_ENABLED: 'false', EMAIL_USER: '', EMAIL_APP_PASSWORD: '', EMAIL_FROM_NAME: 'Tap & Wrap', EMAIL_SMOKE_TEST_ENABLED: 'false',
    META_ENABLED: 'false', META_POLICY_APPROVED: 'false', META_CAPI_ENABLED: 'false', META_PIXEL_ID: '', META_ACCESS_TOKEN: '', META_API_VERSION: '', META_CONSENT_POLICY_VERSION: '', SITE_ORIGIN: '',
    R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET: '',
    NOTIFICATIONS_ENABLED: 'false', RESEND_API_KEY: '', NOTIFICATION_FROM: '', NOTIFICATION_SAFE_RECIPIENTS: '', NOTIFICATION_LIVE_DELIVERY_ENABLED: 'false',
    SESSION_SECRET: 'tap-and-wrap-isolated-test-secret-not-for-production',
    CLIENT_ORIGIN: 'http://localhost:5173',
    DOTENV_CONFIG_PATH: fileURLToPath(new URL('../test/.no-env-file', import.meta.url)),
    MONGOMS_PREFER_GLOBAL_PATH: 'false',
    MONGOMS_RUNTIME_DOWNLOAD: 'false',
    MONGOMS_SYSTEM_BINARY: '',
    MONGOMS_DOWNLOAD_DIR: fileURLToPath(new URL('../.cache/mongodb/', import.meta.url)),
  },
});
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
