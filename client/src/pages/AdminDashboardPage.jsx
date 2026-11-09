import AccountActions from '../components/AccountActions.jsx';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ShoppingBag, ClipboardCheck, Wallet, CreditCard, Users } from 'lucide-react';
import AdminLayout from '../admin/AdminLayout.jsx';
import OrderTable, { adminDate } from '../admin/OrderTable.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { getWebsiteAdmin } from '../services/website.js';
import { adminCommerceGet, commerceError } from '../commerce/api.js';

const flagLabels = { initial: 'Contact customer', overdue: 'Contact overdue', shipping: 'Confirm delivery', quote_preparation: 'Prepare quotation', quote_sharing: 'Share saved quotation', acceptance: 'Awaiting acceptance', payment_review: 'Review payment or refund', response: 'Respond to customer', payment_pending: 'Payment pending' };
export function OwnerQueryState({ query, label = 'store activity' }) {
  return query.isPending ? <p className="admin-state" role="status">Loading {label}…</p> : query.error ? <div className="admin-state" role="alert"><p>{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button></div> : null;
}
export function ActionCenter() {
  const session = useSession();
  const query = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'attention', 1, 'all'), queryFn: ({ signal }) => adminCommerceGet('/attention', { page: 1, view: 'all' }, signal), retry: false, staleTime: 0 });
  const orders = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-action-orders'), queryFn: ({ signal }) => adminCommerceGet('/orders', { view: 'requires_action', page: 1, limit: 5, sort: 'oldest' }, signal), retry: false, staleTime: 0 });
  const rows = [
    ...(orders.data?.orders || []).map(order => ({ kind: 'order', id: order.id || order._id, reference: order.orderNumber, customer: order.customer, task: order.actionRequired || 'Review order progress' })),
    ...(query.data?.records || []).filter(row => row.kind === 'request' && !row.orderId).slice(0, 3).map(row => ({ ...row, task: row.flags.filter(flag => flag !== 'payment_pending').map(flag => flagLabels[flag]).filter(Boolean).slice(0, 2).join(' · ') || 'Check progress' })),
  ];
  return <section className="owner-workspace owner-action-center"><div className="owner-section-heading"><div><p className="admin-eyebrow">Keep things moving</p><h2>Action center</h2></div><Link to="/admin/orders?view=requires_action" className="owner-text-link">View action queue <ArrowUpRight size={16} aria-hidden="true"/></Link></div><OwnerQueryState query={query}/>
    <OwnerQueryState query={orders} label="order tasks"/>
    {rows.length > 0 && <ul className="owner-task-list">{rows.map(row => <li key={`${row.kind}:${row.id}`}><div><strong>{row.kind === 'order' ? `Order #${row.reference}` : `Request ${row.reference}`}</strong><p>{row.customer?.name} · {row.task}</p></div><Link className="admin-button admin-button-secondary" to={row.kind === 'request' ? `/admin/orders/requests/${row.id}` : `/admin/orders/${row.id}`}>Review</Link></li>)}</ul>}
    {query.data && orders.data && !rows.length && <div className="admin-empty"><ClipboardCheck size={28} aria-hidden="true"/><h3>You’re up to date</h3><p>There is no active work in the order and quotation queue.</p></div>}
    {query.data?.pagination.pages > 1 && <Link className="owner-text-link" to="/admin/orders/attention">More contacts and quotations</Link>}
  </section>;
}
export default function AdminDashboardPage() {
  const session = useSession();
  const dashboard = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-dashboard'), queryFn: ({ signal }) => getWebsiteAdmin('dashboard', undefined, signal), retry: false, staleTime: 0 });
  const analytics = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-analytics', 30), queryFn: ({ signal }) => getWebsiteAdmin('owner-analytics', { days: 30 }, signal), retry: false, staleTime: 60000 });
  const data = dashboard.data, sales = analytics.data;
  const cards = [
    { label: 'Orders received', value: sales?.orders, detail: 'Last 30 days', icon: ShoppingBag, to: '/admin/orders' },
    { label: 'Requiring action', value: data?.actionRequired, detail: 'Open orders · all dates', icon: ClipboardCheck, to: '/admin/orders?view=requires_action' },
    { label: 'Verify payment', value: data?.paymentReview, detail: 'Proofs awaiting review · all dates', icon: CreditCard, to: '/admin/orders?view=verification' },
    { label: 'Net collections · EGP', value: sales ? new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sales.netCollectionsPiastres / 100) : undefined, detail: 'Recorded collections less refunds · 30 days', icon: Wallet, to: '/admin/analytics' },
  ];
  return <AdminLayout title="Dashboard" description={`Welcome${session.user?.name ? `, ${session.user.name.split(' ')[0]}` : ' back'}. Here’s how your store is doing.`} actions={<time className="owner-today" dateTime={new Date().toISOString()}>{adminDate(new Date(), { weekday: 'long', dateStyle: undefined, day: 'numeric', month: 'long', year: 'numeric' })}</time>} busy={dashboard.isPending}>
    <OwnerQueryState query={dashboard}/><OwnerQueryState query={analytics} label="sales summary"/>
    <div className="owner-metrics">{cards.map(({ label, value, detail, icon: Icon, to }) => <Link className="owner-metric" to={to} key={label}><div><span>{label}</span><Icon size={20} aria-hidden="true"/></div><strong>{value ?? '—'}</strong><small>{detail}</small></Link>)}</div>
    {sales && <p className="owner-period">Sales period: {adminDate(sales.since)} – {adminDate(sales.until)} · Cairo time. {sales.legacyPaidPiastres > 0 && 'Historical paid snapshots are shown separately in Analytics.'}</p>}
    <div className="owner-dashboard-grid"><section className="owner-workspace"><div className="owner-section-heading"><div><p className="admin-eyebrow">From your customers</p><h2>Recent orders</h2></div><Link className="owner-text-link" to="/admin/orders">All orders <ArrowUpRight size={16} aria-hidden="true"/></Link></div>{data && <OrderTable orders={data.recentOrders} compact/>}</section><section className="owner-customer-activity"><Users size={26} aria-hidden="true"/><p className="admin-eyebrow">Your community</p><h2>Customer activity</h2><strong>{data?.newCustomers ?? '—'}</strong><p>New accounts in the last 30 days</p><span>{data ? `${data.customers} customer accounts in total` : 'Loading accounts…'}</span><Link className="admin-button admin-button-secondary" to="/admin/customers">View customers</Link></section></div>
    <ActionCenter/>
    <section className="owner-workspace owner-account"><h2>Account settings</h2><AccountActions compact/></section>
  </AdminLayout>;
}
