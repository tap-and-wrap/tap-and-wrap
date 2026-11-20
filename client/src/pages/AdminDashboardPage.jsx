import AccountActions from '../components/AccountActions.jsx';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ShoppingBag, Wallet, CreditCard, Users, Package, TicketPercent } from 'lucide-react';
import AdminLayout from '../admin/AdminLayout.jsx';
import OrderTable, { adminDate } from '../admin/OrderTable.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { getWebsiteAdmin } from '../services/website.js';
import { commerceError } from '../commerce/api.js';

export function OwnerQueryState({ query, label = 'store activity' }) {
  if (query.isPending) return <div className="v11-admin-skeleton" role="status">Loading {label}…</div>;
  if (query.error) return <div className="admin-state" role="alert"><p>{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Retry</button></div>;
  return null;
}
export default function AdminDashboardPage() {
  const session = useSession();
  const dashboard = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-dashboard'), queryFn: ({ signal }) => getWebsiteAdmin('dashboard', undefined, signal), retry: false, staleTime: 0 });
  const analytics = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-analytics', 30), queryFn: ({ signal }) => getWebsiteAdmin('owner-analytics', { days: 30 }, signal), retry: false, staleTime: 60000 });
  const data = dashboard.data, sales = analytics.data;
  const cards = [
    { label: 'Orders', value: sales?.orders, detail: 'Placed in the last 30 days', Icon: ShoppingBag, to: '/admin/orders' },
    { label: 'Net collections', value: sales ? `EGP ${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((sales.netCollectionsPiastres || 0) / 100)}` : undefined, detail: 'Collected minus refunds · 30 days', Icon: Wallet, to: '/admin/analytics' },
    { label: 'Payment verification', value: data?.paymentReview, detail: 'Orders with proof to review', Icon: CreditCard, to: '/admin/orders?view=verification' },
    { label: 'Customers', value: data?.customers, detail: 'Registered customer accounts', Icon: Users, to: '/admin/customers' },
  ];
  return <AdminLayout title="Dashboard" description="An overview of your store, customers and orders." busy={dashboard.isPending} actions={<time className="owner-today" dateTime={new Date().toISOString()}>{adminDate(new Date(), { weekday: 'long', dateStyle: undefined, day: 'numeric', month: 'long', year: 'numeric' })}</time>}>
    <OwnerQueryState query={dashboard} label="store overview"/><OwnerQueryState query={analytics} label="sales figures"/>
    <div className="owner-metrics v11-dashboard-metrics">{cards.map(({ label, value, detail, Icon, to }) => <Link className="owner-metric" to={to} key={label}><div><span>{label}</span><Icon size={20} aria-hidden="true"/></div><strong>{value ?? '—'}</strong><small>{detail}</small></Link>)}</div>
    {sales && <p className="owner-period">Reporting period: {adminDate(sales.since)} – {adminDate(sales.until)} · Cairo time.</p>}
    <div className="v11-dashboard-grid"><section className="owner-workspace"><div className="owner-section-heading"><div><p className="admin-eyebrow">Orders</p><h2>Recent orders</h2></div><Link className="owner-text-link" to="/admin/orders">View all <ArrowUpRight size={16} aria-hidden="true"/></Link></div>{data && <OrderTable orders={data.recentOrders || []} compact/>}</section>
      <aside className="admin-panel v11-dashboard-links"><h2>Manage your store</h2><p>Everything you need to manage products and sales.</p><Link to="/admin/products"><Package size={18}/>Products and stock <ArrowUpRight size={16}/></Link><Link to="/admin/categories"><ShoppingBag size={18}/>Categories <ArrowUpRight size={16}/></Link><Link to="/admin/discounts"><TicketPercent size={18}/>Discount codes <ArrowUpRight size={16}/></Link><Link to="/admin/customers"><Users size={18}/>Customers <ArrowUpRight size={16}/></Link></aside>
    </div>
    <details className="v11-admin-settings"><summary>Account settings</summary><AccountActions compact/></details>
  </AdminLayout>;
}
