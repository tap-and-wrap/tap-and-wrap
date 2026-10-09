import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { verifyAdmin } from '../services/catalog';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import '../admin.css';
import AdminLayout from '../admin/AdminLayout.jsx';

export default function RequireAdmin({ children }) {
  const location = useLocation();
  const session = useSession();
  const user = session.user;
  const authorization = useQuery({
    queryKey: privateQueryKey(session.ownerKey, 'admin', 'authorization'),
    queryFn: ({ signal }) => verifyAdmin(signal),
    enabled: session.ready && user?.role === 'admin',
    retry: false,
    staleTime: 0,
  });
  const error = session.error || authorization.error;
  const status = error?.response?.status || error?.status;
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);

  if (session.phase === 'checking' || session.phase === 'transition' || (user?.role === 'admin' && (authorization.isPending || authorization.isFetching))) {
    return <AdminLayout title="Checking administrator access" navigation={false} busy><p role="status">Checking administrator access…</p></AdminLayout>;
  }
  if (status === 401 || (!error && !user)) {
    return (
      <AdminLayout title="Administrator sign in" navigation={false} className="admin-access-state">
        <p>Sign in with an authorized administrator account to manage the catalog.</p>
        <Link className="admin-button" to={`/login?returnTo=${returnTo}`}>Sign in</Link>
      </AdminLayout>
    );
  }
  if (status === 403 || (user && user.role !== 'admin')) {
    return <AdminLayout title="Access denied" navigation={false} className="admin-access-state"><p>This account does not have administrator permission.</p><Link to="/">Return home</Link></AdminLayout>;
  }
  if (error) {
    return (
      <AdminLayout title="Administrator access unavailable" navigation={false} className="admin-access-state">
        <p role="alert">The API could not verify your access. A running API and configured staging database are required.</p>
        <button className="admin-button" type="button" onClick={() => session.error ? session.refresh() : authorization.refetch()}>Try again</button>
      </AdminLayout>
    );
  }
  if (!authorization.isSuccess) return null;
  return children || <Outlet />;
}
