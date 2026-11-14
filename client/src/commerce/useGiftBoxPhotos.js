import { useEffect, useState } from 'react';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from './CartContext.jsx';
import { api, authGeneration } from '../services/api.js';
import { mapUploads } from './upload-batch.mjs';

export default function useGiftBoxPhotos(lineId, count) {
  const session = useSession(), cart = useCart();
  const scope = `${session.ownerKey}:${cart.checkoutOwnerKey}:${lineId}:${count}`;
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!lineId || !count || !session.ready || !cart.checkoutOwnerKey) return;
    const controller = new AbortController(), generation = authGeneration(), urls = [];
    const current = () => !controller.signal.aborted && generation === authGeneration();
    void mapUploads(Array.from({ length: Math.min(48, count) }, (_, index) => index), async index => {
      let photo;
      try {
        const result = await api.get(`/commerce/cart/items/${lineId}/gift-photos/${index}`, { responseType: 'blob', signal: controller.signal });
        if (!current()) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(result.data.type) || !result.data.size || result.data.size > 8388608) throw Error('Photo unavailable');
        const url = URL.createObjectURL(result.data); urls.push(url); photo = { url };
      } catch { photo = { error: true }; }
      if (current()) setState(previous => ({ scope, photos: { ...(previous?.scope === scope ? previous.photos : {}), [index]: photo } }));
    }, { signal: controller.signal }).catch(() => {});
    return () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [scope, session.ready, cart.checkoutOwnerKey, lineId, count]);
  return state?.scope === scope ? state.photos : {};
}
