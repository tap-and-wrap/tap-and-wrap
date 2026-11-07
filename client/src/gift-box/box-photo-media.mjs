import manifest from '../../../shared/gift-box/box-photos.v1.json';
import { configuredGiftBoxMedia } from './public-media-url.mjs';
export function boxPhotoUrl(componentId,role,width=960) {
  const entry=manifest.entries.find(item=>item.componentId===componentId&&item.role===role&&item.width===width);
  if(!entry)return null;
  if(import.meta.env.DEV)return `/__gift-box-photos/${manifest.releaseId}/${entry.file}`;
  const baseUrl=import.meta.env.VITE_GIFT_BOX_MEDIA_BASE_URL,releaseId=import.meta.env.VITE_GIFT_BOX_MEDIA_RELEASE;
  return configuredGiftBoxMedia({baseUrl,releaseId})?`${baseUrl.replace(/\/$/,'')}/${entry.key}`:null;
}
