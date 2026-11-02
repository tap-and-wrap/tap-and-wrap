import { deepFreeze } from './definitions.mjs';

export const GIFT_BOX_REQUEST_KIND = 'gift-box-v2';
export const GIFT_BOX_REQUEST_CONTRACT_VERSION = 'gift-box-request-v2.1';
// Positions are normalized against this illustrative scene, including the space
// beside the box. This coordinate system never establishes physical dimensions.
export const GIFT_BOX_REQUEST_COORDINATE_SYSTEM = 'normalized-scene';
export const GIFT_BOX_REQUEST_SCENE = deepFreeze({ x: -.05, y: -.03, width: 1.5, height: 1.12 });
