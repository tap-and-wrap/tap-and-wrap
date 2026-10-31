import { ASSET_ISSUES, ASSET_VERSION, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { BOX1_OVERLAY_URL } from '../../../shared/gift-box/box1-overlay.mjs';
// No production URL fallback. The allowlisted Vite middleware exists only in serve mode.
export function localArtwork(id, role, width = 320) {
  if (!import.meta.env.DEV) return null;
  // Corrected visible-identical Box 1 artwork is for the local review canvas only.
  // The original 99-file source remains blocked; physical geometry is unapproved.
  if (id === 'box-1' && role === 'placement') return BOX1_OVERLAY_URL;
  const source = getFixedComponent(id)?.[`${role}Asset`];
  if (!source || ASSET_ISSUES.some(issue => issue.source === source && issue.blocksDevelopmentCopy)) return null;
  return `/__gift-box-local/${ASSET_VERSION}/${role === 'placement' ? 1200 : width}/${source}`;
}
