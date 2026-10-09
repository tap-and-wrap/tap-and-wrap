import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, safePost } from '../services/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { commerceError } from '../commerce/api.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';

export default function AccountActions({ compact = false }) {
  const navigate = useNavigate();
  const session = useSession();
  const cart = useCart();
  const status = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'account', 'status'), queryFn: async ({ signal }) => (await api.get('/auth/account-status', { signal })).data.data, enabled: !compact && session.ready && Boolean(session.user), retry: false });
  const verify = useMutation({ mutationFn: async () => (await safePost('/auth/request-verification', {})).data.data });
  const logout = useMutation({ mutationFn: () => session.authenticate('/auth/logout', {}), onSuccess: async () => {
    await cart.refresh();
    navigate('/login', { replace: true });
  } });
  if (!session.ready || !session.user) return null;
  if (compact) return <div className="account-actions-compact"><span>Signed in as {session.user.name || 'Administrator'}</span><button type="button" className="catalog-text-button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button>{logout.error && <p className="form-error" role="alert">{commerceError(logout.error)}</p>}</div>;
  return <section className="website-account-panel" aria-label="Account settings"><p>Signed in as {session.user.name || session.user.email}.</p><div className="website-account-actions"><Link to="/forgot-password">Reset password</Link><button className="catalog-text-button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button></div>
    {status.data?.emailVerified ? <p>Email verified.</p> : status.data && <><p>{status.data.emailDeliveryConfigured ? 'Your email has not been verified yet.' : 'Verification email delivery has not been configured for this account.'}</p><button className="catalog-text-button" disabled={!status.data.emailDeliveryConfigured || verify.isPending || verify.isSuccess} onClick={() => verify.mutate()}>{verify.isPending ? 'Requesting…' : 'Send verification link'}</button></>}
    {verify.isSuccess && <p role="status">{verify.data.message}</p>}{(verify.error || logout.error) && <p role="alert">{commerceError(verify.error || logout.error)}</p>}
  </section>;
}
