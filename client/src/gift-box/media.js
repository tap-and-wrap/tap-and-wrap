import { ASSET_ISSUES, ASSET_VERSION, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { BOX1_OVERLAY_URL } from '../../../shared/gift-box/box1-overlay.mjs';
import { publicGiftBoxMediaUrl } from './public-media-url.mjs';

// Local Vite middleware remains the development source. Production images require
// an explicit version-matched HTTPS media origin; no silent fallback or DB access.
export function localArtwork(id, role, width = 320) {
  if (!import.meta.env.DEV) return publicGiftBoxMediaUrl({
    baseUrl: import.meta.env.VITE_GIFT_BOX_MEDIA_BASE_URL,
    releaseId: import.meta.env.VITE_GIFT_BOX_MEDIA_RELEASE,
    componentId: id, role, width,
  });
  // Corrected Box 1 local overlay stays independent of the original 99-image manifest.
  if (id === 'box-1' && role === 'placement') return BOX1_OVERLAY_URL;
  const source = getFixedComponent(id)?.[`${role}Asset`];
  if (!source || ASSET_ISSUES.some(issue => issue.source === source && issue.blocksDevelopmentCopy)) return null;
  return `/__gift-box-local/${ASSET_VERSION}/${role === 'placement' ? 1200 : width}/${source}`;
}
