import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { api, authGeneration } from '../services/api.js';
import { commerceGet, adminCommerceGet, commerceError } from '../commerce/api.js';
import VisualDesignPreview from '../engraving/visual/VisualDesignPreview.jsx';
import { validateDesign } from '../engraving/visual/design.mjs';
export default function SavedProductEngraving(props) {
  const session = useSession(), cart = useCart();
  const scope = session.ready && cart.checkoutOwnerKey ? `${session.ownerKey}:${session.generation}:${cart.checkoutOwnerKey}` : '';
  return scope ? <OwnedSavedProductEngraving key={scope} {...props} scope={scope}/> : null;
}
function OwnedSavedProductEngraving({ cartLineId, orderId, index, admin = false, scope }) {
  const [state, setState] = useState(null), [error, setError] = useState(''), [pending, setPending] = useState(false), controller = useRef(null), currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => () => controller.current?.abort(), [scope]);
  async function open() {
    controller.current?.abort(); const request = new AbortController(); controller.current = request; const generation = authGeneration(); setPending(true); setError('');
    try {
      const value = cartLineId ? await commerceGet(`/product-engraving/cart/${cartLineId}`, undefined, request.signal) : (await (admin ? adminCommerceGet : commerceGet)(`/orders/${orderId}/product-engraving/${index}`, undefined, request.signal)).snapshot;
      const design = validateDesign(value.specification.design), surface = value.configuration?.surface;
      if (!surface || surface.id !== design.surface.assetId) throw Error('The approved surface is unavailable. Contact the store to review this saved design.');
      const assets = { [surface.id]: { approved: true, src: surface.src } };
      await Promise.all(design.layers.filter(layer => layer.type === 'image').map(async layer => { const result = await api.get(admin ? `/admin/commerce/orders/${orderId}/files/${layer.assetId}` : `/commerce/uploads/${layer.assetId}/content`, { responseType: 'blob', signal: request.signal }); assets[layer.assetId] = { ownerScope: scope, blob: result.data }; }));
      if (!request.signal.aborted && generation === authGeneration() && scope === currentScope.current) setState({ design, assets, scope });
    } catch (caught) { if (!request.signal.aborted && generation === authGeneration() && scope === currentScope.current) setError(commerceError(caught)); } finally { if (!request.signal.aborted && generation === authGeneration() && scope === currentScope.current) setPending(false); }
  }
  function download(blob, index) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `engraving-artwork-${index + 1}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <div className="saved-visual-preview"><button type="button" disabled={pending} onClick={open}>{pending ? 'Opening saved product design...' : 'View saved product design'}</button>{state?.scope === scope && <><VisualDesignPreview design={state.design} assets={state.assets} ownerScope={scope}/>{state.design.layers.filter(layer => layer.type === 'image').map((layer, index) => <button type="button" key={layer.id} onClick={() => download(state.assets[layer.assetId].blob, index)}>Download original artwork {index + 1}</button>)}</>}{error && <p role="alert">{error}</p>}</div>;
}
