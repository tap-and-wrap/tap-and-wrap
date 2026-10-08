import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, safePost } from '../services/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { commerceError } from '../commerce/api.js';

export default function AccountActions() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const cart = useCart();
  const status = useQuery({ queryKey: ['account', 'status'], queryFn: async ({ signal }) => (await api.get('/auth/account-status', { signal })).data.data, retry: false });
  const verify = useMutation({ mutationFn: async () => (await safePost('/auth/request-verification', {})).data.data });
  const logout = useMutation({ mutationFn: () => safePost('/auth/logout', {}), onSuccess: async () => {
    cache.removeQueries({ queryKey: ['account'] });
    cache.removeQueries({ queryKey: ['commerce', 'orders'] });
    cache.removeQueries({ queryKey: ['commerce', 'order'] });
    cache.removeQueries({ queryKey: ['auth'] });
    await cart.refresh();
    navigate('/login', { replace: true });
  } });
  return <section className="website-account-panel" aria-label="Account settings"><div className="website-account-actions"><Link to="/forgot-password">Reset password</Link><button className="catalog-text-button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button></div>
    {status.data?.emailVerified ? <p>Email verified.</p> : status.data && <><p>{status.data.emailDeliveryConfigured ? 'Your email has not been verified yet.' : 'Verification email delivery has not been configured for this account.'}</p><button className="catalog-text-button" disabled={!status.data.emailDeliveryConfigured || verify.isPending || verify.isSuccess} onClick={() => verify.mutate()}>{verify.isPending ? 'Requesting…' : 'Send verification link'}</button></>}
    {verify.isSuccess && <p role="status">{verify.data.message}</p>}{(verify.error || logout.error) && <p role="alert">{commerceError(verify.error || logout.error)}</p>}
  </section>;
}
