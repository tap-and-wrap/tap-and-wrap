import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCart } from '../commerce/CartContext';
import { commerceError, commerceGet, commercePost, discardUploads, money, uploadPrivateFile } from '../commerce/api';
import { LocalFileField } from '../commerce/ConfiguredFields';
import { emitTracking } from '../tracking/client';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { FieldError, fieldErrorProps, focusInvalidField, nativeFieldErrors, validationFieldErrors } from '../components/FormFeedback.jsx';
import { checkoutSession, clearCheckoutSession, markCheckoutPending, markCheckoutRejected } from '../commerce/checkout-session.js';

const proofField = { key: 'payment_proof', label: 'InstaPay payment proof', required: true, minFiles: 1, maxFiles: 1, maxBytes: 5 * 1024 * 1024, acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] };

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, refresh, checkoutOwnerKey } = useCart();
  const session = useSession();
  const checkoutOwner = checkoutOwnerKey ? `checkout:${checkoutOwnerKey}` : session.ownerKey;
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', governorate: '', address: '', notes: '' });
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [proof, setProof] = useState([]);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [uploadStatus, setUploadStatus] = useState('');
  const prefix = useId();
  const submissionKey = useRef(null);
  const proofUpload = useRef(null);
  const requestSnapshot = useRef(null);
  const [uncertainOwner, setUncertainOwner] = useState(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const uncertain = uncertainOwner === checkoutOwner || session.ready && checkoutSession(checkoutOwner).pending;
  useEffect(() => {
    submissionKey.current = null; proofUpload.current = null; requestSnapshot.current = null;
    setCustomer({ name: '', email: '', phone: '', governorate: '', address: '', notes: '' });
    setProof([]); setFieldErrors({}); setFieldError(''); setRecoveryMessage('');
    setUncertainOwner(null);
  }, [session.ownerKey, checkoutOwner]);
  const config = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'checkout-config'), queryFn: ({ signal }) => commerceGet('/checkout/config', undefined, signal), enabled: session.ready, retry: false, staleTime: 60_000 });
  const enabled = config.data?.enabled === true;
  const quote = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'checkout-quote', customer.governorate, paymentMethod, appliedCode, cart.items.map((item) => ({ id: item.id, productId: item.productId, variantKey: item.variantKey, quantity: item.quantity, unitPricePiastres: item.unitPricePiastres, personalization: item.personalization, customization: item.customization })), cart.subtotalPiastres, cart.quantity), queryFn: ({ signal }) => {
    submissionKey.current ||= checkoutSession(checkoutOwner).key;
    return commercePost('/checkout/quote', { checkoutKey: submissionKey.current, paymentMethod, governorate: customer.governorate, ...(appliedCode ? { discountCode: appliedCode } : {}) }, { signal });
  }, enabled: session.ready && enabled && !uncertain && Boolean(customer.governorate) && cart.items.length > 0, retry: false, staleTime: 0 });
  const totals = quote.data?.quote || quote.data;
  useEffect(() => { if (quote.data?.tracking) emitTracking(quote.data.tracking); }, [quote.data]);
  function confirmed(result) {
    const order = result.order;
    if (!order?.id && !order?._id) throw new Error('The server did not return an order confirmation. Check submission status before trying again.');
    clearCheckoutSession(checkoutOwner);
    emitTracking(result.tracking); emitTracking(result.paymentTracking);
    // A failed cart refresh must not conceal an already accepted order.
    void refresh().catch(() => {});
    navigate(`/orders/${order.id || order._id}`, { state: { order, guestCheckout: !session.user } });
  }
  const recover = useMutation({ mutationFn: () => commerceGet(`/checkout/submissions/${checkoutSession(checkoutOwner).key}`), onSuccess: result => {
    if (result.order) confirmed(result);
    else setRecoveryMessage('No confirmation is available yet. An earlier request may still be processing. Retry the same submission below, if available, or contact the store before placing a new order.');
  } });
  const submit = useMutation({ mutationFn: async () => {
    if (requestSnapshot.current) return commercePost('/orders', requestSnapshot.current);
    if (!enabled) throw new Error('Ordering has not been enabled yet.');
    if (paymentMethod === 'instapay' && proof.length !== 1) { setFieldError('Select one payment proof before placing your order.'); throw new Error('Payment proof is required.'); }
    submissionKey.current ||= checkoutSession(checkoutOwner).key;
    let paymentProofId;
    const uploadedIds = [];
    if (paymentMethod === 'instapay') {
      if (proofUpload.current?.file === proof[0]) paymentProofId = proofUpload.current.id;
      else {
        try { paymentProofId = await uploadPrivateFile(proof[0], { purpose: 'payment_proof', checkoutKey: submissionKey.current, onProgress: setUploadStatus }, uploadedIds); }
        catch (error) { await discardUploads(uploadedIds); throw error; }
        proofUpload.current = { file: proof[0], id: paymentProofId };
      }
    }
    // Keep a completed proof for an idempotent retry if the submission response is lost.
    setUploadStatus('Submitting your order securely…');
    requestSnapshot.current = { checkoutKey: submissionKey.current, customer: { ...customer }, paymentMethod, ...(appliedCode ? { discountCode: appliedCode } : {}), ...(paymentProofId ? { paymentProofId } : {}) };
    markCheckoutPending(checkoutOwner);
    return commercePost('/orders', requestSnapshot.current);
  }, onSuccess: confirmed, onError: (error) => {
    if (requestSnapshot.current && (!error.response || error.response.status >= 500 || error.response.status === 409)) setUncertainOwner(checkoutOwner);
    else if (requestSnapshot.current) { markCheckoutRejected(checkoutOwner); requestSnapshot.current = null; }
    setFieldErrors(Object.fromEntries(Object.entries(validationFieldErrors(error)).map(([key, value]) => [key.replace(/^customer\./, ''), value])));
  }, onSettled: () => setUploadStatus('') });
  function change(event) { setCustomer((previous) => ({ ...previous, [event.target.name]: event.target.value })); }
  function place(event) {
    event.preventDefault(); setFieldError('');
    const errors = nativeFieldErrors(event.currentTarget);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusInvalidField(event.currentTarget); return; }
    submit.mutate();
  }
  const control = (name) => ({ id: `${prefix}-${name}`, name, value: customer[name], onChange: change, ...fieldErrorProps(`${prefix}-${name}`, fieldErrors[name]) });
  return <main className="commerce-page"><p className="eyebrow">A little thought goes a long way</p><h1>Checkout</h1>
    {uncertain && <section className="commerce-notice" aria-label="Unconfirmed submission"><h2>Check your order submission</h2><p role="alert">The previous submission is unconfirmed. Do not make another payment or start a new order yet.</p><div className="button-group"><button className="button button-secondary" type="button" disabled={recover.isPending || submit.isPending} onClick={() => recover.mutate()}>Check submission status</button>{requestSnapshot.current && <button className="button button-primary" type="button" disabled={submit.isPending || recover.isPending} onClick={() => submit.mutate()}>Retry same submission</button>}<Link to="/contact">Contact the store</Link></div>{recover.isPending && <p role="status">Checking securely…</p>}{recoveryMessage && <p role="status">{recoveryMessage}</p>}{recover.error && <p role="alert">{commerceError(recover.error)}</p>}</section>}
    {config.isPending ? <p role="status">Checking ordering availability…</p> : config.error ? <><p role="alert">{commerceError(config.error)}</p><button type="button" className="button button-secondary" onClick={() => config.refetch()}>Try again</button></> : !enabled ? <div className="commerce-notice"><h2>Ordering is not enabled yet</h2><p>Your cart is saved. Checkout will be available once the store is ready to accept approved products.</p><Link to="/cart">Return to your cart</Link></div> : !cart.items.length ? <div className="commerce-empty"><p>Your cart is empty.</p><Link to="/shop">Explore the shop</Link></div> : <form onSubmit={place} className="commerce-checkout-layout" noValidate aria-busy={submit.isPending}>
      <section><fieldset className="commerce-checkout-details" disabled={submit.isPending || uncertain}><legend>Delivery and payment details</legend><h2>Delivery Details</h2><div className="commerce-fields">
        <div className="commerce-field"><label htmlFor={`${prefix}-name`}>Full name</label><input {...control('name')} autoComplete="name" required minLength={2} maxLength={100}/><FieldError id={`${prefix}-name`}>{fieldErrors.name}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-email`}>Email</label><input {...control('email')} type="email" autoComplete="email" required maxLength={254}/><FieldError id={`${prefix}-email`}>{fieldErrors.email}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-phone`}>Egyptian mobile number</label><input {...control('phone')} type="tel" autoComplete="tel" required pattern="(?:[+]?20|0020|0)1[0125][0-9]{8}" placeholder="01xxxxxxxxx"/><FieldError id={`${prefix}-phone`}>{fieldErrors.phone}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-governorate`}>Governorate</label><select {...control('governorate')} required><option value="">Select governorate</option>{(config.data.governorates || []).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select><FieldError id={`${prefix}-governorate`}>{fieldErrors.governorate}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-address`}>Delivery address</label><textarea {...control('address')} required minLength={10} maxLength={500} autoComplete="street-address" rows={3}/><FieldError id={`${prefix}-address`}>{fieldErrors.address}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-notes`}>Order notes (optional)</label><textarea {...control('notes')} maxLength={1000} rows={2}/><FieldError id={`${prefix}-notes`}>{fieldErrors.notes}</FieldError></div>
      </div><fieldset className="commerce-payment"><legend>Payment Method</legend><label><input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />Cash on Delivery</label><p>Payment is collected when your order is delivered.</p><label><input type="radio" name="payment" value="instapay" checked={paymentMethod === 'instapay'} onChange={() => setPaymentMethod('instapay')} />InstaPay — full payment</label>
        {paymentMethod === 'instapay' && <div className="commerce-notice"><p>Transfer the full order total, including shipping, to <strong>{config.data.instaPayNumber || '01060673073'}</strong>.</p><p>Payment is manually verified. Selecting a screenshot does not mark your order as paid.</p><LocalFileField field={proofField} value={proof} onChange={setProof} disabled={submit.isPending} error={fieldError} /><p className="commerce-muted">Proof uploads only when you press Place Order.</p></div>}
      </fieldset></fieldset></section>
      <aside className="commerce-summary"><h2>Your Order</h2>{cart.items.map((item) => <div className="commerce-summary-item" key={item.id}><span>{item.name} × {item.quantity}</span><strong>{money(item.lineTotalPiastres)}</strong></div>)}
        <label className="commerce-field">Discount code<input value={discountCode} maxLength={40} disabled={submit.isPending || uncertain} onChange={(event) => setDiscountCode(event.target.value)} /></label><button className="button button-secondary" type="button" disabled={uncertain || !customer.governorate || quote.isFetching || submit.isPending} onClick={() => setAppliedCode(discountCode.trim())}>Apply code</button>
        {quote.isFetching && <p role="status">Calculating your total…</p>}{quote.error && <p className="form-error" role="alert">{commerceError(quote.error)}</p>}
        {customer.governorate && <button className="commerce-link-button" type="button" disabled={uncertain || quote.isFetching || submit.isPending} onClick={() => quote.refetch()}>Refresh order total</button>}
        {totals && <dl><div><dt>Subtotal</dt><dd>{money(totals.subtotalPiastres)}</dd></div>{(totals.discountPiastres || 0) > 0 && <div><dt>Discounts</dt><dd>−{money(totals.discountPiastres)}</dd></div>}<div><dt>Shipping</dt><dd>{money(totals.shippingPiastres)}</dd></div><div className="commerce-total"><dt>Total</dt><dd>{money(totals.totalPiastres)}</dd></div></dl>}
        {(fieldError || submit.error) && <p className="form-error" role="alert">{fieldError || commerceError(submit.error)}</p>}
        {submit.isPending && <p className="upload-progress" role="status"><progress aria-label="Placing your order"/>{uploadStatus || 'Preparing your order…'}</p>}
        <button className="button button-primary" type="submit" disabled={uncertain || submit.isPending || !totals || quote.isFetching || Boolean(quote.error) || cart.items.some((item) => !item.valid)}>{submit.isPending ? 'Placing your order…' : 'Place Order'}</button><p className="commerce-muted">Availability, quantities and approved prices are verified by the server before an order is accepted.</p>
      </aside>
    </form>}
  </main>;
}
