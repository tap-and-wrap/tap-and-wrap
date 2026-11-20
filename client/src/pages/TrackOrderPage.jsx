import { Link } from 'react-router-dom';
import OrderProgress, { orderStatusLabel } from '../commerce/OrderProgress.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { commerceError, commercePost, money } from '../commerce/api';
import { FieldError, fieldErrorProps, focusInvalidField, nativeFieldErrors, validationFieldErrors } from '../components/FormFeedback.jsx';

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const prefix = useId();
  const [showResult, setShowResult] = useState(false);
  const query = useMutation({ mutationFn: () => commercePost('/orders/track', { orderNumber, phone }), onError: (error) => { setShowResult(false); setErrors(validationFieldErrors(error)); }, onSuccess: () => setShowResult(true) });
  function submit(event) {
    event.preventDefault();
    const next = nativeFieldErrors(event.currentTarget);
    setErrors(next);
    if (Object.keys(next).length) { focusInvalidField(event.currentTarget); return; }
    setShowResult(false); query.reset(); query.mutate();
  }
  const order = query.data?.order || query.data?.tracking;
  return <main className="commerce-page commerce-narrow"><p className="eyebrow">Follow your thoughtful gift</p><h1>Track Your Order</h1><p>Enter the six-digit order number and the phone number used at checkout.</p>{!showResult && <form onSubmit={submit} className="commerce-fields" noValidate aria-busy={query.isPending}>
    <div className="commerce-field"><label htmlFor={`${prefix}-number`}>Order number</label><input id={`${prefix}-number`} name="orderNumber" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" minLength={6} maxLength={6} value={orderNumber} disabled={query.isPending} onChange={(event) => setOrderNumber(event.target.value)} {...fieldErrorProps(`${prefix}-number`, errors.orderNumber)}/><FieldError id={`${prefix}-number`}>{errors.orderNumber}</FieldError></div>
    <div className="commerce-field"><label htmlFor={`${prefix}-phone`}>Checkout phone number</label><input id={`${prefix}-phone`} name="phone" type="tel" autoComplete="tel" required value={phone} disabled={query.isPending} onChange={(event) => setPhone(event.target.value)} {...fieldErrorProps(`${prefix}-phone`, errors.phone)}/><FieldError id={`${prefix}-phone`}>{errors.phone}</FieldError></div>
    <button className="button button-primary" disabled={query.isPending}>{query.isPending ? 'Checking…' : 'Track Order'}</button></form>}{query.error && <p className="form-error" role="alert">{commerceError(query.error)}</p>}{query.isPending && <LoadingState label="Finding your order" count={1}/>}<p className="commerce-muted">This lookup shows a limited summary. Your address, personal designs and payment screenshots stay private.</p>{showResult && order && !query.isPending && !query.error && <section className="tracking-result" aria-live="polite"><header className="order-detail-header"><div><p className="eyebrow">Your order</p><h2>#{order.orderNumber}</h2>{order.createdAt && <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'long' })}</time>}</div><span className="commerce-badge">{orderStatusLabel(order.paymentState)}</span></header><OrderProgress state={order.fulfillmentState || order.status}/>{order.items?.length > 0 && <ul className="tracking-items">{order.items.map((item, index) => <li key={index}><span>{item.name}</span><strong>&times; {item.quantity}</strong></li>)}</ul>}<dl>{Number.isSafeInteger(order.totalPiastres) && <div><dt>Original order amount</dt><dd>{money(order.totalPiastres)}</dd></div>}{order.shippingStatus && <div><dt>Delivery agreement</dt><dd>{({pending:'Confirmed separately',offered:'Awaiting your agreement',accepted:'Agreed with the store',declined:'Contact the store',legacy:'Contact the store'})[order.shippingStatus] || 'Contact the store'}</dd></div>}</dl><p>For delivery arrangements or payment questions, <Link to="/contact">contact Tap &amp; Wrap</Link> with your order number.</p><button type="button" className="button button-secondary track-another-order" onClick={() => { query.reset(); setShowResult(false); setErrors({}); setOrderNumber(''); setPhone(''); }}>Track Another Order</button></section>}</main>;
}
