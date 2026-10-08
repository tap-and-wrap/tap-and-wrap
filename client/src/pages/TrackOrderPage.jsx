import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { commerceError, commercePost } from '../commerce/api';

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const query = useMutation({ mutationFn: () => commercePost('/orders/track', { orderNumber, phone }) });
  const order = query.data?.order || query.data?.tracking;
  return <main className="commerce-page commerce-narrow"><p className="eyebrow">Follow your thoughtful gift</p><h1>Track Your Order</h1><p>Enter the six-digit order number and the phone number used at checkout.</p><form onSubmit={(event) => { event.preventDefault(); query.mutate(); }} className="commerce-fields"><label className="commerce-field">Order number<input inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" minLength={6} maxLength={6} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></label><label className="commerce-field">Checkout phone number<input type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label><button className="button button-primary" disabled={query.isPending}>{query.isPending ? 'Checking…' : 'Track Order'}</button></form>{query.error && <p className="form-error" role="alert">{commerceError(query.error)}</p>}{order && <section className="commerce-notice" aria-live="polite"><h2>Order #{order.orderNumber}</h2><p>{(order.fulfillmentState || order.status || '').replaceAll('_', ' ')}</p>{(order.statusHistory || order.history || []).map((entry, index) => <p key={index}>{(entry.fulfillmentState || entry.status || entry.event || '').replaceAll('_', ' ')}{entry.at && ` · ${new Date(entry.at).toLocaleDateString()}`}</p>)}</section>}</main>;
}
