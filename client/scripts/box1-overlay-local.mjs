// Read only one exact local Box 1 development derivative, never sources or
// arbitrary manifest paths. All original Vite security gates remain active.
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { BOX1_OVERLAY, BOX1_OVERLAY_URL } from '../../shared/gift-box/box1-overlay.mjs';

const root = fileURLToPath(new URL(`../.gift-box-assets/${BOX1_OVERLAY.version}/`, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export { BOX1_OVERLAY_URL };
export async function readBox1OverlayDerivative(relative) {
  if (relative !== BOX1_OVERLAY.derivativePath) throw new Error('Unknown Box 1 overlay path.');
  const manifestPath = path.join(root, 'development-manifest.json');
  const target = path.join(root, ...BOX1_OVERLAY.derivativePath.split('/'));
  for (const file of [manifestPath, target]) {
    let current = file;
    while (true) {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Box 1 overlay cannot use linked paths.');
      const parent = path.dirname(current);
      if (current === parent) break;
      current = parent;
    }
    if (path.resolve(await realpath(file)) !== path.resolve(file)) throw new Error('Box 1 overlay path resolution changed.');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.version !== BOX1_OVERLAY.version || manifest.componentId !== 'box-1'
    || manifest.role !== 'placement' || manifest.developmentOnly !== true || manifest.productionApproved !== false
    || manifest.publicationAuthorized !== false || manifest.geometryApproved !== false
    || manifest.original?.sha256 !== BOX1_OVERLAY.originalSha256
    || manifest.candidate?.sha256 !== BOX1_OVERLAY.candidateSha256
    || manifest.candidate?.decodedPixelSha256 !== BOX1_OVERLAY.candidatePixelSha256
    || manifest.candidate?.invariantPassed !== true || manifest.candidate?.visibleRgbaChanges !== 0
    || manifest.candidate?.alphaChanges !== 0 || manifest.candidate?.clearedHiddenRgbPixels !== 96750
    || manifest.derivative?.path !== BOX1_OVERLAY.derivativePath
    || manifest.derivative?.format !== 'webp' || manifest.derivative?.hasAlpha !== true
    || manifest.derivative?.width !== 1200 || !/^[a-f0-9]{64}$/.test(manifest.derivative.sha256)) {
    throw new Error('Box 1 overlay manifest is invalid.');
  }
  const bytes = await readFile(target);
  if (bytes.length !== manifest.derivative.bytes || sha(bytes) !== manifest.derivative.sha256) throw new Error('Box 1 overlay derivative integrity failed.');
  return bytes;
}
