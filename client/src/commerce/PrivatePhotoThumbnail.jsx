import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from './CartContext.jsx';
import { api, authGeneration } from '../services/api.js';
import LoadingState from '../components/LoadingState.jsx';

export default function PrivatePhotoThumbnail({ lineId, index, label }) {
  const session = useSession(), cart = useCart();
  const scope = `${session.ownerKey}:${cart.checkoutOwnerKey}`;
  const [state, setState] = useState(null);
  useEffect(() => {
    const controller = new AbortController(), generation = authGeneration();
    let url;
    api.get(`/commerce/cart/items/${lineId}/gift-photos/${index}`, { responseType: 'blob', signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted || generation !== authGeneration()) return;
        if (!['image/jpeg','image/png','image/webp'].includes(result.data.type) || !result.data.size || result.data.size > 8388608) throw Error('Photo unavailable');
        url = URL.createObjectURL(result.data); setState({ scope, lineId, index, url });
      }).catch(() => { if (!controller.signal.aborted && generation === authGeneration()) setState({ scope, lineId, index, error: true }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [scope, lineId, index]);
  const current = state?.scope === scope && state.lineId === lineId && state.index === index ? state : null;
  return <div className="private-photo-thumbnail">{current?.url && !current.error
    ? <img src={current.url} alt={label} width="88" height="88" onError={() => setState(value => ({ ...value, error: true }))}/>
    : current?.error ? <span role="img" aria-label={`${label} unavailable`}><ImageOff size={20} aria-hidden="true"/>Unavailable</span>
      : <LoadingState kind="image" count={1} label={`Loading ${label}`}/>}</div>;
}
