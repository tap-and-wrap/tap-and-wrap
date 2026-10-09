import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Pass only operating-system/browser settings, never merchant/provider config.
const inheritedKeys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PLAYWRIGHT_CHANNEL'];
const safeEnv = Object.fromEntries(inheritedKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)), 'test', '--config', 'playwright.contract.config.js', ...process.argv.slice(2)],
  { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', env: { ...safeEnv, NODE_ENV: 'test', NODE_OPTIONS: '', TAP_WRAP_ISOLATED_TEST: 'true', MONGODB_URI: '', CATALOG_IMPORT_STAGING_URI: '' } });
if (result.error) { console.error('Isolated connected browser tests could not start.'); process.exit(1); }
process.exit(result.status ?? 1);
