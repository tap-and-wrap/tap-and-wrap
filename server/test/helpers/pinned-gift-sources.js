// Isolate the historical 99-file inventory from later approved sticker additions.
// Copy only original, hash-pinned artwork; never synthesize or alter merchant assets.
import path from 'node:path';
import {mkdir,copyFile} from 'node:fs/promises';
import {SOURCE_ROOT,readManifest,auditAssetCollection} from '../../scripts/lib/gift-box-assets.js';
export async function pinnedGiftSources(temp) {
  const root=path.join(temp,'pinned-sources'),manifest=await readManifest();
  for(const file of manifest.files) {
    const target=path.join(root,...file.path.split('/'));
    await mkdir(path.dirname(target),{recursive:true});
    await copyFile(path.join(SOURCE_ROOT,...file.path.split('/')),target);
  }
  await auditAssetCollection({root,manifest});
  return root;
}
