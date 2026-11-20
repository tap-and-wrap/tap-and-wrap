import { Link } from 'react-router-dom';
import { money } from '../commerce/api.js';

export const stateLabel = value => ({
  awaiting_verification: 'Awaiting verification', awaiting_customer_item: 'Awaiting customer item',
  final_design_proposed: 'Awaiting design approval', final_design_confirmed: 'Design approved',
  inspection_pending: 'Under inspection', accepted: 'Accepted', engraving_in_progress: 'Engraving',
  engraving_completed: 'Engraving completed', return_arranged: 'Return arranged',
  return_dispatched: 'Return dispatched', returned_to_customer: 'Returned',
  unsuitable: 'Return required', paid: 'Paid', unpaid: 'Unpaid', received: 'New',
  confirmed: 'Confirmed', preparing: 'Processing', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', cancelled: 'Cancelled', awaiting_transfer: 'Awaiting transfer',
  partially_paid: 'Partially paid', refunded: 'Refunded', rejected: 'Payment declined',
}[value] || String(value || 'Not recorded').replaceAll('_', ' '));
export const adminDate = (value, options = {}) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Cairo', ...options }).format(new Date(value)) : '—';
export const typeLabel = types => types?.length > 1 ? 'Mixed order' : ({ gift_box: 'Gift Box', engraving: 'Engraving', product: 'Product' }[types?.[0]] || 'Product');

export default function OrderTable({ orders, compact = false }) {
  if (!orders.length) return <div className="admin-empty"><h3>No orders found</h3><p>New purchases and customized orders will appear here.</p></div>;
  return <div className="owner-order-table v11-order-table" role="region" aria-label="Orders" tabIndex={0}>
    <table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th>{!compact && <th scope="col">Date</th>}<th scope="col">Items</th><th scope="col">Total</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col"><span className="storefront-sr-only">Details</span></th></tr></thead>
      <tbody>{orders.map(order => <tr key={order.id || order._id}>
        <td data-label="Order"><strong>#{order.orderNumber}</strong></td>
        <td data-label="Customer"><span>{order.customer?.name || 'Customer'}</span></td>
        {!compact && <td data-label="Date">{adminDate(order.createdAt)}</td>}
        <td data-label="Items">{typeLabel(order.itemTypes)}</td>
        <td data-label="Total" className="owner-money">{Number.isSafeInteger(order.totals?.totalPiastres ?? order.totalPiastres) ? money(order.totals?.totalPiastres ?? order.totalPiastres) : '—'}</td>
        <td data-label="Payment"><span className={`owner-status owner-status-${order.paymentState}`}>{stateLabel(order.paymentState)}</span></td>
        <td data-label="Status"><span className="owner-type">{stateLabel(order.merchandiseFulfillment || order.fulfillmentState)}</span></td>
        <td data-label="Details"><Link className="admin-button admin-button-secondary owner-open-order" to={`/admin/orders/${order.id || order._id}`}>View<span className="storefront-sr-only"> order #{order.orderNumber}</span></Link></td>
      </tr>)}</tbody></table>
  </div>;
}
