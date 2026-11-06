import { Link } from 'react-router-dom';
import { money } from '../commerce/api.js';

export const stateLabel = value => ({ awaiting_verification: 'Verify payment', awaiting_customer_item: 'Awaiting customer item', final_design_proposed: 'Awaiting design acceptance', final_design_confirmed: 'Design accepted', inspection_pending: 'Awaiting inspection', accepted: 'Accepted', engraving_in_progress: 'Engraving in progress', engraving_completed: 'Ready to return', return_arranged: 'Return arranged', return_dispatched: 'Return dispatched', returned_to_customer: 'Returned to customer', unsuitable: 'Return required', paid: 'Paid', unpaid: 'Unpaid', received: 'Received', delivered: 'Completed' }[value] || String(value || 'Not recorded').replaceAll('_', ' '));
export const adminDate = (value, options = {}) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Cairo', ...options }).format(new Date(value)) : '—';
export const typeLabel = types => types?.length > 1 ? 'Mixed' : ({ gift_box: 'Gift Box', engraving: 'Engraving', product: 'Product' }[types?.[0]] || 'Product');

export default function OrderTable({ orders, compact = false }) {
  if (!orders.length) return <div className="admin-empty"><h3>No orders here yet</h3><p>New purchases and engraving jobs will appear here.</p></div>;
  return <div className="owner-order-table" role="region" aria-label="Orders" tabIndex={0}><table><thead><tr><th scope="col">Order / Customer</th><th scope="col">Type</th>{!compact && <th scope="col">Received</th>}<th scope="col">Total</th><th scope="col">Payment</th><th scope="col">Progress</th>{!compact && <th scope="col">Next step</th>}<th scope="col"><span className="storefront-sr-only">Open order</span></th></tr></thead><tbody>{orders.map(order => <tr key={order.id || order._id}>
    <td><strong>#{order.orderNumber}</strong><small>{order.customer?.name || 'Customer'}</small></td>
    <td data-label="Type"><span className="owner-type">{typeLabel(order.itemTypes)}</span></td>
    {!compact && <td data-label="Received">{adminDate(order.createdAt)}</td>}
    <td data-label="Total" className="owner-money">{Number.isSafeInteger(order.totals?.totalPiastres ?? order.totalPiastres) ? money(order.totals?.totalPiastres ?? order.totalPiastres) : 'Not recorded'}</td>
    <td data-label="Payment"><span className={`owner-status owner-status-${order.paymentState}`}>{stateLabel(order.paymentState)}</span></td>
    <td data-label="Progress">{order.serviceStages?.length ? order.serviceStages.map(stateLabel).join(' · ') : stateLabel(order.fulfillmentState)}</td>
    {!compact && <td data-label="Next step">{order.actionRequired || 'No action required'}</td>}
    <td><Link className="admin-button admin-button-secondary owner-open-order" to={`/admin/orders/${order.id || order._id}`}>Open Order<span className="storefront-sr-only"> #{order.orderNumber}</span></Link></td>
  </tr>)}</tbody></table></div>;
}
