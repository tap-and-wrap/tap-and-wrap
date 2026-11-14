import { assertAuthGeneration, authGeneration } from '../services/api.js';
import CheckoutInstaPay from '../commerce/CheckoutInstaPay.jsx';
import ConfirmationDialog from '../components/ConfirmationDialog.jsx';
import { ChevronDown } from 'lucide-react';
import GiftBoxPreview from '../commerce/GiftBoxPreview.jsx';
import { PrivateImage } from '../engraving/EngravingCartCard.jsx';
import { isEngravingKind } from '../../../shared/engraving/definitions.mjs';
import { CustomerOrderPayments } from '../commerce/OrderFinancials.jsx';
import PersonalizationSummary from '../commerce/PersonalizationSummary.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCart } from '../commerce/CartContext';
import { commerceError, commerceGet, commercePost, money } from '../commerce/api';
import { emitTracking } from '../tracking/client';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { FieldError, fieldErrorProps, focusInvalidField, nativeFieldErrors, validationFieldErrors } from '../components/FormFeedback.jsx';
import { checkoutSession, completedCheckout, clearCheckoutSession, markCheckoutPending, markCheckoutRejected } from '../commerce/checkout-session.js';


function CheckoutLine({ item, owner }) {
  const gift = item.kind === 'gift_box_v2', engraving = isEngravingKind(item.kind);
  const name = gift ? 'Gift Box' : engraving ? `${item.engraving?.typeName || String(item.name || 'Item').replace(/\s+engraving$/i, '')} Engraving` : item.name;
  const layers = item.engraving?.layers || (item.engraving?.content ? [item.engraving.content] : []);
  return <div className="commerce-summary-item"><div className="checkout-line-thumbnail">{gift ? <GiftBoxPreview giftBox={item.giftBox}/> : engraving ? <PrivateImage key={`${owner}:${item.id}`} item={item} owner={owner} role="surface" label="Your engraving surface"/> : item.mainImageUrl ? <img src={item.mainImageUrl} alt="" width="58" height="58"/> : null}</div><div className="checkout-line-description"><span>{name} × {item.quantity}</span>{item.variantKey && <small>{item.variantLabel || item.variantKey}</small>}{gift && <small>{item.giftBox?.personalization?.photoCount || 0} photo prints{item.giftBox?.personalization?.sticker && <> · Sticker: <bdi>{item.giftBox.personalization.sticker.text}</bdi></>}</small>}{item.productEngraving && <small>Engraving{item.productEngraving.text && <>: <bdi>{item.productEngraving.text}</bdi> · {item.productEngraving.colorId}</>}</small>}{engraving && layers.map((layer,index) => <small key={layer.id || index}>{layer.text ? <bdi>{layer.text}</bdi> : 'Uploaded engraving artwork'}</small>)}<PersonalizationSummary values={item.personalization} definitions={item.personalizationDefinitions}/></div><strong>{money(item.lineTotalPiastres)}</strong></div>;
}

