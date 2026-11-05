import { ARTWORK_METRICS } from './artwork-metrics.mjs';
import { BOX_ARTWORK_DIMENSIONS } from './artwork-dimensions.mjs';

// A visual revision only: old saved designs retain their original framing.
export const FREE_PRESENTATION = 'gift-box-presentation-v1';
export function freePresentation(boxId) {
  const [sourceWidth, sourceHeight] = BOX_ARTWORK_DIMENSIONS[boxId] || [1, 1];
  const aspect = sourceWidth / sourceHeight;
  const [left, top, right, bottom] = ARTWORK_METRICS[boxId]?.visibleBounds || [0, 0, 1, 1];
  const visibleAspect = (right - left + 1) / (bottom - top + 1);
  const width = Math.min(.84, .8 * visibleAspect / aspect);
  const height = width * aspect / visibleAspect;
  return { aspect, box: { x: (1 - width) / 2, y: (.98 - height) / 2, width, height } };
}
