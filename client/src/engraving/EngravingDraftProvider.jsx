import { emptyDesign } from '../../../shared/engraving/visual-design.mjs';
import { useCart } from '../commerce/CartContext.jsx';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { clearPrivateDraft, loadPrivateDraft, savePrivateDraft } from '../commerce/private-draft-store.mjs';
const Context = createContext(null);
const fresh = () => ({ itemKey: crypto.randomUUID(), visual: { design: emptyDesign(), assets: {}, itemPhotos: [] }, editorRevision: 0, step: 0, typeId: '', description: '', placement: { kind: 'help' }, mode: 'text', text: '', fontId: '', iconId: '', subtype: 'photo', requestedAppearance: 'black', specialRequests: '', files: {}, handwritingStrokes: [], replaceLineId: null, replaceFingerprint: null });
const STORAGE_ERROR = 'This design cannot be saved for refresh in the current browser. Check your available device storage.';
export function EngravingDraftProvider({ ownerKey, children }) {
  const cart = useCart();
  const scope = cart.checkoutOwnerKey;
  const previous = useRef(null);
  useEffect(() => {
    const old = previous.current;
    if (old && old !== scope) void clearPrivateDraft('engraving', old).catch(() => {});
    previous.current = scope;
  }, [scope]);
  return <OwnedDraft key={`${ownerKey}:${scope || 'checking'}`} ownerKey={scope || 'checking'} storageOwner={scope}>{children}</OwnedDraft>;
}
function OwnedDraft({ ownerKey, storageOwner, children }) {
  const [capturedOwner, setCapturedOwner] = useState(ownerKey);
  const [draft, setDraft] = useState(fresh), [pending, setPending] = useState(false);
  const [restoring, setRestoring] = useState(true), [storageError, setStorageError] = useState('');
  const attempt = useRef(null), cache = useRef(new Map());
  if (capturedOwner !== ownerKey) {
    // A guest-cart or login owner transition must not remount the entire App.
    setCapturedOwner(ownerKey); setDraft(fresh()); setPending(false); setRestoring(true);
    setStorageError(''); attempt.current = null; cache.current.clear();
  }
  useEffect(() => {
    // Editing a previously confirmed cart line has its own server-backed
    // hydration. Never replace that explicit edit with an unrelated local draft.
    if (!storageOwner) return;
    if (typeof window !== 'undefined' && window.location.pathname.includes('/laser-engraving')
      && new URLSearchParams(window.location.search).has('edit')) { setRestoring(false); return; }
    let abandoned = false;
    void loadPrivateDraft('engraving', storageOwner).then(saved => {
      if (abandoned || !saved || typeof saved !== 'object' || !saved.visual || typeof saved.visual !== 'object' || !saved.visual.design) return;
      const assets = {};
      for (const [id, asset] of Object.entries(saved.visual.assets || {})) {
        if (id.length > 100 || !(asset?.blob instanceof Blob) || asset.blob.size > 8 * 1024 * 1024) continue;
        assets[id] = { ownerScope: ownerKey, blob: asset.blob };
      }
      setDraft({ ...fresh(), ...saved, editorRevision: (saved.editorRevision || 0) + 1,
        visual: { ...saved.visual, assets } });
    }).catch(() => { if (!abandoned) setStorageError(STORAGE_ERROR); })
      .finally(() => { if (!abandoned) setRestoring(false); });
    return () => { abandoned = true; };
  }, [ownerKey, storageOwner]);
  useEffect(() => {
    if (restoring || !storageOwner) return;
    const timer = setTimeout(() => {
      void savePrivateDraft('engraving', storageOwner, { ...draft, visual: { ...draft.visual,
        // Only validated browser Blobs, never rendered DOM elements or object URLs.
        assets: Object.fromEntries(Object.entries(draft.visual.assets || {}).filter(([, a]) => a?.blob instanceof Blob)
          .map(([id, a]) => [id, { ownerScope: ownerKey, blob: a.blob }])) } })
        .then(() => setStorageError(''))
        .catch(() => setStorageError(STORAGE_ERROR));
    }, 160);
    return () => clearTimeout(timer);
  }, [draft, restoring, ownerKey, storageOwner]);
  function reset() { attempt.current = null; cache.current.clear(); setDraft(fresh());
    if (storageOwner) void clearPrivateDraft('engraving', storageOwner).catch(() => setStorageError(STORAGE_ERROR)); }
  return <Context.Provider value={{ draft, setDraft, reset, attempt, cache, ownerKey, pending, setPending,
    restoring, storageError }}>{children}</Context.Provider>;
}
export function useEngravingDraft() { return useContext(Context); }
