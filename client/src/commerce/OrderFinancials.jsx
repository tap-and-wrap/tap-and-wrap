import CatalogDialog from '../components/CatalogDialog.jsx';
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { commercePost, adminCommercePost, adminCommerceGet, commerceError, money, uploadPrivateFile } from './api.js';
import { LocalFileField } from './ConfiguredFields.jsx';
import { parsePriceInput } from '../admin/catalog-form.js';

const proofField = { key: 'payment_proof', label: 'InstaPay payment proof', required: true, minFiles: 1, maxFiles: 1, maxBytes: 5 * 1024 * 1024, acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] };
export function FinancialSummary({ order }) {
  const financial = order.accounting;
  if (!financial) return null;
  return <section className="commerce-summary"><h2>Payments and outstanding charges</h2><dl>
    <div><dt>Original merchandise amount</dt><dd>{money(financial.merchandisePiastres)}</dd></div>
    <div><dt>Agreed total after accepted charges and remedies</dt><dd>{money(financial.agreedTotalPiastres)}</dd></div>
    <div><dt>Collected</dt><dd>{money(financial.collectedPiastres)}</dd></div><div><dt>Refunded</dt><dd>{money(financial.refundedPiastres)}</dd></div>
    <div><dt>Agreed outstanding balance</dt><dd>{money(financial.outstandingPiastres)}</dd></div>
    <div><dt>Overpayment requiring review</dt><dd>{money(financial.overpaymentPiastres)}</dd></div>
    {financial.charges.map(charge => <div key={charge.id}><dt>{charge.label} ({charge.state.replaceAll('_', ' ')})</dt><dd>{charge.amountPiastres === null ? 'Pending Confirmation' : charge.pricing === 'free' ? 'Explicitly free' : money(charge.amountPiastres)}{charge.collectionMethod && ` · ${charge.collectionMethod === 'cod' ? 'Cash on Delivery' : 'InstaPay'}`}</dd></div>)}
  </dl>{financial.unresolvedCharges > 0 && <p>Additional amounts are awaiting confirmation or acceptance. They are separate from the original merchandise payment. The owner will contact you on WhatsApp within 12 hours.</p>}{financial.refundReviewRequired && <p role="status">Collected money requires cancellation/return refund reconciliation. A cancellation is not a refund confirmation.</p>}</section>;
}

