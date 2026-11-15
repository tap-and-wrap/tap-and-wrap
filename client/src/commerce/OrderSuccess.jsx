import { useLayoutEffect } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from './api.js';

export default function OrderSuccess({ order }) {
  const orderId = order.id || order._id;
  useLayoutEffect(() => { window.scrollTo({top:0,left:0,behavior:'instant'}); }, [orderId]);
  const status = order.paymentState;
  const instapay = order.paymentMethod === 'instapay';
  const deferred = order.collectionAuthorized === false;
  const payment = deferred ? 'Payment confirmed separately' : status === 'paid' ? 'Payment verified' : status === 'refunded' ? 'Refund recorded' : status === 'partially_paid' ? 'Payment partially received' : status === 'rejected' ? 'Payment needs attention' : instapay ? status === 'awaiting_verification' ? 'InstaPay — Awaiting verification' : 'InstaPay — Payment pending' : 'Cash on Delivery';
  const description = deferred ? 'Open your order for the agreed inspection and payment steps.' : status === 'paid' ? 'Thank you. Your payment has been confirmed.' : status === 'refunded' ? 'Open your order for refund details.' : status === 'partially_paid' ? 'Open your order for the remaining agreed balance.' : status === 'rejected' ? 'Open your order to review or replace your screenshot. Contact us before transferring again.' : instapay ? status === 'awaiting_verification' ? 'We have received your payment screenshot. We will update your order after verification.' : 'Open your order for the current payment instructions.' : 'Payment due on delivery.';
  return <main className="commerce-page order-success">
    <header><span className="order-success-check"><Check size={28} aria-hidden="true"/></span><h1>Thank you for your order!</h1><p className="order-success-number">Order #{order.orderNumber}</p><p>We&apos;ve received your order.</p></header>
    <section className="order-success-card" aria-label="Order summary"><h2>Your order</h2>
      <ul>{(order.lines || []).map((line, index) => <li key={line.id || index}><span>{line.kind === 'gift_box_v2' ? 'Gift Box' : line.name}<small>Quantity: {line.quantity}</small></span><strong>{money(line.lineTotalPiastres)}</strong></li>)}</ul>
      <dl><div><dt>Delivery</dt><dd>{order.shipping?.state === 'accepted' ? 'Agreed with the store' : 'Confirmed separately'}</dd></div><div className="commerce-total"><dt>Order total</dt><dd>{money(order.accounting?.agreedTotalPiastres ?? order.totals?.totalPiastres)}</dd></div></dl>
      <div className="order-success-payment"><strong>{payment}</strong><p>{description}</p></div>
    </section>
    <div className="order-success-actions"><Link className="button button-primary" to={`/orders/${order.id || order._id}`}>Track Order</Link><Link className="button button-secondary" to="/shop">Continue Shopping</Link></div>
  </main>;
}
