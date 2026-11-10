import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CatalogDialog from '../components/CatalogDialog.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { authGeneration } from '../services/api.js';
import { commerceGet, commercePost, commerceError, money, uploadConfiguredFields, discardUploads } from '../commerce/api.js';
import ConfiguredFields, { validateConfiguredFields } from '../commerce/ConfiguredFields.jsx';
import { FONT_REGISTRY } from '../../../shared/engraving/definitions.mjs';
import LetteringControls, { appearanceHex } from '../engraving/LetteringControls.jsx';
import './product-engraving.css';
const LegacyBuilder = lazy(() => import('./LegacyProductEngravingBuilder.jsx'));
export default function ProductEngravingBuilder(props) {
  const session = useSession(), cart = useCart();
  const scope = session.ready && cart.checkoutOwnerKey ? `${session.ownerKey}:${session.generation}:${cart.checkoutOwnerKey}` : '';
  return scope ? <OwnedBuilder key={`${scope}:${props.editId || 'new'}`} {...props} ownerScope={scope} session={session} cart={cart}/> : <CatalogDialog title="Personalize your product" onClose={props.onClose}><p role="status">Preparing your private session...</p></CatalogDialog>;
}
function OwnedBuilder(props) {
  const { product, editId, onClose, session } = props;
  const [saved, setSaved] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    if (!editId) return;
    const controller = new AbortController(), generation = authGeneration();
    commerceGet(`/product-engraving/cart/${editId}`, undefined, controller.signal).then(value => { if (controller.signal.aborted || generation !== authGeneration()) return; if (value.productId !== product._id) throw Error('This design belongs to another product.'); setSaved(value); }).catch(caught => { if (!controller.signal.aborted && generation === authGeneration()) setError(commerceError(caught)); });
    return () => controller.abort();
  }, [editId, product._id, session.generation]);
  if (editId && !saved) return <CatalogDialog title="Open your engraving" onClose={onClose}>{error ? <p role="alert">{error}</p> : <p role="status">Opening your saved design...</p>}</CatalogDialog>;
  if (saved?.specification.contractVersion === 'product-engraving-v1') return <Suspense fallback={<p role="status">Opening your visual design...</p>}><LegacyBuilder {...props}/></Suspense>;
  return <TextBuilder {...props} saved={saved}/>;
}
export function ProductTextProof({ text, fontId, colorId }) {
  return <div className={`product-text-proof ${colorId === 'white' ? 'is-dark' : ''}`} dir="auto" aria-label="Your engraving text proof" style={{ fontFamily: `"${FONT_REGISTRY.find(font => font.id === fontId)?.family}"`, color: appearanceHex[colorId] }}>{text || 'With love'}</div>;
}
function TextBuilder({ product, variantKey, quantity, fields, personalization, editId, onClose, ownerScope, session, cart, saved }) {
  const config = product.productEngraving, spec = saved?.specification, textInputId = useId();
  const [text, setText] = useState(spec?.text || ''), [fontId, setFont] = useState(spec?.fontId || config.fontIds.find(id => FONT_REGISTRY.find(font => font.id === id)?.language === 'en') || config.fontIds[0]), [colorId, setColor] = useState(spec?.colorId || config.colorIds?.[0] || 'black'), [material, setMaterial] = useState(spec?.material || config.materials[0]);
  const [configuredPrice, setConfiguredPrice] = useState(null);
  const [values, setValues] = useState(saved?.personalization || personalization || {}), [quote, setQuote] = useState(null), [error, setError] = useState(''), [pending, setPending] = useState(false), [added, setAdded] = useState(false), [orderId, setOrderId] = useState(null);
  const selection = { variantKey: saved ? saved.variantKey : variantKey || null, quantity: saved?.quantity || quantity };
  const designKey = useRef(spec?.designKey || crypto.randomUUID()), alive = useRef(false), control = useRef(null), attempt = useRef(null), alertRef = useRef(null);
  const storageKey = `product-engraving-operation:${ownerScope}:${product._id}`;
  const [uncertain, setUncertain] = useState(() => { try { return Boolean(JSON.parse(sessionStorage.getItem(storageKey))?.pending); } catch { return false; } });
  const current = () => alive.current && session.generation === authGeneration();
  const specification = { contractVersion: 'product-engraving-v2', designKey: designKey.current, configurationVersion: config.version, material, text, fontId, colorId };
  const requestKey = JSON.stringify({ productId: product._id, ...selection, specification });
  useEffect(() => { alive.current = true; control.current = new AbortController(); const generation = authGeneration(); commerceGet('/product-engraving/price', undefined, control.current.signal).then(value => { if (alive.current && generation === authGeneration()) setConfiguredPrice(value.pricePiastres); }).catch(caught => { if (alive.current && generation === authGeneration() && !control.current.signal.aborted) setError(commerceError(caught)); }); return () => { alive.current = false; control.current.abort(); }; }, []);
  useEffect(() => { if (error) { alertRef.current?.focus(); alertRef.current?.scrollIntoView({ block: 'nearest' }); } }, [error]);
  useEffect(() => {
    setQuote(null);
    if (!text.trim() || uncertain || added) return;
    const controller = new AbortController(), generation = authGeneration();
    const timer = setTimeout(() => { commercePost('/product-engraving/quote', JSON.parse(requestKey), { signal: controller.signal }).then(value => { if (!controller.signal.aborted && generation === authGeneration()) { setQuote(value); setError(''); } }).catch(caught => { if (!controller.signal.aborted && generation === authGeneration()) setError(commerceError(caught)); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, text, uncertain, added]);
  function change(patch) {
    if (patch.fontId) setFont(patch.fontId);
    if (patch.color) setColor(patch.color);
    setError('');
  }
  function remember(key, value) { try { sessionStorage.setItem(storageKey, JSON.stringify({ key, pending: value })); } catch { /* Opaque recovery only. */ } }
  async function check() {
    setPending(true); setError('');
    try {
      let key = attempt.current?.operationKey; try { key ||= JSON.parse(sessionStorage.getItem(storageKey))?.key; } catch { /* Optional storage. */ }
      if (!key) throw Error('Review your cart before starting another design.');
      const result = await commerceGet(`/cart/operations/${key}`, undefined, control.current.signal);
      if (current()) { if (!result.applied) throw Error('This request is unconfirmed. Check again or retry the exact request from this open editor.'); remember(key, false); setOrderId(result.alreadyOrdered || null); setAdded(true); setUncertain(false); await cart.refresh(); }
    } catch (caught) { if (current()) setError(commerceError(caught)); } finally { if (current()) setPending(false); }
  }
  async function add() {
    setPending(true); setError(''); const created = [];
    try {
      if (!attempt.current) {
        if (spec && spec.configurationVersion !== config.version) throw Error('The approved engraving setup changed. Start a new design.');
        if (!text.trim()) throw Error('Enter your engraving text.');
        const problems = validateConfiguredFields(fields, values); if (!saved && Object.keys(problems).length) throw Error(Object.values(problems)[0]);
        if (!quote) throw Error('Wait for your server-approved total before adding this design.');
        const latest = await commercePost('/product-engraving/quote', JSON.parse(requestKey), { signal: control.current.signal });
        if (!current()) return;
        if (latest.reviewFingerprint !== quote.reviewFingerprint) { setQuote(latest); throw Error('The price or approved options changed. Review the updated total and add again.'); }
        const prepared = saved ? values : await uploadConfiguredFields(values, fields, { productId: product._id }, created);
        if (!current()) return;
        attempt.current = { kind: 'product', operationKey: crypto.randomUUID(), productId: product._id, ...selection, personalization: prepared, productEngraving: { ...specification, reviewFingerprint: quote.reviewFingerprint }, ...(saved ? { replaceLineId: editId, replaceFingerprint: saved.editFingerprint } : {}) };
      }
      remember(attempt.current.operationKey, true); setUncertain(true);
      const result = await cart.add(attempt.current);
      if (current()) { remember(attempt.current.operationKey, false); setOrderId(result.alreadyOrdered || null); setAdded(true); setUncertain(false); attempt.current = null; }
    } catch (caught) {
      if (current()) { setError(commerceError(caught)); if (caught.response?.status < 500 && ![408, 429].includes(caught.response.status) && caught.response.data?.error?.code && attempt.current) { remember(attempt.current.operationKey, false); attempt.current = null; setUncertain(false); setQuote(null); } }
      if (!attempt.current && current()) await discardUploads(created);
    } finally { if (current()) setPending(false); }
  }
  return <CatalogDialog title={`Make ${product.name} yours`} onClose={onClose} className="product-text-dialog">
    {error && <p ref={alertRef} tabIndex={-1} className="sv-error" role="alert">{error}</p>}
    {added ? <div role="status"><h3>{orderId ? 'Your design is already ordered' : 'Your personalized product is in the cart'}</h3><Link className="button button-primary" to={orderId ? `/orders/${orderId}` : '/cart'} onClick={onClose}>View {orderId ? 'order' : 'cart'}</Link></div> : <>
      {uncertain && <section className="commerce-notice"><p>Your last add is unconfirmed. Check before starting another design.</p><button disabled={pending} onClick={check}>Check add status</button>{attempt.current && <button disabled={pending} onClick={add}>Retry same add</button>}<Link to="/cart">Review cart</Link></section>}
      <fieldset className="product-text-form" disabled={pending || uncertain}><legend className="sr-only">Personalize your engraving</legend>
        <label htmlFor={textInputId}>Engraving text</label><textarea id={textInputId} dir="auto" rows={2} maxLength={500} value={text} onChange={event => { const next = event.target.value; setText(next); if (/\p{Script=Arabic}/u.test(next) && FONT_REGISTRY.find(font => font.id === fontId)?.language !== 'ar') { const arabic = config.fontIds.find(id => FONT_REGISTRY.find(font => font.id === id)?.language === 'ar'); if (arabic) setFont(arabic); } }}/>
        <ProductTextProof text={text} fontId={fontId} colorId={colorId}/>
        <LetteringControls text={text} fontId={fontId} color={colorId} fontIds={config.fontIds} colorIds={config.colorIds} onChange={change}/>
        {config.materials.length > 1 && <label>Material<select value={material} onChange={event => setMaterial(event.target.value)}>{config.materials.map(value => <option key={value}>{value}</option>)}</select></label>}
        {!saved && <ConfiguredFields fields={fields} values={values} onChange={setValues}/>}
        {saved && fields.length > 0 && <p>Your saved product options and personal files are retained.</p>}
        <dl className="product-text-totals"><div><dt>Product, each</dt><dd>{money(quote?.basePricePiastres ?? product.variants?.find(v => v.key === selection.variantKey)?.pricePiastres ?? product.pricePiastres)}</dd></div><div><dt>Engraving, each</dt><dd>{quote ? money(quote.surchargePiastres) : configuredPrice !== null ? money(configuredPrice) : 'Opening price...'}</dd></div><div><dt>Total ({selection.quantity})</dt><dd>{quote ? money(quote.totalPiastres) : configuredPrice !== null ? money(((product.variants?.find(v => v.key === selection.variantKey)?.pricePiastres ?? product.pricePiastres) + configuredPrice) * selection.quantity) : 'Opening total...'}</dd></div></dl>
        <button type="button" className="button button-primary" disabled={Boolean(text.trim() && !quote)} onClick={add}>{pending ? 'Adding securely...' : saved ? 'Update Cart' : 'Add to Cart'}</button>
      </fieldset>
    </>}
  </CatalogDialog>;
}
