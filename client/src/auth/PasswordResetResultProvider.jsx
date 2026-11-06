import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from './SessionProvider.jsx';

const Context = createContext(null);

// Only public operation status survives an owner-keyed draft remount. Credentials
// stay in the explicit call's stack, never in this state, a URL or browser storage.
export function PasswordResetResultProvider({ children }) {
  const session = useSession(), location = useLocation();
  const scope = `${location.pathname}:${location.key}`;
  const [result, setResult] = useState({ scope, status: 'idle' });
  const active = useRef(null);
  if (result.scope !== scope) {
    active.current = null;
    setResult({ scope, status: 'idle' });
  }
  useEffect(() => {
    const freshLink = () => { active.current = null; setResult({ scope, status: 'idle' }); };
    window.addEventListener('hashchange', freshLink);
    return () => {
      window.removeEventListener('hashchange', freshLink);
      if (active.current?.scope === scope) active.current = null;
    };
  }, [scope]);

  async function submit(token, newPassword) {
    if (active.current || result.status !== 'idle') return;
    const operation = { scope };
    active.current = operation;
    setResult({ scope, status: 'pending' });
    try {
      const response = await session.authenticate('/auth/reset-password', { token, newPassword });
      if (response.data?.data?.passwordReset !== true || response.data?.data?.signInRequired !== true) throw new Error('Reset not confirmed.');
      if (active.current === operation) setResult({ scope, status: 'success' });
    } catch {
      // Network/auth verification failures are uncertain, never successful, and
      // must not replay a one-use mutation or retain its sensitive payload.
      if (active.current === operation) setResult({ scope, status: 'error' });
    } finally {
      if (active.current === operation) active.current = null;
    }
  }
  return <Context.Provider value={{ status: result.scope === scope ? result.status : 'idle', submit }}>{children}</Context.Provider>;
}

export function usePasswordResetResult() { return useContext(Context); }
