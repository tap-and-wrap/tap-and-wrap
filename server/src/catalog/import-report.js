import { writeFile, rename, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
function inside(candidate) {
  const relative = path.relative(projectRoot, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Import reports must remain inside this project.');
}

/** Replace one report atomically; a interrupted write cannot leave half a JSON
 * document. Resolve the parent each time so a redirected path cannot escape. */
export async function writeImportReport(reportPath, report) {
  const destination = path.resolve(reportPath);
  inside(destination);
  const directory = await realpath(path.dirname(destination));
  if (directory !== projectRoot) inside(directory);
  try { inside(await realpath(destination)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(directory, `.${path.basename(destination)}.${randomUUID()}.tmp`);
  inside(temporary);
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}
