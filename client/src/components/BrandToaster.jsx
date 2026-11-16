import { useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { CircleCheck, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useSession } from '../auth/SessionProvider.jsx';
import './brand-toaster.css';

const top = 'calc(var(--site-header-height, 76px) + max(12px, env(safe-area-inset-top, 0px)))';
export default function BrandToaster() {
  const session = useSession();
  const lastVerifiedAccount = useRef(null);
  // The private session ownerKey includes a generation counter. Guest probes,
  // cookie recovery and cache rotation can change it without switching accounts.
  // Dismissing every toast on those changes can erase a fresh cart success toast.
  // Clear existing notifications only when a previously verified signed-in
  // account is replaced or signs out; do not clear on mount or guest refresh.
  useEffect(() => {
    if (!session.ready) return;
    const accountId = session.user?.id || session.user?._id || null;
    if (lastVerifiedAccount.current && lastVerifiedAccount.current !== accountId) toast.dismiss();
    lastVerifiedAccount.current = accountId;
  }, [session.ready, session.user?.id, session.user?._id]);
  return <Toaster style={{fontFamily:'var(--tw-font-ui)'}} position="top-center" richColors={false} visibleToasts={2} closeButton duration={5000} gap={10} offset={{top,left:16,right:16}} mobileOffset={{top,left:'max(12px, env(safe-area-inset-left, 0px))',right:'max(12px, env(safe-area-inset-right, 0px))'}} icons={{ success: <CircleCheck size={18} aria-hidden="true"/>, error: <CircleAlert size={18} aria-hidden="true"/>, info: <Info size={18} aria-hidden="true"/>, warning: <TriangleAlert size={18} aria-hidden="true"/> }} toastOptions={{ className: 'tw-toast', classNames: { title: 'tw-toast-title', description: 'tw-toast-description', closeButton: 'tw-toast-close', actionButton: 'tw-toast-action' } }}/>;
}
