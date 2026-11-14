import { deepFreeze } from './definitions.mjs';
// Dedicated exterior proofs. This registry never changes arrangement imagery or geometry.
export const STICKER_PROOF_VERSION = 'box-sticker-proof-v1';
// Keep original default placement geometry; the inspected exterior face permits
// a wider movement area. Historical saved coordinates are never rewritten.
const heart = (file, width = 1882) => ({ file, width, height: 836, surface: { x: .14, y: .36, width: .72, height: .46 }, usableSurface: { x: .055, y: .31, width: .89, height: .54 } });
// These are side-wall photographs, not overhead circular faces. The lower
// shoulders follow the photographed wall and exclude the transparent corners.
const round = (file, width = 1672, height = 941) => ({ file, width, height, surface: { x: .18, y: .43, width: .64, height: .32 }, usableSurface: { x: .075, y: .34, width: .85, height: .53 }, face: [[.075,.34],[.925,.34],[.925,.77],[.84,.87],[.16,.87],[.075,.77]] });
const pair = family => ({ left: heart(`${family}-left-sticker.webp`, family === 'box-4-6' ? 1881 : 1882), right: heart(`${family}-right-sticker.webp`, family === 'box-4-6' ? 1881 : 1882) });
export const STICKER_PROOFS = deepFreeze({
  'box-1': pair('box-1'),
  'box-2': { exterior: { file: 'box-2-sticker.webp', width: 1312, height: 1199, surface: { x: .22, y: .36, width: .56, height: .36 }, usableSurface: { x: .18, y: .30, width: .64, height: .60 } } },
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
  const s = proof.usableSurface || proof.surface, clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rotation = (((value.rotation ?? 0) + 180) % 360 + 360) % 360 - 180, radians = rotation * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  let width = clamp(value.width, .06, s.width), height = clamp(value.height, .04, s.height);
  // Rotation is in physical proof pixels, not the non-square normalized space.
  const extent = () => ({ width: cos * width + sin * height * proof.height / proof.width, height: sin * width * proof.width / proof.height + cos * height });
  const rotated = extent(), scale = Math.min(1, s.width / rotated.width, s.height / rotated.height);
  width *= scale; height *= scale;
  const bounds = extent();
  let x = clamp(value.x, s.x + bounds.width / 2, s.x + s.width - bounds.width / 2), y = clamp(value.y, s.y + bounds.height / 2, s.y + s.height - bounds.height / 2);
  if (proof.face) {
    // Erode each convex face edge by the support of the rotated text rectangle.
    // Projection in proof pixels accounts for rotation and the image's aspect.
    const edges = proof.face.map(([ax,ay], i) => {
      const [bx,by] = proof.face[(i + 1) % proof.face.length];
      const dx = (bx-ax)*proof.width, dy = (by-ay)*proof.height, length = Math.hypot(dx,dy);
      return { nx:dy/length, ny:-dx/length, limit:(dy/length)*ax*proof.width-(dx/length)*ay*proof.height };
    });
    let px=x*proof.width, py=y*proof.height;
    for (let pass=0;pass<100;pass+=1) {
      let overflow=0;
      for (const {nx,ny,limit} of edges) {
        const support=Math.abs(nx*Math.cos(radians)+ny*Math.sin(radians))*width*proof.width/2+Math.abs(-nx*Math.sin(radians)+ny*Math.cos(radians))*height*proof.height/2;
        const excess=nx*px+ny*py+support-limit;
        if(excess>0){px-=nx*excess;py-=ny*excess;overflow=Math.max(overflow,excess);}
      }
      if(overflow<1e-10)break;
      if(pass===49){width*=.9;height*=.9;px=proof.width*.5;py=proof.height*.6;}
    }
    x=px/proof.width;y=py/proof.height;
  }
  return { version: STICKER_PROOF_VERSION, boxId: value.boxId, view: value.view, width, height,
    ...(Object.hasOwn(value, 'rotation') ? { rotation } : {}),
    x, y };
}
export function validStickerPlacement(value) {
  if (!value || Object.keys(value).sort().join() !== ['version','boxId','view','x','y','width','height', ...(Object.hasOwn(value, 'rotation') ? ['rotation'] : [])].sort().join() || value.version !== STICKER_PROOF_VERSION || !stickerProof(value.boxId, value.view) || !['x','y','width','height'].every(key => Number.isFinite(value[key])) || Object.hasOwn(value, 'rotation') && (!Number.isFinite(value.rotation) || Math.abs(value.rotation) > 180)) return false;
  const bounded = boundStickerPlacement(value);
  return ['x','y','width','height'].every(key => Math.abs(bounded[key] - value[key]) < .0000001);
}
