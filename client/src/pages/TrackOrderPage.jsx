import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { commerceError, commercePost } from '../commerce/api';
import { FieldError, fieldErrorProps, focusInvalidField, nativeFieldErrors, validationFieldErrors } from '../components/FormFeedback.jsx';

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const prefix = useId();
  const query = useMutation({ mutationFn: () => commercePost('/orders/track', { orderNumber, phone }), onError: (error) => setErrors(validationFieldErrors(error)) });
  function submit(event) {
    event.preventDefault();
    const next = nativeFieldErrors(event.currentTarget);
    setErrors(next);
    if (Object.keys(next).length) { focusInvalidField(event.currentTarget); return; }
    query.mutate();
  }
  const order = query.data?.order || query.data?.tracking;
  return <main className="commerce-page commerce-narrow"><p className="eyebrow">Follow your thoughtful gift</p><h1>Track Your Order</h1><p>Enter the six-digit order number and the phone number used at checkout.</p><form onSubmit={submit} className="commerce-fields" noValidate aria-busy={query.isPending}>
    <div className="commerce-field"><label htmlFor={`${prefix}-number`}>Order number</label><input id={`${prefix}-number`} name="orderNumber" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" minLength={6} maxLength={6} value={orderNumber} disabled={query.isPending} onChange={(event) => setOrderNumber(event.target.value)} {...fieldErrorProps(`${prefix}-number`, errors.orderNumber)}/><FieldError id={`${prefix}-number`}>{errors.orderNumber}</FieldError></div>
    <div className="commerce-field"><label htmlFor={`${prefix}-phone`}>Checkout phone number</label><input id={`${prefix}-phone`} name="phone" type="tel" autoComplete="tel" required value={phone} disabled={query.isPending} onChange={(event) => setPhone(event.target.value)} {...fieldErrorProps(`${prefix}-phone`, errors.phone)}/><FieldError id={`${prefix}-phone`}>{errors.phone}</FieldError></div>
    <button className="button button-primary" disabled={query.isPending}>{query.isPending ? 'Checking…' : 'Track Order'}</button></form>{query.error && <p className="form-error" role="alert">{commerceError(query.error)}</p>}{order && <section className="commerce-notice" aria-live="polite"><h2>Order #{order.orderNumber}</h2><p>{(order.fulfillmentState || order.status || '').replaceAll('_', ' ')}</p>{(order.statusHistory || order.history || []).map((entry, index) => <p key={index}>{(entry.fulfillmentState || entry.status || entry.event || '').replaceAll('_', ' ')}{entry.at && ` · ${new Date(entry.at).toLocaleDateString()}`}</p>)}</section>}</main>;
}
