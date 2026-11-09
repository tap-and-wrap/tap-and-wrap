import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from './SessionProvider.jsx';
import { sessionOwner, sessionSnapshot } from './session.js';
import { useCart } from '../commerce/CartContext.jsx';
import ConfirmationDialog from '../components/ConfirmationDialog.jsx';

const SignOutContext = createContext(null);
export const useSignOut = () => useContext(SignOutContext);

// This host survives private route/cache invalidation while logout verifies the
// cookie. Account pages may unmount during that verification; the dialog must not.
export default function SignOutProvider({ children }) {
  const session = useSession(), cart = useCart(), navigate = useNavigate(), location = useLocation();
  const [target,setTarget] = useState(null), [pending,setPending] = useState(false), [error,setError] = useState('');
  const busy = useRef(false);
  useEffect(() => { if (!busy.current) { setTarget(null); setError(''); } }, [location.key]);
  useEffect(() => { if (!busy.current && target && target.ownerKey !== session.ownerKey) { setTarget(null); setError(''); } }, [session.ownerKey,target]);
  function open(event) {
    if (busy.current || !session.ready || !session.user) return;
    setError(''); setTarget({ opener:event.currentTarget, ownerKey:session.ownerKey, userId:session.user.id || session.user._id });
  }
  function close() {
    if (busy.current) return;
    const opener = target?.opener; setTarget(null); setError('');
    if (!opener?.isConnected) requestAnimationFrame(()=>document.querySelector('.account-signout')?.focus({preventScroll:true}));
  }
  async function confirm() {
    if (busy.current || !target || session.ownerKey !== target.ownerKey) return;
    busy.current=true;setPending(true);setError('');
    try {
      if (!session.ready) {
        // An uncertain response permits a read-only cookie check, never an
        // automatic replay of the logout mutation.
        await session.refresh();
        const verified=sessionSnapshot();
        if (verified.phase!=='ready') throw Error('Account verification unavailable');
        if (verified.user) {
          if ((verified.user.id || verified.user._id)!==target.userId) { setTarget(null); return; }
          setTarget(value=>({...value,ownerKey:sessionOwner(verified)}));
          setError('Your account is still signed in. Confirm sign out to try again.');return;
        }
      } else await session.authenticate('/auth/logout', {});
      await cart.refresh();setTarget(null);navigate('/login',{replace:true});
    } catch {
      const current=sessionSnapshot();
      if (current.phase==='ready' && current.user && (current.user.id || current.user._id)===target.userId) {
        setTarget(value=>({...value,ownerKey:sessionOwner(current)}));
        setError('Could not sign out. Your account is still signed in. Please try again.');
      } else if (current.phase!=='ready') {
        setTarget(value=>({...value,ownerKey:sessionOwner(current)}));
        setError('We could not confirm whether you signed out. Check your account status before trying again.');
      } else { setTarget(null); if (!current.user) navigate('/login',{replace:true}); }
    } finally { busy.current=false;setPending(false); }
  }
  return <SignOutContext.Provider value={{open,pending}}>{children}{target && <ConfirmationDialog title="Sign out of Tap & Wrap?" description="You'll need to sign in again to access your account." cancelLabel="Stay signed in" confirmLabel={session.ready ? 'Sign out' : 'Check account status'} onCancel={close} onConfirm={confirm} pending={pending} error={error} returnFocus={target.opener}/>}</SignOutContext.Provider>;
}
