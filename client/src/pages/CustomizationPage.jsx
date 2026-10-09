import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '../commerce/CartContext';
import ConfiguredFields, { validateConfiguredFields } from '../commerce/ConfiguredFields';
import { commerceError, commerceGet, commercePost, discardUploads, money, uploadConfiguredFields } from '../commerce/api';
import { emitTracking } from '../tracking/client';
import { FieldError, fieldErrorProps, focusInvalidField } from '../components/FormFeedback.jsx';

function useDelayed(value) {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => { const timeout = setTimeout(() => setDelayed(value), 350); return () => clearTimeout(timeout); }, [value]);
  return delayed;
}
function defaults(template) {
  return (template.groups || []).flatMap((group) => group.options.filter((option) => option.defaultQuantity > 0).map((option) => ({ groupKey: group.key, optionKey: option.key, quantity: option.defaultQuantity })));
}
function Configurator({ product, template }) {
  const cart = useCart();
  const imageRef = useRef(null);
  const [selections, setSelections] = useState(() => defaults(template));
  const [values, setValues] = useState({});
  const [personalization, setPersonalization] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [variantKey, setVariantKey] = useState('');
  const [errors, setErrors] = useState({});
  const [personalErrors, setPersonalErrors] = useState({});
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const prefix = useId();
  // Public templates already contain the normalized service fields and approved choices.
  const fields = template.fields || [];
  const personalFields = product.personalization?.fields || [];
  const quoteFields = useMemo(() => Object.fromEntries(Object.entries(values).filter(([, value]) => !Array.isArray(value))), [values]);
  const delayedFields = useDelayed(quoteFields);
  const customization = { templateId: template._id || template.id, version: template.version, selections, fields: delayedFields };
  const quote = useQuery({ queryKey: ['commerce', 'customization-quote', product._id || product.id, template.version, selections, delayedFields, variantKey], queryFn: () => commercePost('/customization/quote', { productId: product._id || product.id, ...(variantKey ? { variantKey } : {}), customization }), retry: false, staleTime: 0, refetchOnWindowFocus: false });
  function selection(group, option, amount) {
    setSelections((previous) => [...previous.filter((entry) => entry.groupKey !== group.key || entry.optionKey !== option.key), ...(amount > 0 ? [{ groupKey: group.key, optionKey: option.key, quantity: amount }] : [])]);
  }
  async function add(event) {
    event.preventDefault();
    if (saving || cart.pending) return;
    const nextErrors = validateConfiguredFields(fields, values);
    const nextPersonalErrors = validateConfiguredFields(personalFields, personalization);
    if (product.variants?.length && !product.variants.some((variant) => variant.key === variantKey && variant.orderingAvailable !== false)) nextErrors.variantKey = 'Choose an available product option.';
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) nextErrors.quantity = 'Choose a whole quantity from 1 to 99.';
    setErrors(nextErrors);
    setPersonalErrors(nextPersonalErrors);
    setError('');
    if (Object.keys(nextErrors).length || Object.keys(nextPersonalErrors).length) { focusInvalidField(event.currentTarget); return; }
    const uploaded = [];
    setSaving(true);
    try {
      const uploadedFields = await uploadConfiguredFields(values, fields, { productId: product._id || product.id, purpose: 'artwork', templateId: template._id || template.id, templateVersion: template.version, onProgress: setUploadStatus }, uploaded);
      const uploadedPersonalization = await uploadConfiguredFields(personalization, personalFields, { productId: product._id || product.id, onProgress: setUploadStatus }, uploaded);
      setUploadStatus('Verifying selections and adding your item…');
      await cart.add({ productId: product._id || product.id, ...(variantKey ? { variantKey } : {}), quantity, personalization: uploadedPersonalization, customization: { ...customization, fields: uploadedFields } }, imageRef.current);
    } catch (failure) { await discardUploads(uploaded); setError(commerceError(failure)); }
    finally { setSaving(false); setUploadStatus(''); }
  }
  const eligible = product.orderingAvailable === true;
  const quotation = quote.data?.quote || quote.data;
  return <form onSubmit={add} className="commerce-configurator" noValidate aria-busy={saving}><section>{product.mainImageUrl ? <img className="commerce-configurator-photo" src={product.mainImageUrl} ref={imageRef} alt={product.name} /> : <div className="commerce-configurator-placeholder">Product image</div>}<h2>{product.name}</h2><p>{product.description}</p><Link to={`/products/${product.slug}`}>View product details</Link></section><section>
    <h2>{template.name}</h2>{product.variants?.length > 0 && <div className="commerce-field"><label htmlFor={`${prefix}-variant`}>Product option</label><select id={`${prefix}-variant`} value={variantKey} required disabled={saving} {...fieldErrorProps(`${prefix}-variant`, errors.variantKey)} onChange={(event) => setVariantKey(event.target.value)}><option value="">Choose an option</option>{product.variants.map((variant) => <option key={variant.key} value={variant.key} disabled={variant.available === false || variant.orderingAvailable === false}>{(variant.attributes || []).map((attribute) => attribute.value).join(' / ') || variant.key}</option>)}</select><FieldError id={`${prefix}-variant`}>{errors.variantKey}</FieldError></div>}
    {(template.groups || []).map((group) => <fieldset className="commerce-option-group" key={group.key}><legend>{group.label}</legend><p className="commerce-muted">Choose {group.minChoices}–{group.maxChoices}. Allowed changes: {(group.allowedActions || []).join(', ')}.</p>{group.options.map((option) => {
      const selected = selections.find((entry) => entry.groupKey === group.key && entry.optionKey === option.key)?.quantity || 0;
      const defaultQuantity = option.defaultQuantity || 0;
      const allowed = group.allowedActions || [];
      const locked = defaultQuantity > 0 ? !allowed.includes('remove') && !allowed.includes('replace') : !allowed.includes('add') && !allowed.includes('replace');
      const unavailable = !option.active || !option.available;
      return <div key={option.key} className="commerce-config-option"><label><input type="checkbox" checked={selected > 0} disabled={saving || locked || (unavailable && !selected)} onChange={(event) => selection(group, option, event.target.checked ? Math.max(option.minQuantity || 1, 1) : 0)} />{option.label}{unavailable && <span> — unavailable</span>}</label>{!unavailable && <span>{option.componentId && !Number.isSafeInteger(option.componentPricePiastres) ? 'Price unavailable' : money((option.componentPricePiastres || 0) + (option.priceAdjustmentPiastres || 0))}</span>}{selected > 0 && option.maxQuantity > 1 && <label className="commerce-option-quantity">Quantity<input type="number" min={option.minQuantity || 1} max={option.maxQuantity} value={selected} disabled={saving || locked} onChange={(event) => selection(group, option, Number(event.target.value))} /></label>}</div>;
    })}</fieldset>)}
    <ConfiguredFields fields={fields} values={values} onChange={setValues} errors={errors} disabled={saving} />
    {personalFields.length > 0 && <fieldset className="commerce-option-group"><legend>Product Personalization</legend><ConfiguredFields fields={personalFields} values={personalization} onChange={setPersonalization} errors={personalErrors} disabled={saving} /></fieldset>}
    <div className="commerce-field"><label htmlFor={`${prefix}-quantity`}>Quantity</label><input id={`${prefix}-quantity`} type="number" min="1" max="99" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required disabled={saving} {...fieldErrorProps(`${prefix}-quantity`, errors.quantity)}/><FieldError id={`${prefix}-quantity`}>{errors.quantity}</FieldError></div>
    <div className="commerce-config-total" aria-live="polite">{quote.isFetching ? <span>Calculating approved price…</span> : quotation?.unitPricePiastres != null ? <strong>{money(quotation.unitPricePiastres)} each</strong> : <span>Complete your selections to calculate the price.</span>}</div>
    {(error || quote.error) && <p className="form-error" role="alert">{error || commerceError(quote.error)}</p>}
    {saving && <p className="upload-progress" role="status"><progress aria-label="Adding your customized gift"/>{uploadStatus || 'Preparing your item…'}</p>}
    <button className="button button-primary" type="submit" disabled={saving || !eligible || quote.isFetching || Boolean(quote.error) || !Number.isSafeInteger(quotation?.unitPricePiastres)}>{saving ? 'Adding to cart…' : eligible ? 'Add to Cart' : 'Sold Out'}</button><p className="commerce-muted">Selected files upload privately only when you add this item to your cart.</p><Link to="/cart">View your cart</Link>
  </section></form>;
}

