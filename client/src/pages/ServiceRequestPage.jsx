import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { commerceGet, commercePost, commerceError, money, uploadPrivateFile, discardUploads } from '../commerce/api.js';
import { LocalFileField } from '../commerce/ConfiguredFields.jsx';
import { parsePriceInput } from '../admin/catalog-form.js';
import PageMetadata from '../seo/PageMetadata.jsx';
import '../commerce/service-requests.css';

const photoField = { label: 'Reference images / artwork', required: false, maxFiles: 5, maxBytes: 8 * 1024 * 1024, acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] };
const titleFor = service => service === 'gift_box' ? 'Build Your Gift Box' : 'Laser Engraving';
function attempt(scope) {
  try { const saved = JSON.parse(sessionStorage.getItem(scope)); if (/^[a-f0-9-]{36}$/i.test(saved?.key)) return saved; } catch { /* Storage may be unavailable. Keep a memory-only attempt. */ }
  return { key: crypto.randomUUID(), pending: false };
}
function remember(scope, value) { try { sessionStorage.setItem(scope, JSON.stringify(value)); } catch { /* No private values/files are persisted. */ } }
function RequestForm({ service, owner }) {
  const scope = `tw-service-request:${owner}:${service}`;
  const [submission] = useState(() => attempt(scope));
  const [values, setValues] = useState({ name: '', phone: '', email: '', occasion: '', style: '', colors: '', contents: '', budget: '', recipient: '', message: '', instructions: '', productReference: '', engravingType: 'text', engravingText: '', font: '', placement: '', material: '', variantKey: '', quantity: 1 });
  const [product, setProduct] = useState(null), [files, setFiles] = useState([]), [selections, setSelections] = useState([]), [page, setPage] = useState(1), [search, setSearch] = useState(''), [searchDraft, setSearchDraft] = useState('');
  const [progress, setProgress] = useState(''), [uncertain, setUncertain] = useState(submission.pending), [saved, setSaved] = useState(null);
  const uploads = useRef(new Map()), body = useRef(null);
  const status = useQuery({ queryKey: privateQueryKey(owner, 'service-submission', submission.key), queryFn: ({ signal }) => commerceGet(`/service-requests/submissions/${submission.key}`, undefined, signal), retry: false });
  const options = useQuery({ queryKey: ['service-request-options', service, page, search], queryFn: ({ signal }) => commerceGet(`/service-requests/options/${service}`, { page, ...(search ? { search } : {}) }, signal), retry: false, staleTime: 0 });
  const mutation = useMutation({ mutationFn: async () => {
    const ownerGeneration = authGeneration();
    if (!body.current) {
      const details = service === 'gift_box' ? Object.fromEntries(['occasion', 'style', 'colors', 'contents', 'recipient', 'message', 'instructions'].map(key => [key, values[key]])) : Object.fromEntries(['engravingType', 'engravingText', 'instructions'].map(key => [key, values[key]]));
      details.quantity = Number(values.quantity);
      if (service === 'gift_box') details.budgetPiastres = parsePriceInput(values.budget, 'Budget');
      else if (product) { details.productId = product.id; if (product.variants?.length) details.variantKey = values.variantKey; for (const key of ['font', 'placement', 'material']) if (values[key]) details[key] = values[key]; }
      else details.productReference = values.productReference;
      const ids = [], signed = [], generation = authGeneration();
      try {
        for (const file of files) { let id = uploads.current.get(file); if (!id) { id = await uploadPrivateFile(file, { purpose: 'service_reference', requestKey: submission.key, onProgress: setProgress }, signed); uploads.current.set(file, id); } ids.push(id); }
      } catch (error) { if (generation === authGeneration()) await discardUploads(signed.filter(id => ![...uploads.current.values()].includes(id))); throw error; }
      body.current = { requestKey: submission.key, service, customer: { name: values.name, phone: values.phone, ...(values.email ? { email: values.email } : {}) }, details, components: selections.map(item => ({ componentId: item.componentId, quantity: Number(item.quantity) })), uploadIds: ids };
    }
    if (ownerGeneration !== authGeneration()) throw new Error('Your session changed. Start a fresh request in this session.');
    remember(scope, { key: submission.key, pending: true });
    return commercePost('/service-requests', body.current);
  }, onSuccess: result => { remember(scope, { key: submission.key, pending: false }); setSaved(result.request); setUncertain(false); setFiles([]); }, onError: error => {
    if (error.response?.data?.error?.code === 'REQUEST_INTAKE_CLOSED') { body.current = null; setUncertain(false); remember(scope, { key: submission.key, pending: false }); void options.refetch(); }
    else if (body.current && (!error.response || error.response.status >= 500)) setUncertain(true);
    else { body.current = null; setUncertain(false); remember(scope, { key: submission.key, pending: false }); }
  }, onSettled: () => setProgress('') });
  const receipt = saved || status.data?.request;
  if (receipt) return <section className="service-request-receipt"><p className="eyebrow">Request received</p><h2>{receipt.reference}</h2><p>No payment has been collected. The owner will contact you on WhatsApp within 12 hours to review your request. The final quotation will itemise the product/custom work, add-ons and delivery.</p><p>Keep this request reference. Acceptance and payment are arranged through WhatsApp; no account or website return visit is required.</p><Link className="button button-primary" to="/customize">Explore our services</Link><button type="button" className="button button-secondary" onClick={() => { try { sessionStorage.removeItem(scope); } catch { /* Optional storage. */ } window.location.reload(); }}>Start another request</button></section>;
  if (status.isPending || status.error) return <div className="commerce-notice"><p role={status.error ? 'alert' : 'status'}>{status.error ? commerceError(status.error) : 'Checking your request session…'}</p><button type="button" className="button button-secondary" onClick={() => status.refetch()}>Check again</button></div>;
  if (options.isPending || options.error || options.data?.intakeEnabled !== true) return <section className="commerce-notice" aria-labelledby="request-availability"><h2 id="request-availability">{options.isPending ? 'Checking request availability' : 'New requests are temporarily unavailable'}</h2><p>{options.error ? commerceError(options.error) : 'Existing submitted requests remain saved. Keep your reference for follow-up; closing new requests does not cancel accepted work.'}</p><button type="button" className="button button-secondary" disabled={options.isFetching} onClick={() => { void status.refetch(); void options.refetch(); }}>Check availability and saved request</button></section>;
  const known = selections.reduce((sum, item) => sum + (item.unitPricePiastres ?? 0) * item.quantity, 0);
  const variant = product?.variants?.find(item => item.key === values.variantKey), base = product?.variants?.length ? variant?.basePricePiastres : product?.basePricePiastres;
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value }));
  const input = (key, label, { required = false, max = 160, type = 'text', area = false } = {}) => <label className="commerce-field">{label}{area ? <textarea name={key} value={values[key]} required={required} maxLength={max} rows={3} onChange={event => set(key, event.target.value)} /> : <input name={key} type={type} pattern={key === 'phone' ? '(?:[+]?20|0020|0)1[0125][0-9]{8}' : undefined} value={values[key]} required={required} maxLength={max} onChange={event => set(key, event.target.value)} />}</label>;
  const selectedProductMissing = product && !options.data?.products?.some(item => item.id === product.id);
  return <form className="service-request-layout" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
    <fieldset disabled={mutation.isPending || uncertain} className="service-request-fields">
      <section className="service-request-card"><p className="eyebrow">01 · Your idea</p><h2>{service === 'gift_box' ? 'Tell us who it is for' : 'Make your mark'}</h2>
        {service === 'gift_box' ? <div className="service-request-grid">{input('occasion', 'Occasion', { required: true })}{input('style', 'Preferred style and presentation')}{input('colors', 'Preferred colors')}{input('budget', 'Preferred budget (EGP)', { max: 20 })}{input('contents', 'Desired contents', { required: true, area: true, max: 1500 })}{input('recipient', 'Recipient name')}{input('message', 'Gift message (optional)', { area: true, max: 500 })}</div> : <>
          <label className="commerce-field">Product to engrave<select value={product?.id || ''} onChange={event => { setProduct(options.data?.products.find(item => item.id === event.target.value) || null); setValues(previous => ({ ...previous, font: '', placement: '', material: '', variantKey: '' })); }}><option value="">Describe my item for owner review</option>{selectedProductMissing && <option value={product.id}>{product.name}</option>}{options.data?.products?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {!product && <>{input('productReference', 'Item description or product reference', { required: true, area: true, max: 500 })}<p>We will confirm whether your item and requested engraving are suitable. No material, font or placement is promised before review.</p></>}
          {product?.variants?.length > 0 && <label className="commerce-field">Product option<select required value={values.variantKey} onChange={event => set('variantKey', event.target.value)}><option value="">Choose an option</option>{product.variants.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>}
          <label className="commerce-field">Engraving type<select value={values.engravingType} onChange={event => set('engravingType', event.target.value)}><option value="text">Name / Text</option><option value="design">Design</option><option value="other">Other</option></select></label>
          {input('engravingText', 'Engraving text', { required: values.engravingType === 'text', area: true, max: product?.engraving.maxTextLength || 1000 })}
          {product && [['font', 'fonts', 'Font'], ['placement', 'placements', 'Engraving placement'], ['material', 'materials', 'Material']].map(([field, list, label]) => product.engraving[list]?.length > 0 ? <label className="commerce-field" key={field}>{label}<select required value={values[field]} onChange={event => set(field, event.target.value)}><option value="">Choose an approved option</option>{product.engraving[list].map(option => <option key={option} value={option}>{option}</option>)}</select></label> : <p key={field}>{label}: the owner will confirm options.</p>)}
        </>}
        <label className="commerce-field">Quantity<input type="number" min={1} max={20} required value={values.quantity} onChange={event => set('quantity', event.target.value)} /></label>
        {input('instructions', 'Additional instructions', { area: true, required: service === 'laser_engraving' && values.engravingType === 'other', max: 2000 })}
        <LocalFileField field={photoField} value={files} onChange={setFiles} disabled={mutation.isPending || uncertain} />
      </section>
      <section className="service-request-card"><p className="eyebrow">02 · Optional additions</p><h2>Owner-approved components</h2><p>Only components explicitly offered for this service appear here. Component quantities are totals for this entire request, even when requesting multiple gifts. You can describe anything else in your request.</p>
        <div className="service-request-search"><label className="commerce-field">Find products or components<input value={searchDraft} maxLength={100} onChange={event => setSearchDraft(event.target.value)} /></label><button type="button" className="button button-secondary" onClick={() => { setSearch(searchDraft.trim()); setPage(1); }}>Search options</button></div>
        {options.error && <p role="alert">{commerceError(options.error)} <button type="button" onClick={() => options.refetch()}>Retry options</button></p>}
        {!options.isPending && !options.data?.components?.length && <p>No selectable components on this page. Your bespoke request can still be submitted.</p>}
        <div className="request-component-grid">{options.data?.components?.map(component => {
          const selected = selections.find(item => item.componentId === component.componentId);
          return <article className="request-component" key={component.componentId}>{component.imageUrl && <img src={component.imageUrl} alt="" width="100" height="100" loading="lazy" />}<label><input type="checkbox" checked={Boolean(selected)} onChange={event => setSelections(previous => event.target.checked ? [...previous, { ...component, quantity: 1 }] : previous.filter(item => item.componentId !== component.componentId))} />{component.name}</label><p>{component.pricing === 'free' ? 'Free' : component.unitPricePiastres === null ? 'Price to be confirmed' : money(component.unitPricePiastres)}</p>{selected && <label className="commerce-field">{component.name} quantity<input required type="number" min={1} max={20} value={selected.quantity} onChange={event => setSelections(previous => previous.map(item => item.componentId === component.componentId ? { ...item, quantity: Number(event.target.value) } : item))} /></label>}</article>;
        })}</div><div className="commerce-pagination"><button type="button" disabled={page === 1 || options.isFetching} onClick={() => setPage(value => value - 1)}>Previous options</button><span>Page {page}</span><button type="button" disabled={!options.data?.hasNext || options.isFetching} onClick={() => setPage(value => value + 1)}>Next options</button></div>
      </section>
      <section className="service-request-card"><p className="eyebrow">03 · Stay in touch</p><h2>Your contact details</h2>{input('name', 'Your name', { required: true, max: 100 })}{input('phone', 'Egyptian WhatsApp number', { required: true, max: 25, type: 'tel' })}{input('email', 'Email (optional)', { max: 254, type: 'email' })}<p>WhatsApp is our primary channel for your quotation. Email is a supporting channel when provided.</p></section>
    </fieldset>
    <aside className="service-request-card service-request-estimate"><h2>Your request estimate</h2>{Number.isSafeInteger(base) && <p>Verified product price estimate: {money(base * Number(values.quantity))}</p>}{selections.map(item => <p key={item.componentId}>{item.name} × {item.quantity}: {item.pricing === 'free' ? 'Free' : item.unitPricePiastres === null ? 'Price to be confirmed' : money(item.unitPricePiastres * item.quantity)}</p>)}<p><strong>Known subtotal estimate: {known || Number.isSafeInteger(base) ? money(known + (base || 0) * Number(values.quantity)) : 'Not confirmed yet'}</strong></p><p>Custom work/product amount: to be confirmed.</p><p>Delivery: Pending Confirmation.</p><p>This is an estimate of known amounts, not a final quotation. No payment is collected when you submit.</p><p>The owner will contact you within 12 hours for an initial discussion. The quotation will separately confirm product/work, add-ons, delivery and available payment options.</p>
      {mutation.error && <p role="alert">{commerceError(mutation.error)}</p>}{progress && <p role="status">{progress}</p>}
      {uncertain ? <><p role="alert">Submission is unconfirmed. Do not start a duplicate request.</p><button type="button" className="button button-secondary" onClick={() => status.refetch()}>Check request status</button>{body.current ? <button type="button" className="button button-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Retry same request</button> : <p>The local form was cleared by reload. Check status again or contact the owner before starting another request.</p>}</> : <button type="submit" className="button button-primary" disabled={mutation.isPending || selections.length > 20}>{mutation.isPending ? 'Submitting securely…' : 'Submit request · No payment now'}</button>}
    </aside>
  </form>;
}
export default function ServiceRequestPage({ service }) {
  const session = useSession(), cart = useCart();
  const title = titleFor(service), path = service === 'gift_box' ? '/customize/gift-box' : '/customize/laser-engraving';
  return <main className="commerce-page service-request-page"><PageMetadata title={`${title} | Tap & Wrap`} description="Submit your bespoke request. Initial WhatsApp contact within 12 hours; quotation and acceptance follow review. No upfront payment." pathname={path} indexable={false} /><p className="eyebrow">Something thoughtfully yours</p><h1>{title}</h1><p className="service-request-intro">Share your idea. We will contact you on WhatsApp within 12 hours to discuss a personal quotation. No account or upfront payment is needed.</p>{session.ready && !cart.loading ? <RequestForm key={`${session.ownerKey}:${service}`} service={service} owner={cart.checkoutOwnerKey || session.ownerKey} /> : <p role="status">Preparing your secure request session…</p>}</main>;
}
