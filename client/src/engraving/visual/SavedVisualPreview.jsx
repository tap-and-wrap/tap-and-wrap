import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/SessionProvider.jsx';
import { useCart } from '../../commerce/CartContext.jsx';
import { api, authGeneration } from '../../services/api.js';
import { commerceGet, adminCommerceGet, commerceError } from '../../commerce/api.js';
import { validateDesign } from './design.mjs';
import VisualDesignPreview from './VisualDesignPreview.jsx';

/** Private originals load only on an explicit View action, including for admins. */
export default function SavedVisualPreview({ cartLineId, orderId, itemKey, admin = false }) {
  const session = useSession(), cart = useCart(), ownerScope = `${session.ownerKey}:${cart.checkoutOwnerKey}`;
  const [state, setState] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const pending = useRef(null), currentScope = useRef(ownerScope); currentScope.current = ownerScope;
  useEffect(() => () => pending.current?.abort(), [ownerScope]);
  async function open() {
    pending.current?.abort(); const controller = new AbortController(), generation = authGeneration(); pending.current = controller; setLoading(true); setError('');
    try {
      const value = cartLineId ? (await commerceGet(`/engraving/cart/${cartLineId}`, undefined, controller.signal)).specification : (await (admin ? adminCommerceGet : commerceGet)(`/orders/${orderId}/engraving-files`, undefined, controller.signal)).items.find(item => item.itemKey === itemKey);
      const design = validateDesign(value.design), assets = {}, ids = [design.surface.assetId, ...design.layers.filter(layer => layer.type === 'image').map(layer => layer.assetId)];
      await Promise.all(ids.map(async id => {
        const path = admin ? `/admin/commerce/orders/${orderId}/files/${id}` : `/commerce/uploads/${id}/content`;
        const result = await api.get(path, { responseType: 'blob', signal: controller.signal }); assets[id] = { ownerScope, blob: result.data };
      }));
      if (!controller.signal.aborted && generation === authGeneration() && currentScope.current === ownerScope) setState({ design, assets, ownerScope });
    } catch (caught) { if (!controller.signal.aborted && generation === authGeneration() && currentScope.current === ownerScope) setError(commerceError(caught)); }
    finally { if (!controller.signal.aborted && generation === authGeneration() && currentScope.current === ownerScope) setLoading(false); }
  }
  return <div className="saved-visual-preview"><button type="button" className="button button-secondary" disabled={loading} onClick={open}>{loading ? 'Opening private design...' : 'View saved design'}</button>{state?.ownerScope === ownerScope && <VisualDesignPreview design={state.design} assets={state.assets} ownerScope={ownerScope}/>} {error && <p role="alert">{error}</p>}</div>;
}
