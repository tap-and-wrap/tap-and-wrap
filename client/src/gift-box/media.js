import { ASSET_ISSUES, ASSET_VERSION, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
// No production URL fallback. The allowlisted Vite middleware exists only in serve mode.
export function localArtwork(id, role, width = 320) {
  if (!import.meta.env.DEV) return null;
  const source = getFixedComponent(id)?.[`${role}Asset`];
  if (!source || ASSET_ISSUES.some(issue => issue.source === source && issue.blocksDevelopmentCopy)) return null;
  return `/__gift-box-local/${ASSET_VERSION}/${role === 'placement' ? 1200 : width}/${source}`;
}
