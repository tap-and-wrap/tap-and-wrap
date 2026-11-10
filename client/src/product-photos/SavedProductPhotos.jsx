import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/SessionProvider.jsx';
import { api, authGeneration } from '../services/api.js';
import { commerceError } from '../commerce/api.js';
import './product-photos.css';
export default function SavedProductPhotos(props) {
  const session = useSession();
  return session.ready ? <OwnedPhotos key={`${session.ownerKey}:${session.generation}`} {...props}/> : null;
}
function OwnedPhotos({ purchase, values, orderId, admin = false }) {
  const [photos, setPhotos] = useState([]), [error, setError] = useState(''), [pending, setPending] = useState(false), controller = useRef(null), generation = useRef(authGeneration());
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => photos.forEach(photo => URL.revokeObjectURL(photo.url)), [photos]);
  async function view() {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setPending(true); setError('');
    const opened = [];
    try {
      const entries = purchase.contractVersion === 'product-photos-v2' ? (values?.[purchase.collectionKey] || []).map((id, index) => ({ id, key: `collection-${index}`, label: `Personal photo ${index + 1}` })) : (purchase.slots || []).map(slot => ({ ...slot, id: values?.[slot.key]?.[0] }));
      for (const slot of entries) {
        const id = slot.id; if (!/^[a-f0-9]{24}$/i.test(id || '')) throw Error('A photo is missing. Edit the item to replace it.');
        const result = await api.get(admin ? `/admin/commerce/orders/${orderId}/files/${id}` : `/commerce/uploads/${id}/content`, { responseType: 'blob', signal: abort.signal });
        opened.push({ ...slot, url: URL.createObjectURL(result.data), type: result.data.type });
      }
      if (!abort.signal.aborted && generation.current === authGeneration()) setPhotos(opened); else opened.forEach(photo => URL.revokeObjectURL(photo.url));
    } catch (caught) { opened.forEach(photo => URL.revokeObjectURL(photo.url)); if (!abort.signal.aborted && generation.current === authGeneration()) setError(commerceError(caught)); }
    finally { if (!abort.signal.aborted && generation.current === authGeneration()) setPending(false); }
  }
  return <div className="saved-product-photos"><p>{purchase.mode === 'photos' ? 'Ready-made, with customer photos' : 'Ready-made, no personal photos'}</p>{purchase.mode === 'photos' && <button type="button" disabled={pending} onClick={view}>{pending ? 'Opening private photos...' : 'View personal photos'}</button>}{photos.map((photo, index) => <figure key={photo.key}><img src={photo.url} alt={photo.label}/><figcaption>{index + 1}. {photo.label}{photo.instructions && <p>{photo.instructions}</p>}<a href={photo.url} download={`personal-photo-${index + 1}.${photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'}`}>Download original photo {index + 1}</a></figcaption></figure>)}{error && <p role="alert">{error}</p>}</div>;
}
