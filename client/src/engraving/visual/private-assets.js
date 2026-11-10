import { api, assertAuthGeneration, authGeneration } from '../../services/api.js';
import { sessionOwner, sessionSnapshot, subscribeSession } from '../../auth/session.js';

/** Explicit owner-authorized read only. Never accepts storage keys or signed URLs. */
export async function loadPrivateVisualAsset({ uploadId, ownerScope, sessionOwnerKey, signal }) {
  const generation = authGeneration();
  function assertOwner() {
    assertAuthGeneration(generation);
    if (!ownerScope || sessionSnapshot().phase !== 'ready' || sessionOwner() !== sessionOwnerKey) throw new Error('Your private shopping session changed. Open this design again.');
  }
  assertOwner();
  if (!/^[a-f0-9]{24}$/i.test(uploadId)) throw new Error('This private image is unavailable.');
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const unsubscribe = subscribeSession(() => { if (generation !== authGeneration()) abort(); });
  try {
    const result = await api.get(`/commerce/uploads/${uploadId}/content`, { responseType: 'blob', signal: controller.signal, timeout: 15000 });
    assertOwner();
    if (controller.signal.aborted) throw new DOMException('Image loading cancelled', 'AbortError');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(result.data.type) || !result.data.size || result.data.size > 8388608) throw new Error('This private image is unavailable.');
    return { ownerScope, blob: result.data };
  } finally { unsubscribe(); signal?.removeEventListener('abort', abort); }
}
