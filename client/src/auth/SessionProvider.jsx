import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { changeAuthentication, configureSession, refreshSession, sessionChangedElsewhere, sessionOwner, sessionSnapshot, subscribeSession } from './session.js';

const SessionContext = createContext(null);
export function SessionProvider({ children }) {
  const cache = useQueryClient();
  const session = useSyncExternalStore(subscribeSession, sessionSnapshot);
  useEffect(() => {
    let channel = null;
    try { if (typeof BroadcastChannel === 'function') channel = new BroadcastChannel('tap-wrap-session'); }
    catch { /* Storage events and focus verification remain available. */ }
    const notify = () => {
      if (channel) channel.postMessage('changed');
      else try { localStorage.setItem('tap-wrap-session-change', `${Date.now()}:${Math.random()}`); } catch { /* Focus verification still works. */ }
    };
    const focus = () => { if (sessionSnapshot().phase !== 'transition') void refreshSession(); };
    const storage = event => { if (event.key === 'tap-wrap-session-change') sessionChangedElsewhere(); };
    if (channel) channel.onmessage = sessionChangedElsewhere;
    configureSession(cache, notify);
    void refreshSession();
    window.addEventListener('focus', focus); window.addEventListener('storage', storage);
    return () => { channel?.close(); window.removeEventListener('focus', focus); window.removeEventListener('storage', storage); };
  }, [cache]);
  const ownerKey = sessionOwner(session);
  return <SessionContext.Provider value={{ ...session, ownerKey, ready: session.phase === 'ready', authenticate: changeAuthentication, refresh: refreshSession }}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is required.');
  return value;
}
