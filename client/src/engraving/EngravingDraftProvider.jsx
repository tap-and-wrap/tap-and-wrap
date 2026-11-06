import { useCart } from '../commerce/CartContext.jsx';
import { createContext, useContext, useRef, useState } from 'react';
const Context = createContext(null);
const fresh = () => ({ itemKey: crypto.randomUUID(), step: 0, typeId: '', description: '', placement: { kind: 'help' }, mode: 'text', text: '', fontId: '', iconId: '', subtype: 'photo', requestedAppearance: 'black', specialRequests: '', files: {}, replaceLineId: null, replaceFingerprint: null });
export function EngravingDraftProvider({ ownerKey, children }) { const cart = useCart(); const scope = `${ownerKey}:${cart.checkoutOwnerKey || 'checking'}`; return <OwnedDraft ownerKey={scope}>{children}</OwnedDraft>; }
function OwnedDraft({ ownerKey, children }) {
  const [capturedOwner,setCapturedOwner]=useState(ownerKey);
  const [draft, setDraft] = useState(fresh), [pending, setPending] = useState(false);
  const attempt = useRef(null), cache = useRef(new Map());
  // Reset only engraving state. Remounting this provider would also remount
  // unrelated login/header/routes when the initial guest-cart lookup completes.
  if(capturedOwner!==ownerKey){setCapturedOwner(ownerKey);setDraft(fresh());setPending(false);attempt.current=null;cache.current.clear();}
  function reset() { attempt.current = null; cache.current.clear(); setDraft(fresh()); }
  return <Context.Provider value={{ draft, setDraft, reset, attempt, cache, ownerKey, pending, setPending }}>{children}</Context.Provider>;
}
export function useEngravingDraft() { return useContext(Context); }
