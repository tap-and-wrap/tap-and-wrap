import { deepFreeze } from './definitions.mjs';
// Dedicated exterior proofs. This registry never changes arrangement imagery or geometry.
export const STICKER_PROOF_VERSION = 'box-sticker-proof-v1';
const heart = (file, width = 1882) => ({ file, width, height: 836, surface: { x: .14, y: .36, width: .72, height: .46 } });
const round = (file, width = 1672, height = 941) => ({ file, width, height, surface: { x: .18, y: .43, width: .64, height: .32 } });
const pair = family => ({ left: heart(`${family}-left-sticker.webp`, family === 'box-4-6' ? 1881 : 1882), right: heart(`${family}-right-sticker.webp`, family === 'box-4-6' ? 1881 : 1882) });
export const STICKER_PROOFS = deepFreeze({
  'box-1': pair('box-1'),
  'box-2': { exterior: { file: 'box-2-sticker.webp', width: 1312, height: 1199, surface: { x: .22, y: .36, width: .56, height: .36 } } },
  'box-3': pair('box-3-5'), 'box-4': pair('box-4-6'), 'box-5': pair('box-3-5'), 'box-6': pair('box-4-6'),
  'box-7': { exterior: round('box-7-sticker.webp') }, 'box-8': { exterior: round('box-8-sticker.webp') },
  // Genuine nonopaque alpha verified against the owner-supplied original before inclusion.
  'box-9': { exterior: round('box-9-sticker.webp', 1670) },
  'box-10': { exterior: round('box-10-sticker.webp', 1619, 971) }, 'box-11': { exterior: round('box-11-sticker.webp') },
});
export const stickerProof = (boxId, view) => STICKER_PROOFS[boxId]?.[view];
export function defaultStickerPlacement(boxId, view = Object.keys(STICKER_PROOFS[boxId] || {})[0]) {
  const proof = stickerProof(boxId, view); if (!proof) return null;
  const s = proof.surface;
  return { version: STICKER_PROOF_VERSION, boxId, view, x: s.x + s.width / 2, y: s.y + s.height / 2, width: s.width * .65, height: s.height * .5 };
}
export function boundStickerPlacement(value) {
  const proof = stickerProof(value?.boxId, value?.view); if (!proof) throw Error('Choose a supported sticker view.');
  const s = proof.surface, clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const width = clamp(value.width, .06, s.width), height = clamp(value.height, .04, s.height);
  return { version: STICKER_PROOF_VERSION, boxId: value.boxId, view: value.view, width, height,
    x: clamp(value.x, s.x + width / 2, s.x + s.width - width / 2), y: clamp(value.y, s.y + height / 2, s.y + s.height - height / 2) };
}
export function validStickerPlacement(value) {
  if (!value || Object.keys(value).sort().join() !== ['version','boxId','view','x','y','width','height'].sort().join() || value.version !== STICKER_PROOF_VERSION || !stickerProof(value.boxId, value.view) || !['x','y','width','height'].every(key => Number.isFinite(value[key]))) return false;
  const bounded = boundStickerPlacement(value);
  return ['x','y','width','height'].every(key => Math.abs(bounded[key] - value[key]) < .0000001);
}