export default function CustomizationPage({ kind }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const selectedSlug = slug || params.get('product') || '';
  const page = Math.max(1, Number(params.get('page') || 1));
  const search = params.get('search') || '';
  const products = useQuery({ queryKey: ['commerce', 'service-products', kind, page, search], queryFn: ({ signal }) => commerceGet(`/customization/services/${kind}/products`, { page, limit: 20, ...(search ? { search } : {}) }, signal), enabled: Boolean(kind), retry: false, staleTime: 30_000 });
  const selected = useQuery({ queryKey: ['commerce', 'product-customization', selectedSlug], queryFn: ({ signal }) => commerceGet(`/customization/products/${selectedSlug}`, undefined, signal), enabled: Boolean(selectedSlug), retry: false, staleTime: 30_000 });
  useEffect(() => { if (selected.data?.tracking) emitTracking(selected.data.tracking); }, [selected.data]);
  const title = kind === 'gift_box' ? 'Build Your Gift Box' : kind === 'laser_engraving' ? 'Laser Engraving' : 'Customize This';
  const list = products.data?.products || [];
  const pagination = products.data?.pagination;
  return <main className="commerce-page"><p className="eyebrow">A thoughtful gift, made personal</p><h1>{title}</h1>{kind && <section className="commerce-service-picker"><p>{kind === 'laser_engraving' ? 'Select an approved engravable product to view its supported materials, styles and placements.' : 'Choose an available gift box to see its configured components and options.'}</p><form className="commerce-inline-form" onSubmit={(event) => { event.preventDefault(); setParams({ ...(selectedSlug ? { product: selectedSlug } : {}), ...(searchInput ? { search: searchInput } : {}) }); }}><label className="commerce-field">Search products<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><button className="button button-secondary">Search</button></form>{products.isPending ? <p role="status">Loading eligible products…</p> : products.error ? <div><p role="alert">{commerceError(products.error)}</p><button type="button" className="button button-secondary" disabled={products.isFetching} onClick={() => products.refetch()}>Try again</button></div> : !list.length ? <p>No approved products are currently configured for this service.</p> : <><div className="commerce-field"><label htmlFor="customization-service-product">{kind === 'gift_box' ? 'Gift box type / size' : 'Engravable product'}</label><select id="customization-service-product" value={list.some((product) => product.slug === selectedSlug) ? selectedSlug : ''} onChange={(event) => setParams({ product: event.target.value, ...(search ? { search } : {}), ...(page > 1 ? { page: String(page) } : {}) })}><option value="">Choose a product</option>{list.map((product) => <option key={product._id || product.id} value={product.slug}>{product.name}</option>)}</select></div><nav className="commerce-pagination" aria-label="Eligible product pages"><button disabled={page <= 1 || products.isFetching} onClick={() => { params.set('page', String(page - 1)); setParams(params); }}>Previous</button><span>Page {page}</span><button disabled={products.isFetching || (pagination ? page >= (pagination.pages || pagination.totalPages || 1) : list.length < 20)} onClick={() => { params.set('page', String(page + 1)); setParams(params); }}>Next</button></nav></>}</section>}
    {selectedSlug && (selected.isPending ? <p role="status">Loading approved customization options…</p> : selected.error ? <div><p className="form-error" role="alert">{commerceError(selected.error)}</p><button type="button" className="button button-secondary" disabled={selected.isFetching} onClick={() => selected.refetch()}>Try again</button></div> : selected.data?.product && selected.data?.template ? <Configurator key={`${selected.data.product._id || selected.data.product.id}-${selected.data.template.version}`} product={selected.data.product} template={selected.data.template} /> : <p>No approved customization template is available for this product.</p>)}
  </main>;
}
