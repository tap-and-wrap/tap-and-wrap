// Display footprints only; these are not physical print dimensions or prices.
import { sceneY,verticalSceneScale } from './presentation.mjs';

export function photoPrintFootprint(aspectRatio, canvasAspect = 1, presentationVersion) {
  const scale=verticalSceneScale(presentationVersion);
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return { width:.12, height:.16/scale };
  const width = Math.min(.18, .18/scale * aspectRatio / canvasAspect);
  return { width, height:width * canvasAspect / aspectRatio };
}
export const defaultPhotoPosition = (index,version) => ({x:.72,y:sceneY(.22+index%4*.13,version),placementZone:'beside'});
