import { GIFT_BOX_MEDIA } from '../../../shared/gift-box/public-media.v1.mjs';

const LOOKUP = new Map(GIFT_BOX_MEDIA.entries.map(item => [`${item.componentId}:${item.role}:${item.width}`, item]));

export function validGiftBoxMediaBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('https://')) return false;
  try {
    const url = new URL(baseUrl);
    // A dedicated HTTPS origin: never ship credentials, internal hosts, query strings or a path prefix.
    return url.protocol === 'https:' && url.hostname.includes('.') && !url.hostname.endsWith('.local')
      && url.hostname !== 'localhost' && url.port === '' && url.username === '' && url.password === ''
      && url.pathname === '/' && url.search === '' && url.hash === '' && url.origin === baseUrl.replace(/\/$/, '');
  } catch { return false; }
}

export function configuredGiftBoxMedia({ baseUrl, releaseId } = {}) {
  return releaseId === GIFT_BOX_MEDIA.releaseId && validGiftBoxMediaBaseUrl(baseUrl);
}

export function publicGiftBoxMediaUrl({ baseUrl, releaseId, componentId, role, width = 320 } = {}) {
  if (!configuredGiftBoxMedia({ baseUrl, releaseId })) return null;
  if (!['selection', 'placement', 'bow'].includes(role)) return null;
  const resolvedWidth = role === 'placement' ? 1200 : role === 'bow' ? 1600 : width;
  const entry = LOOKUP.get(`${componentId}:${role}:${resolvedWidth}`);
  if (!entry) return null;
  return `${baseUrl.replace(/\/$/, '')}/${entry.key}`;
}
