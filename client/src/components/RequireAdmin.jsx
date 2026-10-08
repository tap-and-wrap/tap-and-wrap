import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { getCurrentUser, verifyAdmin } from '../services/catalog';
import '../admin.css';

export default function RequireAdmin({ children }) {
  const location = useLocation();
  const session = useQuery({
    queryKey: ['session', 'user'],
    queryFn: ({ signal }) => getCurrentUser(signal),
    retry: false,
    staleTime: 0,
  });
  const user = session.data?.user;
  const authorization = useQuery({
    queryKey: ['session', 'admin', user?._id || user?.id],
    queryFn: ({ signal }) => verifyAdmin(signal),
    enabled: session.isSuccess && user?.role === 'admin',
    retry: false,
    staleTime: 0,
  });
  const error = session.error || authorization.error;
  const status = error?.response?.status || error?.status;
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);

  if (session.isPending || session.isFetching || (user?.role === 'admin' && (authorization.isPending || authorization.isFetching))) {
    return <main className="admin-shell"><p role="status">Checking administrator access…</p></main>;
  }
  if (status === 401 || (!error && !user)) {
    return (
      <main className="admin-shell admin-access-state">
        <h1>Administrator sign in</h1>
        <p>Sign in with an authorized administrator account to manage the catalog.</p>
        <Link className="admin-button" to={`/login?returnTo=${returnTo}`}>Sign in</Link>
      </main>
    );
  }
  if (status === 403 || (user && user.role !== 'admin')) {
    return <main className="admin-shell admin-access-state"><h1>Access denied</h1><p>This account does not have administrator permission.</p><Link to="/">Return home</Link></main>;
  }
  if (error) {
    return (
      <main className="admin-shell admin-access-state">
        <h1>Administrator access unavailable</h1>
        <p role="alert">The API could not verify your access. A running API and configured staging database are required.</p>
        <button className="admin-button" type="button" onClick={() => session.isError ? session.refetch() : authorization.refetch()}>Try again</button>
      </main>
    );
  }
  if (!authorization.isSuccess) return null;
  return children || <Outlet />;
}
