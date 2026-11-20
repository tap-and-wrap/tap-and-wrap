import { Link } from 'react-router-dom';
import AdminLayout from '../admin/AdminLayout.jsx';
import CheckoutPaymentRecovery from '../admin/CheckoutPaymentRecovery.jsx';
import { useSession } from '../auth/SessionProvider.jsx';

/** Unaccepted payment intents are not orders, settlements or verified transfers. */
export default function AdminUnacceptedTransfersPage() {
  const session = useSession();
  return <AdminLayout
    title="Unaccepted InstaPay transfers"
    description="Review issued InstaPay references that have not become accepted orders."
    actions={<Link className="admin-button admin-button-secondary" to="/admin/orders">Back to orders</Link>}
  >
    <CheckoutPaymentRecovery key={session.ownerKey} initiallyOpen />
    <p className="commerce-muted">These references are not proof of payment. Reconcile the actual receiving account before any fulfillment, refund or follow-up collection. A screenshot alone never marks an order paid.</p>
  </AdminLayout>;
}
