import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../admin/AdminLayout.jsx';
import { OwnerQueryState } from './AdminDashboardPage.jsx';
import { adminDate, stateLabel } from '../admin/OrderTable.jsx';
import SegmentedControl from '../components/form/SegmentedControl.jsx';
import { getWebsiteAdmin } from '../services/website.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { money } from '../commerce/api.js';

export default function AdminAnalyticsPage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const days = ['7', '30', '90'].includes(params.get('days')) ? Number(params.get('days')) : 30;
  const query = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-analytics', days), queryFn: ({ signal }) => getWebsiteAdmin('owner-analytics', { days }, signal), retry: false, staleTime: 60000 });
  const data = query.data;
  const maxOrders = Math.max(1, ...(data?.daily || []).map(day => day.orders));
  return <AdminLayout title="Analytics" description="A clear view of orders, recorded collections and customer demand." actions={<SegmentedControl label="Reporting period" value={String(days)} onChange={days => setParams({ days })} options={[7, 30, 90].map(value => ({ value: String(value), label: `${value} days` }))}/>}>
    <OwnerQueryState query={query}/>{data && <>
      <p className="owner-period">{adminDate(data.since)} – {adminDate(data.until)} · Africa/Cairo</p>
      <div className="owner-metrics">{[['Orders placed', data.orders, 'Orders created in this period'], ['Collections recorded', money(data.collectionsPiastres), 'Actual funds recorded in this period'], ['Refunds recorded', money(data.refundsPiastres), 'Actual refunds recorded in this period'], ['Net collections', money(data.netCollectionsPiastres), 'Collections less refunds']].map(([label, value, detail]) => <div className="owner-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div>
      <p className="owner-period">Unpaid orders and engraving requests contribute no collected revenue. Collections use the date each payment or refund was recorded.</p>
      <div className="owner-analytics-grid"><section className="owner-workspace"><div className="owner-section-heading"><h2>Orders over time</h2><span>Daily · Cairo time</span></div>{data.orders > 0 ? <><div className="owner-chart" role="img" aria-label={`Daily orders from ${adminDate(data.since)} to ${adminDate(data.until)}; exact values in the table below.`}>{data.daily.map(day => <div key={day.date} className="owner-chart-column" title={`${day.date}: ${day.orders} orders`}><span style={{ height: `${day.orders / maxOrders * 100}%` }}/></div>)}</div><details className="owner-chart-data"><summary>View daily values</summary><table><thead><tr><th>Date</th><th>Orders</th></tr></thead><tbody>{data.daily.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.orders}</td></tr>)}</tbody></table></details></> : <div className="admin-empty"><h3>No orders in this period</h3><p>Choose a longer period to explore earlier activity.</p></div>}</section>
      <section className="owner-workspace"><div className="owner-section-heading"><h2>Order progress</h2></div>{data.statuses.length ? <ul className="owner-breakdown">{data.statuses.map(status => <li key={status.state}><span>{stateLabel(status.state)}</span><strong>{status.count}</strong><meter min="0" max={Math.max(1, data.orders)} value={status.count} aria-label={stateLabel(status.state)}/></li>)}</ul> : <p className="admin-empty">No statuses to report.</p>}</section></div>
      <div className="owner-analytics-grid"><section className="owner-workspace"><div className="owner-section-heading"><h2>Product demand</h2></div><p className="owner-period">Units ordered in this period, including unpaid or later cancelled orders. This measures demand, not completed sales.</p>{data.products.length ? <ol className="owner-product-performance">{data.products.map((product, index) => <li key={`${product.productId}:${index}`}><span>{product.name}</span><strong>{product.units} units</strong></li>)}</ol> : <p className="admin-empty">No product order lines in this period.</p>}</section><section className="owner-workspace"><div className="owner-section-heading"><h2>Historical payments</h2></div><p className="owner-period">Older paid orders placed in this period without a dated settlement record.</p><p className="owner-historical-total">{money(data.legacyPaidPiastres)}</p><p>Shown for reference and excluded from recorded collections. No payment date is inferred.</p></section></div>
    </>}
  </AdminLayout>;
}
