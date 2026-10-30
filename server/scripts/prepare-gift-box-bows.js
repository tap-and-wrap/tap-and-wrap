// Local-only import for 21 owner-supplied transparent WebP bows.
// Deliberately independent from the 99-file, pinned source manifest.
import { readFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { RIBBON_BOW_FILES, RIBBON_BOW_VERSION } from '../../shared/gift-box/ribbon-bows.mjs';
import { assertNoLinks, inspectImage, PROJECT_ROOT, sha256 } from './lib/gift-box-assets.js';
import { safeDirectory, writeOwnedFile } from './lib/prepare-gift-box-assets.js';

const original = path.join(PROJECT_ROOT, 'local-data', 'taw-giftbox', 'ribbons');
const isolated = path.join(PROJECT_ROOT, 'local-data', 'taw-giftbox-bows', 'ribbons');
const output = path.join(PROJECT_ROOT, 'client', '.gift-box-assets', RIBBON_BOW_VERSION);
const expected = new Set(RIBBON_BOW_FILES.map(item => item.filename));
const mode = process.argv[2];
if (process.argv.length > 3 || ![undefined, '--move-from-original'].includes(mode)) {
  throw new Error('Use no arguments, or --move-from-original to move the 21 bows out of the pinned 99-image source.');
}

async function inspectNamedFile(directory, filename) {
  const target = path.join(directory, filename);
  const bytes = await readFile(target);
  await assertNoLinks(target);
  const meta = await inspectImage(bytes);
  if (meta.format !== 'webp' || !meta.hasAlpha || meta.transparentPixels < 1000 || meta.visibleBounds[2] < 0
    || meta.width < 512 || meta.height < 512) throw new Error(`Bow ${filename} must be a complete, transparent WebP at least 512px wide and tall.`);
  return { bytes, meta };
}

if (mode === '--move-from-original') {
  // Preflight ALL 21 sources first, so malformed or missing assets do not cause
  // a partial rename. A retry after interruption is still safe/idempotent.
  const transfer = [];
  for (const {filename} of RIBBON_BOW_FILES) {
    let from;
    try { from = await inspectNamedFile(original, filename); }
    catch (e) {
      if (e.code === 'ENOENT') {
        try { await inspectNamedFile(isolated, filename); continue; }
        catch { throw new Error(`Missing bow ${filename} from both local source folders.`); }
      }
      throw e;
    }
    try { const existing = await inspectNamedFile(isolated, filename);
      if (sha256(existing.bytes) !== sha256(from.bytes)) throw new Error(`Conflicting bow ${filename}: refusing to overwrite.`);
      throw new Error(`Bow ${filename} already exists in both source folders; remove duplicate manually.`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    transfer.push(filename);
  }
  await safeDirectory(isolated);
  for (const filename of transfer) await rename(path.join(original, filename), path.join(isolated, filename));
  console.log(`Moved ${transfer.length} bow assets to independent local-data/taw-giftbox-bows/ribbons/ collection.`);
}

await assertNoLinks(isolated);
const names = (await readdir(isolated, { withFileTypes:true })).map(entry => {
  if (!entry.isFile()) throw new Error('Ribbon source contains a directory or other unsupported entry.');
  return entry.name;
}).sort();
if (names.length !== 21 || names.some(name => !expected.has(name))) throw new Error('Expected exactly the 21 approved ribbon filenames in local-data/taw-giftbox-bows/ribbons/.');
const inspected = [];
for (const {componentId,filename} of RIBBON_BOW_FILES) {
  const {bytes,meta} = await inspectNamedFile(isolated, filename);
  inspected.push({ componentId, filename, sourceBytes: bytes, ...meta });
}
const shape = inspected.map(item => item.width/item.height);
if (Math.max(...shape) - Math.min(...shape) > 0.03) {
  throw new Error('Bow canvas aspect ratios are inconsistent; review before publishing even to the development preview.');
}
let created = 0;
for (const item of inspected) {
  const result = await writeOwnedFile(path.join(output, item.filename), item.sourceBytes);
  if (result === 'created') created++;
}
const manifest = { version: RIBBON_BOW_VERSION, developmentOnly:true, productionApproved:false,
  entries: inspected.map(({componentId,filename,width,height,bytes,sha256:hash,visibleBounds,transparentPixels}) => ({
    componentId, filename,width,height,bytes,sha256:hash,visibleBounds,transparentPixels,
  })),
};
await writeOwnedFile(path.join(output, 'development-manifest.json'), Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
console.log(JSON.stringify({ prepared:inspected.length,created, unchanged:inspected.length-created,
  preview:'Vite development server only', productionApproved:false, dataUploaded:false,
  catalog:'12 ribbon buttons initially, then 9 using Load More',
  source:'local-data/taw-giftbox-bows/ribbons', output:'client/.gift-box-assets/ribbon-bows-v1' },null,2));
