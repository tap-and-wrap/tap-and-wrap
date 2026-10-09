import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Browser fixtures must not inherit merchant configuration or load .env files.
const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PLAYWRIGHT_CHANNEL'];
const safe = Object.fromEntries(allowed.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)), 'test', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit',
  env: { ...safe, NODE_ENV: 'test', NODE_OPTIONS: '', TAP_WRAP_ISOLATED_TEST: 'true', MONGODB_URI: '', CATALOG_IMPORT_STAGING_URI: '' },
});
if (result.error) { console.error('Isolated browser tests could not start.'); process.exit(1); }
process.exit(result.status ?? 1);
