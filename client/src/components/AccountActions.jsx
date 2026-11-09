import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, safePost } from '../services/api.js';
import { useSignOut } from '../auth/SignOutProvider.jsx';
import { commerceError } from '../commerce/api.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';

export default function AccountActions({ compact = false }) {
  const session = useSession();
  const signOut = useSignOut();
  const status = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'account', 'status'), queryFn: async ({ signal }) => (await api.get('/auth/account-status', { signal })).data.data, enabled: !compact && session.ready && Boolean(session.user), retry: false });
  const verify = useMutation({ mutationFn: async () => (await safePost('/auth/request-verification', {})).data.data });
  if (!session.ready || !session.user) return null;
  if (compact) return <div className="account-actions-compact"><span>Signed in as {session.user.name || 'Administrator'}</span><button type="button" className="catalog-text-button account-signout" disabled={signOut.pending} onClick={signOut.open}>{signOut.pending ? 'Signing out…' : 'Sign out'}</button></div>;
  return <section className="website-account-panel" aria-label="Account settings"><p>Signed in as {session.user.name || session.user.email}.</p><div className="website-account-actions"><Link to="/forgot-password">Reset password</Link><button className="catalog-text-button account-signout" disabled={signOut.pending} onClick={signOut.open}>{signOut.pending ? 'Signing out…' : 'Sign out'}</button></div>
    {status.data?.emailVerified ? <p>Email verified.</p> : status.data && <><p>{status.data.emailDeliveryConfigured ? 'Your email has not been verified yet.' : 'Verification email delivery has not been configured for this account.'}</p><button className="catalog-text-button" disabled={!status.data.emailDeliveryConfigured || verify.isPending || verify.isSuccess} onClick={() => verify.mutate()}>{verify.isPending ? 'Requesting…' : 'Send verification link'}</button></>}
    {verify.isSuccess && <p role="status">{verify.data.message}</p>}{verify.error && <p role="alert">{commerceError(verify.error)}</p>}
  </section>;
}