export default function CheckoutPage() {
  const { cart, refresh, checkoutOwnerKey } = useCart();
  const session = useSession();
  const checkoutOwner = checkoutOwnerKey ? `checkout:${checkoutOwnerKey}` : session.ownerKey;
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', governorate: '', addressVersion: 'delivery-address-v3', city: '', street: '', building: '', floor: '', apartment: '', notes: '' });
  const [accepted, setAccepted] = useState(null);
  const [paymentError, setPaymentError] = useState('');
  const acceptedOwner = useRef(null);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [checkoutPayment,setCheckoutPayment] = useState(null), [switchTarget,setSwitchTarget] = useState(null), [switchError,setSwitchError] = useState(''), [switchPending,setSwitchPending] = useState(false);
  const switchingPayment = useRef(false);
  const engravingOnly = cart.items.length > 0 && cart.items.every(item => isEngravingKind(item.kind));
  const hasEngraving = cart.items.some(item => isEngravingKind(item.kind));
  const [discountCode, setDiscountCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [uploadStatus, setUploadStatus] = useState('');
  const prefix = useId();
  const submissionKey = useRef(null), placing = useRef(false);
  const requestSnapshot = useRef(null);
  const [uncertainOwner, setUncertainOwner] = useState(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const uncertain = uncertainOwner === checkoutOwner || session.ready && checkoutSession(checkoutOwner).pending;
  useEffect(() => {
    submissionKey.current = null; requestSnapshot.current = null;
    setCustomer({ name: session.user?.name || '', email: session.user?.email || '', phone: session.user?.phone || '', governorate: '', addressVersion: 'delivery-address-v3', city: '', street: '', building: '', floor: '', apartment: '', notes: '' });
    setCheckoutPayment(null); setPaymentMethod('cod');
    setFieldErrors({}); setFieldError(''); setRecoveryMessage('');
    setUncertainOwner(null);
  }, [session.ownerKey, checkoutOwner, session.user?.name, session.user?.email, session.user?.phone]);
  const config = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'checkout-config'), queryFn: ({ signal }) => commerceGet('/checkout/config', undefined, signal), enabled: session.ready, retry: false, staleTime: 60_000 });
  const enabled = config.data?.enabled === true;
  const completedId = session.ready ? completedCheckout(checkoutOwner) : null;
  const paymentRecovery = useQuery({ queryKey: privateQueryKey(session.ownerKey,'checkout-payment',checkoutSession(checkoutOwner).key), queryFn:({signal})=>commerceGet(`/checkout/payments/${checkoutSession(checkoutOwner).key}`,undefined,signal), enabled:session.ready && !accepted && (!completedId || cart.items.length > 0), retry:false,gcTime:0 });
  useEffect(()=>{ if(paymentRecovery.data?.payment && paymentRecovery.data.payment.state!=='consumed')setPaymentMethod('instapay'); },[paymentRecovery.data]);
  const recoveredPayment = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'checkout-completed-order', completedId), queryFn: ({signal}) => commerceGet(`/orders/${completedId}`, undefined, signal), enabled: session.ready && !cart.items.length && Boolean(completedId) && !accepted, retry: false, gcTime: 0 });
  useEffect(() => {
    if (recoveredPayment.data?.order) { acceptedOwner.current = session.ownerKey; setAccepted(recoveredPayment.data.order); }
  }, [recoveredPayment.data, session.ownerKey]);
  useEffect(() => { setAccepted(null); setPaymentError(''); acceptedOwner.current = null; }, [session.ownerKey]);

  const quote = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'checkout-quote', customer.governorate, paymentMethod, appliedCode, cart.items.map((item) => ({ id: item.id, kind: item.kind, productId: item.productId, variantKey: item.variantKey, quantity: item.quantity, unitPricePiastres: item.unitPricePiastres, personalization: item.personalization, customization: item.customization })), cart.subtotalPiastres, cart.quantity), queryFn: ({ signal }) => {
    submissionKey.current ||= checkoutSession(checkoutOwner).key;
    return commercePost('/checkout/quote', { checkoutKey: submissionKey.current, paymentMethod, ...(customer.governorate ? { governorate: customer.governorate } : {}), ...(appliedCode ? { discountCode: appliedCode } : {}) }, { signal });
  }, enabled: session.ready && enabled && !paymentRecovery.isPending && !uncertain && cart.items.length > 0, retry: false, staleTime: 0 });
  const totals = quote.data?.totals || quote.data?.quote || quote.data;
  useEffect(() => { if (quote.data?.tracking) emitTracking(quote.data.tracking); }, [quote.data]);
  function confirmed(result) {
    const order = result.order;
    if (!order?.id && !order?._id) throw new Error('The server did not return an order confirmation. Check submission status before trying again.');
    completedCheckout(checkoutOwner, order.id || order._id);
    clearCheckoutSession(checkoutOwner);
    try { emitTracking(result.tracking); emitTracking(result.paymentTracking); } catch { /* Optional tracking cannot hide an accepted order. */ }
    // A failed cart refresh must not conceal an already accepted order.
    void refresh().catch(() => {});
    acceptedOwner.current = session.ownerKey;
    setAccepted(order);
  }
  const recover = useMutation({ mutationFn: () => commerceGet(`/checkout/submissions/${checkoutSession(checkoutOwner).key}`), onSuccess: result => {
    if (result.order) confirmed(result);
    else setRecoveryMessage('No confirmation is available yet. An earlier request may still be processing. Retry the same submission below, if available, or contact the store before placing a new order.');
  } });
  const submit = useMutation({ mutationFn: async () => {
    if (requestSnapshot.current) return commercePost('/orders', requestSnapshot.current);
    if (paymentMethod === 'instapay') {
      if (!checkoutPayment?.ready) throw new Error('Enter the sender name and choose your transaction screenshot. Do not transfer again.');
      const generation = authGeneration();
      setUploadStatus('Saving your payment evidence securely...');
      await checkoutPayment.ensureProof?.();
      assertAuthGeneration(generation);
    }
    if (!enabled) throw new Error('Ordering has not been enabled yet.');
    submissionKey.current ||= checkoutSession(checkoutOwner).key;
    setUploadStatus('Submitting your order securely…');
    requestSnapshot.current = { checkoutKey: submissionKey.current, customer: { ...customer }, paymentMethod, ...(appliedCode ? { discountCode: appliedCode } : {}) };
    markCheckoutPending(checkoutOwner);
    return commercePost('/orders', requestSnapshot.current);
  }, onSuccess: confirmed, onError: (error) => {
    const reviewable = !checkoutPayment?.reference && ['CHECKOUT_QUOTE_REQUIRED', 'CHECKOUT_CHANGED', 'PRODUCT_UNAVAILABLE', 'INSUFFICIENT_STOCK', 'QUOTATION_REQUIRED', 'ENGRAVING_REVIEW_REQUIRED', 'ENGRAVING_TYPE_UNAVAILABLE', 'ENGRAVING_CHANGED', 'ENGRAVING_MIXED_CHECKOUT', 'ENGRAVING_DISABLED', 'INVALID_UPLOAD_REFERENCES'].includes(error.response?.data?.error?.code);
    if (reviewable) { markCheckoutRejected(checkoutOwner); requestSnapshot.current = null; setUncertainOwner(null); void refresh().catch(() => {}); void quote.refetch(); }
    else if (requestSnapshot.current && (!error.response || error.response.status >= 500 || error.response.status === 409)) setUncertainOwner(checkoutOwner);
    else if (requestSnapshot.current) { markCheckoutRejected(checkoutOwner); requestSnapshot.current = null; }
    setFieldErrors(Object.fromEntries(Object.entries(validationFieldErrors(error)).map(([key, value]) => [key.replace(/^customer\./, ''), value])));
  }, onSettled: () => { placing.current = false; setUploadStatus(''); } });
  function change(event) { setCustomer((previous) => ({ ...previous, [event.target.name]: event.target.value })); }
  function place(event) {
    event.preventDefault(); if (placing.current) return; setFieldError('');
    const errors = nativeFieldErrors(event.currentTarget);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusInvalidField(event.currentTarget); return; }
    placing.current = true; submit.mutate();
  }
  async function refreshAccepted() {
    const owner = session.ownerKey;
    try { const result = await commerceGet(`/orders/${accepted.id}`); if (acceptedOwner.current === owner) { setAccepted(result.order); setPaymentError(''); } }
    catch (error) { if (acceptedOwner.current === owner) setPaymentError(commerceError(error)); }
  }
  if (accepted && acceptedOwner.current === session.ownerKey) return <main className="commerce-page checkout-payment-step"><p className="eyebrow">Order confirmed</p><h1>Thank you, order #{accepted.orderNumber}</h1><p>{accepted.paymentMethod === 'instapay' ? accepted.checkoutPayment ? 'Your payment evidence is saved and awaits owner verification. Do not transfer again.' : 'Complete your InstaPay payment below. Keep this order reference if you need to return later.' : 'Your order is unpaid. Cash is collected only through the agreed delivery or handoff arrangement.'}</p><>{paymentError && <div className="commerce-notice" role="alert"><p>{paymentError} Your accepted order remains saved.</p><button type="button" className="button button-secondary" onClick={refreshAccepted}>Refresh payment status</button></div>}</><CustomerOrderPayments key={`${session.ownerKey}:${accepted.id}`} order={accepted} refresh={refreshAccepted}/><Link className="button button-primary" to={`/orders/${accepted.id}`}>View order status</Link></main>;
  const control = (name) => ({ id: `${prefix}-${name}`, name, value: customer[name], onChange: change, ...fieldErrorProps(`${prefix}-${name}`, fieldErrors[name]) });
  return <main className="commerce-page"><p className="eyebrow">A little thought goes a long way</p><h1>Checkout</h1>
    {uncertain && <section className="commerce-notice" aria-label="Unconfirmed submission"><h2>Check your order submission</h2><p role="alert">The previous submission is unconfirmed. Do not make another payment or start a new order yet.</p><div className="button-group"><button className="button button-secondary" type="button" disabled={recover.isPending || submit.isPending} onClick={() => recover.mutate()}>Check submission status</button>{requestSnapshot.current && <button className="button button-primary" type="button" disabled={submit.isPending || recover.isPending} onClick={() => submit.mutate()}>Retry same submission</button>}<Link to="/contact">Contact the store</Link></div>{recover.isPending && <p role="status">Checking securely…</p>}{recoveryMessage && <p role="status">{recoveryMessage}</p>}{recover.error && <p role="alert">{commerceError(recover.error)}</p>}</section>}
    {config.isPending ? <p role="status">Checking ordering availability…</p> : config.error ? <><p role="alert">{commerceError(config.error)}</p><button type="button" className="button button-secondary" onClick={() => config.refetch()}>Try again</button></> : !enabled ? <div className="commerce-notice"><h2>Ordering is not enabled yet</h2><p>Your cart is saved. Checkout will be available once the store is ready to accept approved products.</p><Link to="/cart">Return to your cart</Link></div> : !cart.items.length ? <div className="commerce-empty">{recoveredPayment.isFetching ? <p role="status">Recovering your accepted order...</p> : recoveredPayment.error ? <p role="alert">{commerceError(recoveredPayment.error)}</p> : <p>Your cart is empty.</p>}<Link to="/shop">Explore the shop</Link></div> : <form onSubmit={place} className="commerce-checkout-layout" noValidate aria-busy={submit.isPending}>
      <section><fieldset className="commerce-checkout-details" disabled={submit.isPending || uncertain}><legend className="sr-only">Checkout details</legend><h2>Contact details</h2><div className="commerce-fields commerce-contact-fields">
        <div className="commerce-field"><label htmlFor={`${prefix}-name`}>Full name</label><input {...control('name')} autoComplete="name" required minLength={2} maxLength={100}/><FieldError id={`${prefix}-name`}>{fieldErrors.name}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-email`}>Email (optional)</label><input {...control('email')} type="email" autoComplete="email" maxLength={254}/><FieldError id={`${prefix}-email`}>{fieldErrors.email}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-phone`}>Egyptian mobile number</label><input {...control('phone')} type="tel" autoComplete="tel" required pattern="(?:[+]?20|0020|0)1[0125][0-9]{8}" placeholder="01xxxxxxxxx"/><FieldError id={`${prefix}-phone`}>{fieldErrors.phone}</FieldError></div>
      </div><h2>{engravingOnly ? 'Return / contact address' : 'Delivery'}</h2><div className="commerce-fields">
        <div className="commerce-field"><label htmlFor={`${prefix}-governorate`}>Governorate</label><select {...control('governorate')} required><option value="">Select governorate</option>{(config.data.governorates || []).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select><FieldError id={`${prefix}-governorate`}>{fieldErrors.governorate}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-city`}>City / Area</label><input {...control('city')} required minLength={2} maxLength={100} autoComplete="address-level2"/><FieldError id={`${prefix}-city`}>{fieldErrors.city}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-street`}>Street address</label><input {...control('street')} required minLength={5} maxLength={300} autoComplete="address-line1"/><FieldError id={`${prefix}-street`}>{fieldErrors.street}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-building`}>Building (optional)</label><input {...control('building')} maxLength={100} autoComplete="address-line2"/><FieldError id={`${prefix}-building`}>{fieldErrors.building}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-floor`}>Floor (optional)</label><input {...control('floor')} maxLength={50}/><FieldError id={`${prefix}-floor`}>{fieldErrors.floor}</FieldError></div>
        <div className="commerce-field"><label htmlFor={`${prefix}-apartment`}>Apartment (optional)</label><input {...control('apartment')} maxLength={50}/><FieldError id={`${prefix}-apartment`}>{fieldErrors.apartment}</FieldError></div>
        <details className="commerce-order-notes" open={fieldErrors.notes ? true : undefined}><summary>Add delivery notes (optional)<ChevronDown size={18} aria-hidden="true"/></summary><div className="commerce-field"><label htmlFor={`${prefix}-notes`}>Order notes (optional)</label><textarea {...control('notes')} maxLength={1000} rows={2}/><FieldError id={`${prefix}-notes`}>{fieldErrors.notes}</FieldError></div></details>
      </div><p className="commerce-delivery-policy">{engravingOnly ? 'Item handoff and return arrangements are confirmed separately with the store.' : <>Delivery is calculated separately. We&apos;ll contact you on WhatsApp to confirm the fee.<small>Initial contact within 12 hours.</small></>}</p><fieldset className="commerce-payment"><legend>Payment</legend><label><input type="radio" name="payment" value="cod" disabled={checkoutPayment?.busy} checked={paymentMethod === 'cod'} onChange={event => checkoutPayment?.reference ? setSwitchTarget(event.currentTarget) : setPaymentMethod('cod')} />{engravingOnly ? 'COD on agreed return / handoff' : 'Cash on Delivery'}</label><label><input type="radio" name="payment" value="instapay" checked={paymentMethod === 'instapay'} onChange={() => setPaymentMethod('instapay')} />{engravingOnly ? 'InstaPay' : hasEngraving || cart.items.some(item => item.kind === 'gift_box_v2') ? 'InstaPay' : 'InstaPay \u2014 full payment'}</label>
        {paymentMethod === 'instapay' && <CheckoutInstaPay key={`${session.ownerKey}:${checkoutSession(checkoutOwner).key}`} owner={session.ownerKey} checkoutOwner={checkoutOwner} checkoutKey={checkoutSession(checkoutOwner).key} governorate={customer.governorate} discountCode={appliedCode} quote={quote} onChange={setCheckoutPayment} disabled={submit.isPending || uncertain}/>}
      </fieldset></fieldset></section>
      <aside className="commerce-summary"><h2>Your Order</h2>{cart.items.map(item => <CheckoutLine key={`${session.ownerKey}:${item.id}`} item={item} owner={session.ownerKey}/>)}
        {!engravingOnly && <details className="commerce-discount"><summary>Have a discount code?<ChevronDown size={18} aria-hidden="true"/></summary><label className="commerce-field">Discount code<input value={discountCode} maxLength={40} disabled={submit.isPending || uncertain} onChange={(event) => setDiscountCode(event.target.value)} /></label><button className="button button-secondary" type="button" disabled={uncertain || quote.isFetching || submit.isPending} onClick={() => setAppliedCode(discountCode.trim())}>Apply code</button></details>}
        {quote.isFetching && <p role="status">Calculating your total…</p>}{quote.error && <p className="form-error" role="alert">{commerceError(quote.error)}</p>}
        {<button className="commerce-link-button" type="button" disabled={uncertain || quote.isFetching || submit.isPending} onClick={() => quote.refetch()}>Refresh order total</button>}
        {quote.data?.paymentGroups && <dl>{quote.data.paymentGroups.map(group => <div key={group.id}><dt>{group.label}{group.method === 'cod' ? ' - COD' : ' - InstaPay'}</dt><dd>{money(group.amountPiastres)}</dd></div>)}</dl>}{totals && <dl><div><dt>Subtotal</dt><dd>{money(totals.subtotalPiastres)}</dd></div>{(totals.discountPiastres || 0) > 0 && <div><dt>Discounts</dt><dd>−{money(totals.discountPiastres)}</dd></div>}<div><dt>Delivery</dt><dd>Confirmed separately</dd></div><div className="commerce-total"><dt>Order total</dt><dd>{money(totals.totalPiastres)}</dd></div></dl>}
        {(fieldError || submit.error) && <p className="form-error" role="alert">{fieldError || commerceError(submit.error)}</p>}
        {submit.isPending && <p className="upload-progress" role="status"><progress aria-label="Placing your order"/>{uploadStatus || 'Preparing your order…'}</p>}
        <button className="button button-primary" type="submit" disabled={uncertain || submit.isPending || paymentMethod === 'instapay' && !checkoutPayment?.ready || !totals || quote.isFetching || Boolean(quote.error) || cart.items.some((item) => !item.valid)}>{submit.isPending ? 'Placing your order…' : 'Place Order'}</button>
      </aside>
    </form>}
    {switchTarget && <ConfirmationDialog title="Switch to Cash on Delivery?" description="Continue only if you have not transferred money. If you transferred or submitted proof, keep your payment reference and contact the store; do not pay again." returnFocus={switchTarget} onCancel={()=>{setSwitchTarget(null);setSwitchError('');}} confirmLabel="I have not transferred" error={switchError} pending={switchPending} onConfirm={async()=>{if(switchingPayment.current)return;switchingPayment.current=true;setSwitchPending(true);try{await commercePost(`/checkout/payments/${checkoutSession(checkoutOwner).key}/cancel`,{noTransferConfirmed:true});clearCheckoutSession(checkoutOwner);submissionKey.current=null;setCheckoutPayment(null);setPaymentMethod('cod');setSwitchTarget(null);}catch(error){setSwitchError(commerceError(error));}finally{switchingPayment.current=false;setSwitchPending(false);}}}/>}
  </main>;
}