export function CustomerOrderPayments({ order, refresh }) {
  const [files, setFiles] = useState([]), [progress, setProgress] = useState('');
  const uploaded = useRef(null);
  const mutation = useMutation({ mutationFn: async () => {
    if (!files[0]) throw Error('Select one receipt image. Do not send another transfer just to replace proof.');
    if (uploaded.current?.file !== files[0]) {
      const id = await uploadPrivateFile(files[0], { purpose: 'payment_proof', orderId: order.id, onProgress: setProgress });
      uploaded.current = { file: files[0], id };
    }
    return commercePost(`/orders/${order.id}/accounting`, { revision: order.revision, action: 'submit_proof', uploadId: uploaded.current.id });
  }, onSuccess: () => { setFiles([]); uploaded.current = null; void refresh(); }, onSettled: () => setProgress('') });
  if (order.accountingVersion !== 1) return null;
  return <>
    {order.paymentInstructions && <section className="commerce-notice"><h2>InstaPay instructions for order #{order.orderNumber}</h2><p>Destination: <strong>{order.paymentInstructions.destination}</strong>. Original merchandise amount: <strong>{money(order.paymentInstructions.amountPiastres)}</strong>.</p><p>Transfer only outstanding agreed amounts. Include order #{order.orderNumber}. Delivery and add-ons are separate; never repeat a transfer because a proof or network request failed.</p><p>Payment is confirmed only after the owner reconciles the actual receiving account.</p></section>}
    {order.orderChannel !== 'owner_quotation' && order.paymentMethod === 'instapay' && !['cancelled', 'returned', 'delivery_failed'].includes(order.fulfillmentState) && <section className="commerce-editor"><h2>Submit or replace private payment proof</h2><LocalFileField field={proofField} value={files} onChange={setFiles} disabled={mutation.isPending} /><button className="button button-primary" type="button" disabled={mutation.isPending || files.length !== 1} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Uploading and verifying…' : 'Submit proof for this order'}</button>{progress && <p role="status">{progress}</p>}{mutation.error && <p role="alert">{commerceError(mutation.error)}</p>}{mutation.isSuccess && <p role="status">Proof submitted. Payment awaits account reconciliation.</p>}</section>}
    {(order.accounting?.charges || []).filter(charge => charge.state === 'offered').map(charge => <ChargeAcceptance key={charge.id} charge={charge} order={order} refresh={refresh} />)}
  </>;
}
function ChargeAcceptance({ charge, order, refresh }) {
  const mutation = useMutation({ mutationFn: accepted => commercePost(`/orders/${order.id}/accounting`, { revision: order.revision, action: 'accept_charge', chargeId: charge.id, accepted }), onSuccess: refresh });
  return <section className="commerce-notice"><h3>Confirm {charge.label}</h3><p>{charge.pricing === 'free' ? 'Explicitly free' : money(charge.amountPiastres)} · {charge.collectionMethod}</p><p>You may also confirm through WhatsApp; the owner will record your acceptance.</p><button type="button" className="button button-primary" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>Accept this charge</button><button type="button" className="button button-secondary" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>Decline this charge</button>{mutation.error && <p role="alert">{commerceError(mutation.error)}</p>}</section>;
}

const actions = { quote_charge: 'Quote delivery or add-on', accept_charge: 'Record WhatsApp acceptance', collection: 'Record verified collection', refund: 'Record completed refund', reject_proof: 'Reject payment proof', cancel: 'Cancel after reconciliation', inventory_return: 'Reconcile inspected returned stock', release_discount: 'Reverse discount usage after policy review' };
function refundableParts(settlements, sourceId) {
  const source = settlements.find(entry => entry.id === sourceId && entry.direction === 'collection');
  if (!source) return [];
  const parts = entry => entry.allocations?.length ? entry.allocations : [{ scope: entry.scope, amountPiastres: entry.amountPiastres }];
  return [...new Set(parts(source).map(part => part.scope))].map(scope => ({ scope, remaining: parts(source).filter(part => part.scope === scope).reduce((sum, part) => sum + part.amountPiastres, 0)
    - settlements.filter(entry => entry.direction === 'refund' && entry.refundOf === sourceId).reduce((sum, entry) => sum + parts(entry).filter(part => part.scope === scope).reduce((value, part) => value + part.amountPiastres, 0), 0) })).filter(part => part.remaining > 0);
}
export function AdminOrderAccounting({ order, refresh }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [action, setAction] = useState(order.serviceRequestId ? 'collection' : 'quote_charge'), [chargeId, setChargeId] = useState('shipping'), [label, setLabel] = useState('');
  const [amount, setAmount] = useState(''), [pricing, setPricing] = useState('quoted'), [method, setMethod] = useState(order.paymentMethod);
  const [scope, setScope] = useState(order.orderChannel === 'owner_quotation' ? 'all_agreed' : 'merchandise'), [reference, setReference] = useState(''), [reason, setReason] = useState(''), [publicReason, setPublicReason] = useState(''), [confirmed, setConfirmed] = useState(false), [refundOf, setRefundOf] = useState('');
  const [quantities, setQuantities] = useState({}), [codAuthorized, setCodAuthorized] = useState(false), [offerBoth, setOfferBoth] = useState(false), [exceptionConfirmed, setExceptionConfirmed] = useState(false), [reducePayable, setReducePayable] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [refundAmounts, setRefundAmounts] = useState({});
  const refundParts = refundableParts(order.accounting?.settlements || [], refundOf);
  const scopeLabel = value => value === 'merchandise' ? 'Original merchandise' : order.accounting?.charges.find(charge => charge.id === value)?.label || 'Recorded charge';
  const lookup = useMutation({ mutationFn: () => adminCommerceGet('/settlements/lookup', { method, reference }) });
  const request = useRef(null);
  const mutation = useMutation({ mutationFn: async () => {
    if (!request.current) {
      const body = { revision: order.revision, action, ...(publicReason.trim() ? { publicReason: publicReason.trim() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) };
      if (action === 'quote_charge') Object.assign(body, { ...(chargeId ? { chargeId } : { kind: 'addon', label }), pricing, amountPiastres: parsePriceInput(amount), collectionMethod: method, allowedPaymentMethods: offerBoth ? ['cod', 'instapay'] : [method], codAuthorized });
      if (action === 'accept_charge') Object.assign(body, { chargeId, accepted: true, customerConfirmed: confirmed, method });
      if (['collection', 'refund'].includes(action)) Object.assign(body, { operationKey: crypto.randomUUID(), ...(action === 'collection' ? { scope } : {}), amountPiastres: parsePriceInput(amount), method, reference, reconciled: confirmed, exceptionConfirmed, reducePayable, ...(action === 'refund' ? { refundOf, allocations: refundParts.map(part => ({ scope: part.scope, amountPiastres: parsePriceInput(refundAmounts[part.scope] || '0') })).filter(part => part.amountPiastres > 0) } : {}) });
      if (action === 'refund' && (!body.allocations.length || body.allocations.reduce((sum, part) => sum + part.amountPiastres, 0) !== body.amountPiastres)) throw Error('Refund allocations must equal the actual transfer amount. Review each merchandise and delivery amount.');
      if (action === 'cancel') body.reconciled = confirmed;
      if (action === 'inventory_return' || action === 'cancel' && order.fulfillmentState === 'preparing') Object.assign(body, { inspected: confirmed, quantities: (order.inventoryClaims || []).map((_, index) => Number(quantities[index] || 0)) });
      request.current = body;
    }
    return adminCommercePost(`/orders/${order.id}/accounting`, request.current);
  }, onSuccess: () => { request.current = null; setUncertain(false); setConfirmed(false); setReference(''); setReason(''); void refresh(); }, onError: error => {
    if (request.current && (!error.response || error.response.status >= 500)) setUncertain(true);
    else { request.current = null; setUncertain(false); }
  } });
  if (order.accountingVersion !== 1) return <p>Legacy financial record: original totals are preserved. A separately reviewed reconciliation is required before ledger operations.</p>;
  return <section className="commerce-editor"><h2>Payment, delivery and exception operations</h2>
    {order.quotation && <details><summary>Saved WhatsApp quotation</summary><textarea aria-label="Saved WhatsApp quotation text" readOnly rows={10} value={order.quotation.text} />{order.quotation.url && <a className="button button-secondary" href={order.quotation.url} target="_blank" rel="noopener noreferrer">Open prefilled WhatsApp quotation</a>}<p>The owner sends this manually. Opening WhatsApp records neither delivery nor customer acceptance. Acceptance must be recorded below.</p></details>}
    <form onSubmit={event => { event.preventDefault(); setReviewOpen(true); }}><fieldset disabled={mutation.isPending || uncertain} className="commerce-editor-grid">
      <label className="commerce-field">Operation<select value={action} onChange={event => { setAction(event.target.value); setConfirmed(false); }} >{Object.entries(actions).filter(([key]) => !order.serviceRequestId || !['quote_charge', 'accept_charge'].includes(key)).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
      {['quote_charge', 'accept_charge'].includes(action) && <label className="commerce-field">Charge<select value={chargeId} onChange={event => setChargeId(event.target.value)}>{(order.accounting?.charges || []).map(charge => <option value={charge.id} key={charge.id}>{charge.label} ({charge.state})</option>)}{action === 'quote_charge' && <option value="">New add-on</option>}</select></label>}
      {action === 'quote_charge' && <><label className="commerce-field">Add-on label<input value={label} disabled={Boolean(chargeId)} required={!chargeId} maxLength={120} onChange={event => setLabel(event.target.value)} /></label><label className="commerce-field">Price treatment<select value={pricing} onChange={event => setPricing(event.target.value)}><option value="quoted">Confirmed amount</option><option value="quote_required">Price Pending Confirmation</option><option value="free">Explicitly Free</option></select></label></>}
      {['quote_charge', 'collection', 'refund'].includes(action) && <label className="commerce-field">Actual amount (EGP)<input inputMode="decimal" value={amount} required={action !== 'quote_charge'} onChange={event => setAmount(event.target.value)} /></label>}
      {['quote_charge', 'accept_charge', 'collection', 'refund'].includes(action) && <label className="commerce-field">Collection/payment method<select value={method} onChange={event => setMethod(event.target.value)}><option value="cod">Cash on Delivery</option><option value="instapay">InstaPay</option></select></label>}
      {action === 'quote_charge' && <label><input type="checkbox" checked={offerBoth} onChange={event => setOfferBoth(event.target.checked)} />Offer both COD and InstaPay for customer selection</label>}
      {['collection', 'refund'].includes(action) && <label><input type="checkbox" checked={exceptionConfirmed} onChange={event => setExceptionConfirmed(event.target.checked)} />Actual funds used a different method; I reconciled this exception without changing the original agreement</label>}
      {action === 'quote_charge' && <label><input type="checkbox" checked={codAuthorized} onChange={event => setCodAuthorized(event.target.checked)} />Explicitly authorize COD for a personalized/custom quotation before acceptance</label>}
      {['collection', 'refund'].includes(action) && <>{action === 'collection' && <label className="commerce-field">Payment allocation<select value={scope} onChange={event => setScope(event.target.value)}><option value="merchandise">Original merchandise</option>{action === 'collection' && <option value="all_agreed">Combined collection: allocate across agreed outstanding amounts</option>}{(order.accounting?.charges || []).filter(charge => charge.state === 'accepted').map(charge => <option key={charge.id} value={charge.id}>{charge.label}</option>)}</select></label>}<label className="commerce-field">Actual bank transfer or COD collection reference<input value={reference} required maxLength={120} pattern="[A-Za-z0-9/_-]+" onChange={event => setReference(event.target.value)} /></label></>}
      {action === 'refund' && <label className="commerce-field">Original collection<select required value={refundOf} onChange={event => { setRefundOf(event.target.value); const source = order.accounting.settlements.find(entry => entry.id === event.target.value); setRefundAmounts(Object.fromEntries(refundableParts(order.accounting.settlements, event.target.value).map(part => [part.scope, (part.remaining / 100).toFixed(2)]))); setAmount((refundableParts(order.accounting.settlements, event.target.value).reduce((sum, part) => sum + part.remaining, 0) / 100).toFixed(2)); setMethod(source?.method || order.paymentMethod); }}><option value="">Select actual collection</option>{order.accounting.settlements.filter(entry => entry.direction === 'collection').map(entry => <option value={entry.id} key={entry.id}>{entry.reference} · {money(entry.amountPiastres)}</option>)}</select></label>}
      {action === 'refund' && <fieldset><legend>Allocate this one actual refund</legend><p>One transfer reference covers the breakdown below. Enter zero to exclude a charge; allocations must equal the actual refund amount.</p>{refundParts.map(part => <label className="commerce-field" key={part.scope}>{scopeLabel(part.scope)} refund (EGP; maximum {money(part.remaining)})<input inputMode="decimal" required value={refundAmounts[part.scope] || '0'} onChange={event => setRefundAmounts(previous => ({ ...previous, [part.scope]: event.target.value }))} /></label>)}</fieldset>}
      {action === 'refund' && <label><input type="checkbox" checked={reducePayable} onChange={event => setReducePayable(event.target.checked)} />This completed refund also reduces the agreed payable amount under the reviewed customer remedy</label>}
      {(action === 'inventory_return' || action === 'cancel' && order.fulfillmentState === 'preparing') && (order.inventoryClaims || []).map((claim, index) => <label className="commerce-field" key={index}>Inspected resellable units: {claim.label || claim.kind} {claim.variantKey || ''} (maximum {claim.quantity}; source {claim.sourceId || index + 1})<input type="number" min={0} max={claim.quantity} value={quantities[index] || 0} onChange={event => setQuantities(previous => ({ ...previous, [index]: event.target.value }))} /></label>)}
      {['cancel', 'reject_proof'].includes(action) && <label className="commerce-field">Customer-visible explanation<textarea value={publicReason} maxLength={500} rows={2} onChange={event => setPublicReason(event.target.value)} /></label>}
      <label className="commerce-field">Private reconciliation / WhatsApp acceptance evidence<textarea value={reason} maxLength={500} required={action !== 'quote_charge'} rows={3} onChange={event => setReason(event.target.value)} /></label>
      <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirmed the actual account transaction, customer WhatsApp acceptance or returned-stock inspection applicable to this operation</label>
      <button className="button button-primary" type="submit">Record operation</button>
    </fieldset></form>
    {reviewOpen && <CatalogDialog title="Review order operation" onClose={() => setReviewOpen(false)}><p><strong>{actions[action]}</strong> for order #{order.orderNumber || order.id}.</p>{['collection', 'refund', 'quote_charge'].includes(action) && <p>Entered amount: {amount || 'Not entered'} EGP. Method: {method === 'cod' ? 'Cash on Delivery' : 'InstaPay'}.</p>}<p>Review the source record, actual transaction or customer acceptance. This action records an audited change; opening this dialog verifies nothing.</p><div className="admin-inline"><button type="button" className="button button-secondary" autoFocus onClick={() => setReviewOpen(false)}>Keep editing</button><button type="button" className="button button-primary" disabled={mutation.isPending} onClick={() => { setReviewOpen(false); mutation.mutate(); }}>Confirm and record operation</button></div></CatalogDialog>}
    {uncertain && <p role="alert">Response unconfirmed. Do not enter another payment. <button type="button" className="button button-secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Retry same recorded operation</button></p>}
    {mutation.error && <p role="alert">{commerceError(mutation.error)} <button type="button" className="commerce-link-button" onClick={() => { if (!uncertain) { request.current = null; void refresh(); } }}>Refresh order for review</button></p>}
    {mutation.isSuccess && <p role="status">Operation recorded. Financial history is preserved.</p>}
    <div><button type="button" className="button button-secondary" disabled={!reference.trim() || lookup.isPending} onClick={() => lookup.mutate()}>Find existing payment reference</button>{lookup.data && <p role="status">{lookup.data.settlement ? `Already recorded for order #${lookup.data.settlement.orderNumber}: ${money(lookup.data.settlement.amountPiastres)} (${lookup.data.settlement.direction})` : 'No ledger entry matches. This lookup alone does not verify a transfer.'}</p>}{lookup.error && <p role="alert">{commerceError(lookup.error)}</p>}</div>
    <h3>Financial audit history</h3>{(order.history || []).filter(entry => entry.actionDetails).map((entry, index) => <p key={index}>{entry.event.replaceAll('_', ' ')} · {entry.at && new Date(entry.at).toLocaleString()} · {entry.actionDetails.quotationVersion ? `Quotation v${entry.actionDetails.quotationVersion}` : ''} {Number.isSafeInteger(entry.actionDetails.amountPiastres) ? money(entry.actionDetails.amountPiastres) : ''} {entry.actionDetails.collectionMethod || ''} {entry.actionDetails.acceptanceChannel || ''}</p>)}
    <h3>Settlement history</h3>{order.accounting?.settlements.map(entry => <p key={entry.id}>{entry.direction} · {money(entry.amountPiastres)} · {entry.method} · {entry.reference}{entry.allocations?.map(part => <span key={part.scope}> · {scopeLabel(part.scope)}: {money(part.amountPiastres)}</span>)}</p>)}
  </section>;
}
