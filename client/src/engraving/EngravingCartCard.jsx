import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider.jsx';
import { api, authGeneration } from '../services/api.js';
import { commerceGet, money } from '../commerce/api.js';
import { DesignPreview } from './StudioControls.jsx';
import EngravingSummary from './EngravingSummary.jsx';

function PrivateVisuals({ item, owner }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    const controller = new AbortController(), generation = authGeneration(), urls = [];
    if (!item.valid) return () => controller.abort();
    async function load() {
      try {
        const { specification } = await commerceGet(`/engraving/cart/${item.id}`, undefined, controller.signal);
        const result = {};
        for (const [role, id] of [['item', specification.itemPhotoUploadId], ['artwork', specification.content.artworkUploadId]]) {
          if (!id) continue;
          const response = await api.get(`/commerce/uploads/${id}/content`, { responseType: 'blob', signal: controller.signal });
          if (controller.signal.aborted || generation !== authGeneration()) return;
          const url = URL.createObjectURL(response.data); urls.push(url); result[role] = url;
        }
        if (!controller.signal.aborted && generation === authGeneration()) setState({ ...result, owner });
      } catch { if (!controller.signal.aborted && generation === authGeneration()) setState({ error: true, owner }); }
    }
    void load();
    return () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [item, owner]);
  const current = state?.owner === owner ? state : null;
  return <div className="studio-cart-visuals"><div className="studio-cart-photo">{current?.item ? <img src={current.item} alt="Your private item reference"/> : <span>{current?.error ? 'Photo unavailable · edit to replace' : 'Private item photo'}</span>}</div><DesignPreview content={item.engraving?.content} appearance={item.engraving?.requestedAppearance} artworkUrl={current?.artwork} compact/>{current?.error&&<p role="status">Private images could not load. Edit this engraving to check or replace them.</p>}</div>;
}
export default function EngravingCartCard({ item, pending, remove }) {
  const session = useSession();
  return <article className="commerce-cart-item commerce-engraving-cart-item studio-cart-card"><PrivateVisuals key={`${session.ownerKey}:${item.id}`} item={item} owner={session.ownerKey}/><div className="commerce-cart-item-content"><header className="studio-cart-heading"><div><p className="eyebrow">Your engraving request</p><h2>{item.name}</h2></div><strong>{item.valid ? money(item.lineTotalPiastres) : 'Review required'}</strong></header><EngravingSummary engraving={item.engraving} preview={false}/>
    {!item.valid&&<p role="alert">{item.error}</p>}{item.attachments?.replacementRequired&&<p className="form-error" role="alert">Replace expired images before ordering.</p>}
    <p className="studio-cart-journey">Request → Send item → Inspection & design → Payment</p><p className="studio-microcopy">Not yet approved for engraving. Inspection and your acceptance come first.</p>
    <div className="studio-edit-actions"><Link to={`/customize/laser-engraving?edit=${item.id}`}>Edit engraving / replace images</Link><button type="button" className="commerce-link-button" disabled={pending} onClick={()=>remove(item.id).catch(()=>{})}>Remove {item.name}</button></div>
    <details className="studio-private-details"><summary>Privacy & file details</summary><p>Your files are private and owner-bound. Adding to cart does not extend their lifetime.</p>{item.attachments?.expiresAt&&<p>Replace or order before {new Date(item.attachments.expiresAt).toLocaleString()}.</p>}</details>
  </div></article>;
}
