import { BOX_ARTWORK_DIMENSIONS } from './artwork-dimensions.mjs';

export const LEGACY_FREE_PRESENTATION = 'gift-box-presentation-v1';
export const FREE_PRESENTATION = 'gift-box-presentation-v2';
export const FREE_PRESENTATIONS = Object.freeze([LEGACY_FREE_PRESENTATION,FREE_PRESENTATION]);
export const isFreePresentation = version => FREE_PRESENTATIONS.includes(version);
export const verticalSceneScale = version => version === FREE_PRESENTATION ? 1.2 : 1;
export const sceneY = (y,version) => version === FREE_PRESENTATION ? (y+.1)/1.2 : y;
export function presentationAspect(boxId,version) {
  if (!isFreePresentation(version)) return 1;
  const [width,height]=BOX_ARTWORK_DIMENSIONS[boxId] || [1,1];
  return width/height/verticalSceneScale(version);
}
export const ribbonFootprint = version => ({width:.23,height:.16/verticalSceneScale(version)});
