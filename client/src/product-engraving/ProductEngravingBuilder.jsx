import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CatalogDialog from '../components/CatalogDialog.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { authGeneration } from '../services/api.js';
import { commerceGet, commercePost, commerceError, money, uploadPrivateFile, uploadConfiguredFields, discardUploads } from '../commerce/api.js';
import ConfiguredFields, { validateConfiguredFields } from '../commerce/ConfiguredFields.jsx';
import VisualEngravingEditor from '../engraving/visual/VisualEngravingEditor.jsx';
import VisualDesignPreview from '../engraving/visual/VisualDesignPreview.jsx';
import { loadPrivateVisualAsset } from '../engraving/visual/private-assets.js';
import { emptyDesign } from '../engraving/visual/design.mjs';
import '../engraving/standalone-visual.css';
import './product-engraving.css';

export default function ProductEngravingBuilder(props) {
  const session = useSession(), cart = useCart();
  const scope = session.ready && cart.checkoutOwnerKey ? `${session.ownerKey}:${session.generation}:${cart.checkoutOwnerKey}` : '';
  if (!scope) return <CatalogDialog title="Personalize your product" onClose={props.onClose}><p role="status">Preparing your private session...</p></CatalogDialog>;
  return <Builder key={scope} {...props} ownerScope={scope} session={session} cart={cart}/>;
}
function Builder({ product, variantKey, quantity, fields, personalization, editId, onClose, ownerScope, session, cart }) {
  const config = product.productEngraving, surface = config.surface;
  const initial = { ...emptyDesign(), surface: { assetId: surface.id, aspectRatio: surface.width / surface.height } };
  const [design, setDesign] = useState(initial), [assets, setAssets] = useState({ [surface.id]: { approved: true, src: surface.src } });
  const [material, setMaterial] = useState(config.materials[0]), [placement, setPlacement] = useState(''), [values, setValues] = useState(personalization || {});
  const [selection, setSelection] = useState({ variantKey: variantKey || null, quantity }), [saved, setSaved] = useState(null), [revision, setRevision] = useState(0);
  const [step, setStep] = useState(0), [quote, setQuote] = useState(null), [ready, setReady] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(''), [added, setAdded] = useState(false), [orderId, setOrderId] = useState(null);
  const storageKey = `product-engraving-operation:${ownerScope}:${product._id}`, attempt = useRef(null), uploaded = useRef(new Map()), control = useRef(null), alive = useRef(true), designKey = useRef(crypto.randomUUID());
  const [uncertain, setUncertain] = useState(() => { try { return Boolean(JSON.parse(sessionStorage.getItem(storageKey))?.pending); } catch { return false; } });
  const current = () => alive.current && session.generation === authGeneration();
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); control.current = controller;
    if (editId) {
      setPending(true);
      void (async () => {
        const value = await commerceGet(`/product-engraving/cart/${editId}`, undefined, controller.signal), spec = value.specification;
        if (value.productId !== product._id || spec.configurationVersion !== config.version) throw Error('This approved product surface changed. Remove the old cart item and create a new design.');
        const nextAssets = { [surface.id]: { approved: true, src: surface.src } };
        const hydrated = await Promise.allSettled(spec.design.layers.filter(layer => layer.type === 'image').map(async layer => { nextAssets[layer.assetId] = await loadPrivateVisualAsset({ uploadId: layer.assetId, ownerScope, sessionOwnerKey: session.ownerKey, signal: controller.signal }); uploaded.current.set(layer.assetId, layer.assetId); }));
        if (!controller.signal.aborted && current()) { designKey.current = spec.designKey; setAssets(nextAssets); setDesign(spec.design); setMaterial(spec.material); setPlacement(spec.placement); setValues(value.personalization); setSelection({ variantKey: value.variantKey, quantity: value.quantity }); setSaved(value); if (hydrated.some(result => result.status === 'rejected')) setError('Some saved artwork is missing or expired. Select the affected layer, remove it and add a new image.'); setRevision(n => n + 1); }
      })().catch(caught => { if (!controller.signal.aborted && current()) setError(commerceError(caught)); }).finally(() => { if (!controller.signal.aborted && current()) setPending(false); });
    }
    return () => { alive.current = false; controller.abort(); };
  // This boundary is mounted once per verified owner, product and configuration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function remember(key, pending) { try { sessionStorage.setItem(storageKey, JSON.stringify({ key, pending })); } catch { /* Opaque recovery only. */ } }
  function specification(uploadIds = false) {
    const next = structuredClone(design);
    next.layers = next.layers.map((layer, index) => layer.type === 'image' ? { ...layer, assetId: uploadIds ? uploaded.current.get(layer.assetId) : /^[a-f0-9]{24}$/.test(layer.assetId) ? layer.assetId : (index + 1).toString(16).padStart(24, '0') } : layer);
    return { contractVersion: 'product-engraving-v1', designKey: designKey.current, configurationVersion: config.version, material, placement, design: next };
  }
  async function review() {
    setPending(true); setError('');
    try {
      if (!ready) throw Error('Add your text or image and wait for the complete preview.');
      const result = await commercePost('/product-engraving/quote', { productId: product._id, ...selection, specification: specification() }, { signal: control.current.signal });
      if (current()) { setQuote(result); setStep(2); }
    } catch (caught) { if (current()) setError(commerceError(caught)); } finally { if (current()) setPending(false); }
  }
  async function check() {
    setPending(true); setError('');
    try {
      let key = attempt.current?.operationKey; try { key ||= JSON.parse(sessionStorage.getItem(storageKey))?.key; } catch { /* Optional storage. */ }
      if (!key) throw Error('Review your cart before starting another design.');
      const result = await commerceGet(`/cart/operations/${key}`, undefined, control.current.signal);
      if (current()) { if (!result.applied) throw Error('This request is unconfirmed. Check again or retry the exact request from this open editor.'); setOrderId(result.alreadyOrdered || null); setAdded(true); setUncertain(false); remember(key, false); await cart.refresh(); }
    } catch (caught) { if (current()) setError(commerceError(caught)); } finally { if (current()) setPending(false); }
  }
  async function add() {
    setPending(true); setError(''); const created = [];
    try {
      if (!attempt.current) {
        if (!quote || !ready) throw Error('Review your complete design first.');
        const latest = await commercePost('/product-engraving/quote', { productId: product._id, ...selection, specification: specification() }, { signal: control.current.signal });
        if (latest.reviewFingerprint !== quote.reviewFingerprint) { setQuote(null); setStep(1); throw Error('The price or approved options changed. Review your design again.'); }
        for (const layer of design.layers.filter(layer => layer.type === 'image')) {
          if (!uploaded.current.has(layer.assetId)) uploaded.current.set(layer.assetId, await uploadPrivateFile(assets[layer.assetId].blob, { purpose: 'artwork', productId: product._id, fieldKey: 'product_engraving_artwork', designKey: designKey.current, ownerContext: cart.checkoutOwnerKey, signal: control.current.signal }, created));
        }
        const prepared = saved ? values : await uploadConfiguredFields(values, fields, { productId: product._id }, created);
        if (!current()) return;
        attempt.current = { kind: 'product', operationKey: crypto.randomUUID(), productId: product._id, ...selection, personalization: prepared, productEngraving: { ...specification(true), reviewFingerprint: quote.reviewFingerprint }, ...(saved ? { replaceLineId: editId, replaceFingerprint: saved.editFingerprint } : {}) };
      }
      remember(attempt.current.operationKey, true); setUncertain(true);
      const result = await cart.add(attempt.current);
      if (current()) { remember(attempt.current.operationKey, false); setOrderId(result.alreadyOrdered || null); setAdded(true); setUncertain(false); attempt.current = null; }
    } catch (caught) {
      if (current()) { setError(commerceError(caught)); if (caught.response?.status < 500 && ![408, 429].includes(caught.response.status) && caught.response.data?.error?.code && attempt.current) { remember(attempt.current.operationKey, false); attempt.current = null; setUncertain(false); setQuote(null); } }
      if (!attempt.current) { await discardUploads(created); for (const [key, id] of uploaded.current) if (created.includes(id)) uploaded.current.delete(key); }
    } finally { if (current()) setPending(false); }
  }
  return <CatalogDialog title={`Make ${product.name} yours`} onClose={onClose} className="product-engraving-dialog">
    {added ? <div className="sv-success" role="status"><h3>{orderId ? 'Your design is already ordered' : 'Your personalized product is in the cart'}</h3><Link className="button button-primary" to={orderId ? `/orders/${orderId}` : '/cart'} onClick={onClose}>View {orderId ? 'order' : 'cart'}</Link></div> : <>
      <nav className="sv-steps" aria-label="Product engraving steps">{['Your product', 'Your design', 'Review'].map((label, index) => <button type="button" key={label} disabled={pending || uncertain || index > step} aria-current={step === index ? 'step' : undefined} onClick={() => { setQuote(null); setStep(index); }}><span>{index + 1}</span>{label}</button>)}</nav>
      {uncertain && <section className="commerce-notice"><p>Your last add is unconfirmed. Check before starting another design.</p><button disabled={pending} onClick={check}>Check add status</button>{attempt.current && <button disabled={pending} onClick={add}>Retry same add</button>}<Link to="/cart">Review cart</Link></section>}
      <fieldset className="sv-builder" disabled={pending || uncertain} aria-busy={pending}><legend className="sr-only">Product engraving</legend>
        {step === 0 && <div className="sv-item-layout"><div><h3>{product.name}</h3><p>Design directly on the approved product image.</p><label>Material<select value={material} onChange={event => setMaterial(event.target.value)}>{config.materials.map(value => <option key={value}>{value}</option>)}</select></label><label>Position guidance<select value={placement} onChange={event => setPlacement(event.target.value)}><option value="">Choose freely</option>{config.placements.map(value => <option key={value}>{value}</option>)}</select></label>{!saved && <ConfiguredFields fields={fields} values={values} onChange={setValues}/>}<p>Your product options and quantity are retained.</p></div><VisualDesignPreview design={design} assets={assets} ownerScope={ownerScope}/></div>}
        <div hidden={step !== 1}><VisualEngravingEditor key={revision} ownerScope={ownerScope} initialDraft={{ ownerScope, design }} assets={assets} approvedFontIds={config.fontIds} surfaceControls={false} confirmReset onChange={(draft, nextAssets, readiness) => { setDesign(previous => JSON.stringify(previous) === JSON.stringify(draft.design) ? previous : draft.design); setAssets(previous => Object.keys(previous).length === Object.keys(nextAssets).length && Object.entries(previous).every(([id, asset]) => asset === nextAssets[id]) ? previous : nextAssets); setReady(readiness.ready); }}/></div>
        {step === 2 && <div className="sv-review-layout"><VisualDesignPreview design={design} assets={assets} ownerScope={ownerScope} label="Your complete product engraving"/><div><h3>Your finished design</h3><p>{material}{placement ? `, ${placement}` : ''}</p><dl><div><dt>Product, each</dt><dd>{money(quote?.basePricePiastres)}</dd></div><div><dt>Engraving, each</dt><dd>{money(quote?.surchargePiastres)}</dd></div><div><dt>Quantity</dt><dd>{selection.quantity}</dd></div><div><dt>Total</dt><dd>{money(quote?.totalPiastres)}</dd></div></dl><button type="button" onClick={() => { setQuote(null); setStep(1); }}>Edit Design</button></div></div>}
        <div className="sv-footer">{step > 0 && <button type="button" className="button button-secondary" onClick={() => { setQuote(null); setStep(step - 1); }}>Back</button>}{step === 0 ? <button type="button" className="button button-primary" disabled={Boolean(editId && !saved)} onClick={() => { const errors = validateConfiguredFields(fields, values); if (!saved && Object.keys(errors).length) setError(Object.values(errors)[0]); else { setError(''); setStep(1); } }}>Design your engraving</button> : step === 1 ? <button type="button" className="button button-primary" onClick={review}>Review your engraving</button> : <button type="button" className="button button-primary" disabled={!quote || pending} onClick={add}>{saved ? 'Update cart design' : 'Add to Cart'}</button>}</div>
      </fieldset>
    </>}{error && <p role="alert" className="sv-error">{error}</p>}{pending && <p role="status">Preparing your design securely...</p>}
  </CatalogDialog>;
}
