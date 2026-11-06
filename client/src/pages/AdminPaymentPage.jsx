import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Banknote } from 'lucide-react';
import AdminLayout from '../admin/AdminLayout.jsx';
import { OwnerQueryState } from './AdminDashboardPage.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { getWebsiteAdmin } from '../services/website.js';
export default function AdminPaymentPage() {
  const session = useSession();
  const query = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-payment-settings'), queryFn: ({ signal }) => getWebsiteAdmin('payment-settings', undefined, signal), retry: false });
  const summary = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-dashboard'), queryFn: ({ signal }) => getWebsiteAdmin('dashboard', undefined, signal), retry: false, staleTime: 0 });
  return <AdminLayout title="Payment" description="Review incoming payments and the methods available to your customers.">
    <section className="owner-payment-review"><div><p className="admin-eyebrow">Payment review</p><h2>{summary.data ? `${summary.data.paymentReview} payments awaiting verification` : 'Payments awaiting verification'}</h2><p>Open the order, view its private proof and verify the actual funds received.</p></div><Link className="admin-button" to="/admin/orders?view=verification">Review payments</Link></section>
    <OwnerQueryState query={query} label="payment settings"/><OwnerQueryState query={summary} label="payment summary"/>
    {query.data && <><div className="owner-analytics-grid">{query.data.methods.map(method => <section className="owner-workspace owner-payment-method" key={method.key}>{method.key === 'cod' ? <Banknote size={28} aria-hidden="true"/> : <CreditCard size={28} aria-hidden="true"/>}<h2>{method.name}</h2>{method.transferNumber && <p className="owner-payment-destination">{method.transferNumber}</p>}<p>{method.key === 'cod' ? 'Record collection only after the cash is received.' : 'Confirm the transfer in the receiving account. A proof image alone does not confirm payment.'}</p><span className="owner-type">Manual verification</span></section>)}</div>
      <section className="owner-workspace"><div className="owner-section-heading"><h2>Payment availability</h2></div><dl className="owner-settings-list"><div><dt>Website checkout</dt><dd>{query.data.checkoutEnabled ? 'Available' : 'Paused'}</dd></div><div><dt>Custom quotation requests</dt><dd>{query.data.customRequestsEnabled ? 'Open' : 'Paused'}</dd></div><div><dt>Settings</dt><dd>Read only · contact your operator to change availability</dd></div></dl><p>Engraving payment requires physical item inspection and customer acceptance of the final design. Delivery and additional charges are confirmed and accepted on each order.</p></section></>}
  </AdminLayout>;
}
