import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCart } from '../commerce/CartContext';
import { commerceError, commerceGet, commercePost, discardUploads, money, uploadPrivateFile } from '../commerce/api';
import { LocalFileField } from '../commerce/ConfiguredFields';
import { emitTracking } from '../tracking/client';

const proofField = { key: 'payment_proof', label: 'InstaPay payment proof', required: true, minFiles: 1, maxFiles: 1, maxBytes: 5 * 1024 * 1024, acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] };
function checkoutKey() {
  const stored = sessionStorage.getItem('tw-checkout-key');
  if (stored) return stored;
  const key = crypto.randomUUID();
  sessionStorage.setItem('tw-checkout-key', key);
  return key;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, refresh } = useCart();
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', governorate: '', address: '', notes: '' });
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [proof, setProof] = useState([]);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const submissionKey = useRef(null);
  const proofUpload = useRef(null);
  const config = useQuery({ queryKey: ['commerce', 'checkout-config'], queryFn: ({ signal }) => commerceGet('/checkout/config', undefined, signal), retry: false, staleTime: 60_000 });
  const enabled = config.data?.enabled === true;
  const quote = useQuery({ queryKey: ['commerce', 'checkout-quote', customer.governorate, paymentMethod, appliedCode, cart.items.map((item) => ({ id: item.id, productId: item.productId, variantKey: item.variantKey, quantity: item.quantity, unitPricePiastres: item.unitPricePiastres, personalization: item.personalization, customization: item.customization })), cart.subtotalPiastres, cart.quantity], queryFn: () => {
    submissionKey.current ||= checkoutKey();
    return commercePost('/checkout/quote', { checkoutKey: submissionKey.current, paymentMethod, governorate: customer.governorate, ...(appliedCode ? { discountCode: appliedCode } : {}) });
  }, enabled: enabled && Boolean(customer.governorate) && cart.items.length > 0, retry: false, staleTime: 0 });
  const totals = quote.data?.quote || quote.data;
  useEffect(() => { if (quote.data?.tracking) emitTracking(quote.data.tracking); }, [quote.data]);
  const submit = useMutation({ mutationFn: async () => {
    if (!enabled) throw new Error('Ordering has not been enabled yet.');
    if (paymentMethod === 'instapay' && proof.length !== 1) { setFieldError('Select one payment proof before placing your order.'); throw new Error('Payment proof is required.'); }
    submissionKey.current ||= checkoutKey();
    let paymentProofId;
    const uploadedIds = [];
    if (paymentMethod === 'instapay') {
      if (proofUpload.current?.file === proof[0]) paymentProofId = proofUpload.current.id;
      else {
        try { paymentProofId = await uploadPrivateFile(proof[0], { purpose: 'payment_proof', checkoutKey: submissionKey.current }, uploadedIds); }
        catch (error) { await discardUploads(uploadedIds); throw error; }
        proofUpload.current = { file: proof[0], id: paymentProofId };
      }
    }
    // Keep a completed proof for an idempotent retry if the submission response is lost.
    return commercePost('/orders', { checkoutKey: submissionKey.current, customer, paymentMethod, ...(appliedCode ? { discountCode: appliedCode } : {}), ...(paymentProofId ? { paymentProofId } : {}) });
  }, onSuccess: async (result) => {
    const order = result.order;
    if (!order?.id && !order?._id) throw new Error('The server did not return an order confirmation.');
    emitTracking(result.tracking);
    sessionStorage.removeItem('tw-checkout-key');
    await refresh();
    navigate(`/orders/${order.id || order._id}`, { state: { order, guestCheckout: true } });
  } });
  function change(event) { setCustomer((previous) => ({ ...previous, [event.target.name]: event.target.value })); }
  function place(event) { event.preventDefault(); setFieldError(''); submit.mutate(); }
  return <main className="commerce-page"><p className="eyebrow">A little thought goes a long way</p><h1>Checkout</h1>
    {config.isPending ? <p role="status">Checking ordering availability…</p> : config.error ? <p role="alert">{commerceError(config.error)}</p> : !enabled ? <div className="commerce-notice"><h2>Ordering is not enabled yet</h2><p>Your cart is saved. Checkout will be available once the store is ready to accept approved products.</p><Link to="/cart">Return to your cart</Link></div> : !cart.items.length ? <div className="commerce-empty"><p>Your cart is empty.</p><Link to="/shop">Explore the shop</Link></div> : <form onSubmit={place} className="commerce-checkout-layout">
      <section><fieldset className="commerce-checkout-details" disabled={submit.isPending}><legend>Delivery and payment details</legend><h2>Delivery Details</h2><div className="commerce-fields">
        <label className="commerce-field">Full name<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={customer.name} onChange={change} /></label>
        <label className="commerce-field">Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={customer.email} onChange={change} /></label>
        <label className="commerce-field">Egyptian mobile number<input name="phone" type="tel" autoComplete="tel" required pattern="(?:[+]?20|0)1[0125][0-9]{8}" placeholder="01xxxxxxxxx" value={customer.phone} onChange={change} /></label>
        <label className="commerce-field">Governorate<select name="governorate" required value={customer.governorate} onChange={change}><option value="">Select governorate</option>{(config.data.governorates || []).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
        <label className="commerce-field">Delivery address<textarea name="address" required minLength={10} maxLength={500} autoComplete="street-address" rows={3} value={customer.address} onChange={change} /></label>
        <label className="commerce-field">Order notes (optional)<textarea name="notes" maxLength={1000} rows={2} value={customer.notes} onChange={change} /></label>
      </div><fieldset className="commerce-payment"><legend>Payment Method</legend><label><input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />Cash on Delivery</label><p>Payment is collected when your order is delivered.</p><label><input type="radio" name="payment" value="instapay" checked={paymentMethod === 'instapay'} onChange={() => setPaymentMethod('instapay')} />InstaPay — full payment</label>
        {paymentMethod === 'instapay' && <div className="commerce-notice"><p>Transfer the full order total, including shipping, to <strong>{config.data.instaPayNumber || '01060673073'}</strong>.</p><p>Payment is manually verified. Selecting a screenshot does not mark your order as paid.</p><LocalFileField field={proofField} value={proof} onChange={setProof} disabled={submit.isPending} error={fieldError} /><p className="commerce-muted">Proof uploads only when you press Place Order.</p></div>}
      </fieldset></fieldset></section>
      <aside className="commerce-summary"><h2>Your Order</h2>{cart.items.map((item) => <div className="commerce-summary-item" key={item.id}><span>{item.name} × {item.quantity}</span><strong>{money(item.lineTotalPiastres)}</strong></div>)}
        <label className="commerce-field">Discount code<input value={discountCode} maxLength={40} disabled={submit.isPending} onChange={(event) => setDiscountCode(event.target.value)} /></label><button className="button button-secondary" type="button" disabled={!customer.governorate || quote.isFetching || submit.isPending} onClick={() => setAppliedCode(discountCode.trim())}>Apply code</button>
        {quote.isFetching && <p role="status">Calculating your total…</p>}{quote.error && <p className="form-error" role="alert">{commerceError(quote.error)}</p>}
        {customer.governorate && <button className="commerce-link-button" type="button" disabled={quote.isFetching || submit.isPending} onClick={() => quote.refetch()}>Refresh order total</button>}
        {totals && <dl><div><dt>Subtotal</dt><dd>{money(totals.subtotalPiastres)}</dd></div>{(totals.discountPiastres || 0) > 0 && <div><dt>Discounts</dt><dd>−{money(totals.discountPiastres)}</dd></div>}<div><dt>Shipping</dt><dd>{money(totals.shippingPiastres)}</dd></div><div className="commerce-total"><dt>Total</dt><dd>{money(totals.totalPiastres)}</dd></div></dl>}
        {(fieldError || submit.error) && <p className="form-error" role="alert">{fieldError || commerceError(submit.error)}</p>}
        <button className="button button-primary" type="submit" disabled={submit.isPending || !totals || quote.isFetching || Boolean(quote.error) || cart.items.some((item) => !item.valid)}>{submit.isPending ? 'Placing your order…' : 'Place Order'}</button><p className="commerce-muted">Availability, quantities and approved prices are verified by the server before an order is accepted.</p>
      </aside>
    </form>}
  </main>;
}
