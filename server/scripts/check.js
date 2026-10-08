import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? collect(join(directory, entry.name)) :
      entry.name.endsWith('.js') ? [join(directory, entry.name)] : []);
}
const files = ['src', 'scripts', 'test'].flatMap(directory => collect(join(serverRoot, directory)));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(1);
}
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
