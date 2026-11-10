import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { authGeneration } from '../services/api.js';
import { commerceGet, commerceError, uploadConfiguredFields, discardUploads } from '../commerce/api.js';
import { loadPrivateVisualAsset } from '../engraving/visual/private-assets.js';
import ConfiguredFields, { validateConfiguredFields } from '../commerce/ConfiguredFields.jsx';
import CustomerPhotoCollection from './CustomerPhotoCollection.jsx';
import { CUSTOMER_PHOTOS_KEY, legacyPhotoFields, optionalPhotoFields } from '../../../shared/product-personalization.mjs';
import './product-photos.css';
export default function ProductPhotoPurchase(props) {
  const session = useSession(), cart = useCart();
  const scope = session.ready && cart.checkoutOwnerKey ? `${session.ownerKey}:${session.generation}:${cart.checkoutOwnerKey}` : '';
  return scope ? <OwnedPurchase key={`${scope}:${props.editId || 'new'}`} {...props} scope={scope} session={session} cart={cart}/> : <p role="status">Preparing your photo choices...</p>;
}
function OwnedPurchase({ product, variantKey, quantity, baseFields, baseValues, editId, onMode, onPhotoMode, onHydrate, scope, session, cart }) {
  const collection = optionalPhotoFields(product.personalization), [mode, setMode] = useState('as_is'), [values, setValues] = useState({}), [saved, setSaved] = useState(null);
  const [pending, setPending] = useState(Boolean(editId)), [error, setError] = useState(''), [errors, setErrors] = useState({}), [success, setSuccess] = useState(false), [acceptedOrder, setAcceptedOrder] = useState(null);
  const controller = useRef(null), alive = useRef(true), cache = useRef(new Map()), request = useRef(null);
  const storageKey = `tw-photo-operation:${scope}:${product._id}:${editId || 'new'}`;
  const [uncertain, setUncertain] = useState(() => { try { return Boolean(JSON.parse(sessionStorage.getItem(storageKey))?.pending); } catch { return false; } });
  const active = () => alive.current && session.generation === authGeneration();
  const legacy = saved?.line.photoSelection.contractVersion === 'product-photos-v1';
  const photoFields = legacy ? legacyPhotoFields(product.personalization) : collection;
  const definitions = [...baseFields, ...(mode === 'photos' ? photoFields : [])];
  const otherValues = saved ? values : baseValues;
  const otherCount = baseFields.filter(field => field.type === 'image').reduce((sum, field) => sum + (otherValues[field.key]?.length || 0), 0);
  const maximum = Math.max(0, Math.min(collection[0]?.maxFiles || 10, 10 - otherCount));
  const photos = legacy ? Object.entries(values).filter(([key, value]) => !baseFields.some(field => field.key === key) && Array.isArray(value)).flatMap(([, value]) => value) : values[CUSTOMER_PHOTOS_KEY] || [];

  useEffect(() => { onPhotoMode(mode === 'photos' || pending || uncertain); return () => onPhotoMode(false); }, [mode, pending, uncertain, onPhotoMode]);
  useEffect(() => { onMode(true); return () => onMode(false); }, [onMode]);
  useEffect(() => {
    alive.current = true; const abort = new AbortController(); controller.current = abort;
    if (editId) void (async () => {
      const data = await commerceGet(`/product-photos/cart/${editId}`, undefined, abort.signal), next = {};
      if (String(data.line.productId) !== product._id) throw Error('This item belongs to another product.');
      const previous = data.line.photoSelection.contractVersion === 'product-photos-v1';
      const savedPhotos = previous ? Object.entries(data.line.personalization).filter(([key, value]) => Array.isArray(value) && !baseFields.some(field => field.key === key)).map(([key]) => ({ key, label: 'Saved photo', type: 'image' })) : collection;
      const fields = [...baseFields, ...savedPhotos]; let missing = false;
      for (const field of fields) {
        const value = data.line.personalization[field.key];
        if (field.type !== 'image') { if (value !== undefined) next[field.key] = value; continue; }
        next[field.key] = [];
        for (const id of value || []) {
          try { const asset = await loadPrivateVisualAsset({ uploadId: id, ownerScope: scope, sessionOwnerKey: session.ownerKey, signal: abort.signal }); const file = new File([asset.blob], `${field.label}.png`, { type: asset.blob.type }); next[field.key].push(file); const images = cache.current.get(field.key) || new Map(); images.set(file, id); cache.current.set(field.key, images); }
          catch { if (abort.signal.aborted || !active()) return; missing = true; }
        }
      }
      if (active() && !abort.signal.aborted) { onHydrate(data.line); setSaved(data); setValues(next); setMode(previous || collection.length ? data.line.photoSelection.mode : 'as_is'); if (missing) setError('A saved photo is missing or expired. Replace it before saving, or order as is.'); }
    })().catch(caught => { if (active() && !abort.signal.aborted) setError(commerceError(caught)); }).finally(() => { if (active() && !abort.signal.aborted) setPending(false); });
    return () => { alive.current = false; abort.abort(); };
  // The host remounts this private boundary on product/configuration or owner change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function remember(key, pending) { try { sessionStorage.setItem(storageKey, JSON.stringify({ key, pending })); } catch { /* Opaque operation identity only. */ } }
  function change(next) {
    const removed = [];
    for (const [key, images] of cache.current) for (const [file, id] of images) if (!(next[key] || []).includes(file)) { removed.push(id); images.delete(file); }
    if (removed.length) void discardUploads(removed);
    setValues(next); setSuccess(false); setErrors({}); setError('');
  }
  function choose(next) {
    setMode(next); setError(''); setSuccess(false);
    if (next === 'as_is') { const retained = { ...values }; for (const key of Object.keys(retained)) if (!baseFields.some(field => field.key === key)) delete retained[key]; change(retained); }
  }
  async function check() {
    setPending(true); setError('');
    try {
      let key = request.current?.operationKey; try { key ||= JSON.parse(sessionStorage.getItem(storageKey))?.key; } catch { /* Storage optional. */ }
      const result = await commerceGet(`/cart/operations/${key}`, undefined, controller.current.signal);
      if (!active()) return;
      if (!result.applied) throw Error('The request is still unconfirmed. Retry the exact request from this open page or review your cart.');
      remember(key, false); setUncertain(false); setSuccess(true); setAcceptedOrder(result.alreadyOrdered || null); request.current = null; await cart.refresh();
    } catch (caught) { if (active()) setError(commerceError(caught)); } finally { if (active()) setPending(false); }
  }
  async function add() {
    if (pending || cart.pending || editId && !saved) return;
    setPending(true); setError(''); const created = [];
    try {
      if (!request.current) {
        const selectedValues = { ...(saved ? values : baseValues), ...Object.fromEntries(photoFields.filter(() => mode === 'photos').map(field => [field.key, values[field.key] || []])) };
        if (!legacy && mode === 'photos' && photos.length > maximum) throw Error(`Keep the personal collection within ${maximum} photos alongside your other product images.`);
        const invalid = validateConfiguredFields(definitions, selectedValues);
        if (product.variants.length && !variantKey) invalid.variant = 'Choose a product option first.';
        setErrors(invalid); if (Object.keys(invalid).length) throw Error(Object.values(invalid)[0]);
        const prepared = await uploadConfiguredFields(selectedValues, definitions, { productId: product._id, cache: cache.current }, created);
        if (!active()) return;
        request.current = { kind: 'product', operationKey: crypto.randomUUID(), productId: product._id, variantKey: variantKey || null, quantity, personalization: prepared, photoSelection: { contractVersion: legacy ? 'product-photos-v1' : 'product-photos-v2', mode, configurationVersion: legacy ? saved.line.photoSelection.configurationVersion : product.personalization.customerPhotosVersion || saved?.line.photoSelection.configurationVersion || 1 }, ...(saved ? { replaceLineId: editId, replaceFingerprint: saved.editFingerprint } : {}) };
      }
      remember(request.current.operationKey, true); setUncertain(true); const result = await cart.add(request.current);
      if (active()) { remember(request.current.operationKey, false); setUncertain(false); setSuccess(true); setAcceptedOrder(result.alreadyOrdered || null); request.current = null; cache.current.clear(); }
    } catch (caught) {
      if (active()) { setError(commerceError(caught)); if (request.current && caught.response?.status < 500 && ![408,429].includes(caught.response.status) && caught.response.data?.error?.code) { remember(request.current.operationKey, false); request.current = null; setUncertain(false); } }
      const complete = new Set([...cache.current.values()].flatMap(map => [...map.values()])); if (active()) await discardUploads(created.filter(id => !complete.has(id)));
    } finally { if (active()) setPending(false); }
  }
  return <section className="product-photo-purchase" aria-label="Personal photo choices">
    <fieldset disabled={pending || uncertain || success}><legend>Make it personal</legend><label className="customer-photo-choice"><input type="checkbox" checked={mode === 'photos'} disabled={!collection.length && !legacy} onChange={event => choose(event.target.checked ? 'photos' : 'as_is')}/><span><strong>Add my personal photos</strong><small>Make your gift personal with your favorite pictures. No extra charge.</small></span></label>
      {legacy && <p className="commerce-notice">This saved item uses an earlier photo setup. Its photos stay unchanged. You can keep them or uncheck personal photos to order as is. Start a new item to use the current photo collection.</p>}
      {saved && baseFields.length > 0 && <ConfiguredFields fields={baseFields} values={values} onChange={change} errors={errors}/>}
      {mode === 'photos' && <CustomerPhotoCollection files={photos} maxFiles={maximum} readOnly={legacy} disabled={pending || uncertain} error={errors[CUSTOMER_PHOTOS_KEY]} onChange={files => change({ ...values, [CUSTOMER_PHOTOS_KEY]: files })}/>}
      {<button type="button" data-photo-add className="button button-dark product-purchase-button" disabled={pending || cart.pending || Boolean(editId && !saved)} onClick={add}>{editId ? 'Save photo choices' : 'Add to Cart'}</button>}
    </fieldset>
    {uncertain && !pending && <div role="status"><p>Your last add is unconfirmed. Check it before starting another item.</p><button type="button" disabled={pending} onClick={check}>Check photo add status</button>{request.current && <button type="button" disabled={pending} onClick={add}>Retry same photo add</button>}</div>}
    {pending && <p role="status">Preparing your private photos...</p>}{error && <p role="alert">{error}</p>}{success && <p role="status">Your photo choices are saved. <Link to={acceptedOrder ? `/orders/${acceptedOrder}` : '/cart'}>View {acceptedOrder ? 'order' : 'cart'}</Link></p>}
  </section>;
}
