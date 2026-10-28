import { deepFreeze } from './definitions.mjs';

// Direct commerce has its own contract; it is never a ServiceRequest payload.
export const GIFT_BOX_COMMERCE_KIND = 'gift_box_v2';
export const GIFT_BOX_COMMERCE_CONTRACT_VERSION = 'gift-box-commerce-v1';
export const GIFT_BOX_CONFIGURATION_IDENTITY_VERSION = 'gift-box-configuration-v1';
export const GIFT_BOX_COMMERCE_COORDINATE_SYSTEM = 'normalized-scene';
// Supported visual reference only. No draft polygons, dimensions or approvals
// are imported into commerce by declaring this metadata version.
export const GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION = 'gift-box-photo-study-2026-10-28.1';
export const GIFT_BOX_COMMERCE_SCENE = deepFreeze({ x: -.05, y: -.03, width: 1.5, height: 1.12 });
