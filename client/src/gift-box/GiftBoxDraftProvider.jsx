import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { sessionOwner } from '../auth/session.js';
import { useCart } from '../commerce/CartContext.jsx';
import { arrangementReducer, initialArrangement } from './state.mjs';
import { usePersonalDraft } from './usePersonalDraft.js';
import { giftBoxPersonalDraftSignature } from './personalization-submission.mjs';
import { clearPrivateDraft, loadPrivateDraft, savePrivateDraft } from '../commerce/private-draft-store.mjs';

const DraftContext = createContext(null);
const initialHistory = () => ({ present: { ...initialArrangement(), freePlacement: true }, past: [] });
const reducer = (history, action) => action.type === 'reset' ? initialHistory()
  : action.type === 'restore' ? { present: action.present, past: [] }
    : arrangementReducer(history, action);
const STORAGE_ERROR = 'Your current design is still here, but this browser could not save it for refresh. Free some device storage or use a normal browser tab.';

export function GiftBoxDraftProvider({ ownerKey, children }) {
  const cart = useCart();
  // The verified server-side cart owner is stable across a page refresh. The
  // session generation is intentionally not; using it for IndexedDB made a
  // post-login refresh lose the draft.
  const storageOwner = cart.checkoutOwnerKey;
  const previousOwner = useRef(null);
  useEffect(() => {
    const old = previousOwner.current;
    if (old && old !== storageOwner) void clearPrivateDraft('gift-box', old).catch(() => {});
    previousOwner.current = storageOwner;
  }, [storageOwner]);
  return <OwnedGiftBoxDraft key={`${ownerKey}:${storageOwner || 'checking'}`} ownerKey={ownerKey} storageOwner={storageOwner}>{children}</OwnedGiftBoxDraft>;
}
function OwnedGiftBoxDraft({ ownerKey, storageOwner, children }) {
  const [history, dispatch] = useReducer(reducer, null, initialHistory);
  const [step, setStep] = useState(0), [review, setReview] = useState(false), [revealed, setRevealed] = useState({});
  const [reached, setReached] = useState(0), [selectedId, setSelectedId] = useState(null);
  const [printOptionsByPhoto, setPrintOptionsByPhoto] = useState({});
  const [surfaceOptionsByEngraving] = useState({});
  const [photoAspectRatios, setPhotoAspectRatios] = useState(false), [addingGift, setAddingGift] = useState(false);
  const [restoring, setRestoring] = useState(true), [storageError, setStorageError] = useState('');
  const uploadCache = useRef(new Map()), uploadIds = useRef([]), pendingGiftOperation = useRef(null), active = useRef(true);
  const personal = usePersonalDraft({ freePlacement: true, photoAspectRatios, presentationVersion: history.present.presentationVersion,
    arrangementPositions: history.present.photoPositions || {}, hiddenPhotoIds: history.present.hiddenPhotoIds || [],
    onPosition: (id, position) => dispatch({ type: 'photo-move', id, position }),
    onRemovePhoto: id => dispatch({ type: 'photo-remove', id }), onRestorePhoto: id => dispatch({ type: 'photo-restore', id }) });
  const latest = useRef(null);
  const draftSignature = giftBoxPersonalDraftSignature(history.present.boxId, personal, printOptionsByPhoto, surfaceOptionsByEngraving);
  const arrangementSignature = JSON.stringify(history.present);
  latest.current = { ownerKey, draftSignature, arrangementSignature,
    sourceSignature: `${ownerKey}:${arrangementSignature}:${draftSignature}` };

  useEffect(() => {
    const cache = uploadCache.current;
    active.current = true;
    return () => { active.current = false; cache.clear(); uploadIds.current = []; pendingGiftOperation.current = null; };
  }, []);
  // Rebuild locally-owned File previews only after the current shopping owner is known.
  useEffect(() => {
    let abandoned = false;
    setRestoring(true);
    if (!storageOwner) return;
    void loadPrivateDraft('gift-box', storageOwner).then(saved => {
      if (abandoned || !saved) return;
      const arrangement = saved.arrangement;
      if (!arrangement || typeof arrangement !== 'object' || !Array.isArray(arrangement.instances) || arrangement.instances.length > 200) return;
      dispatch({ type: 'restore', present: { ...initialArrangement(), ...arrangement, freePlacement: true } });
      personal.restoreSnapshot(saved.personal);
      setStep(Number.isInteger(saved.step) ? Math.max(0, Math.min(5, saved.step)) : 0);
      setReview(saved.review === true);
      setReached(Number.isInteger(saved.reached) ? Math.max(0, Math.min(6, saved.reached)) : 0);
      setRevealed(saved.revealed && typeof saved.revealed === 'object' ? saved.revealed : {});
      setPrintOptionsByPhoto(saved.printOptionsByPhoto && typeof saved.printOptionsByPhoto === 'object' ? saved.printOptionsByPhoto : {});
    }).catch(() => { if (!abandoned) setStorageError(STORAGE_ERROR); })
      .finally(() => { if (!abandoned) setRestoring(false); });
    return () => { abandoned = true; };
    // Restoring runs once per owner-scoped provider instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, storageOwner]);
  useEffect(() => {
    if (restoring || !storageOwner) return;
    const snapshot = { arrangement: history.present, step, review, reached, revealed, printOptionsByPhoto,
      personal: personal.exportSnapshot() };
    const timer = setTimeout(() => {
      void savePrivateDraft('gift-box', storageOwner, snapshot)
        .then(() => setStorageError(''))
        .catch(() => setStorageError(STORAGE_ERROR));
    }, 160);
    return () => clearTimeout(timer);
    // The state objects below change whenever the draft changes. Method identity
    // should not trigger a new IndexedDB write on an otherwise unchanged render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, storageOwner, restoring, history.present, step, review, reached, revealed, printOptionsByPhoto,
    personal.photos, personal.sticker, personal.engravings]);

  function resetDraft() {
    personal.reset(); dispatch({ type: 'reset' }); setStep(0); setReview(false); setRevealed({});
    setReached(0); setSelectedId(null); setPrintOptionsByPhoto({});
    uploadCache.current.clear(); uploadIds.current = []; pendingGiftOperation.current = null;
    if (storageOwner) void clearPrivateDraft('gift-box', storageOwner).catch(() => setStorageError(STORAGE_ERROR));
  }
  return <DraftContext.Provider value={{ history, dispatch, personal, step, setStep, review, setReview, revealed, setRevealed,
    reached, setReached, selectedId, setSelectedId, printOptionsByPhoto, setPrintOptionsByPhoto,
    surfaceOptionsByEngraving, setPhotoAspectRatios, addingGift, setAddingGift, uploadCache, uploadIds,
    pendingGiftOperation, latest, restoring, storageError,
    isCurrent: () => active.current && sessionOwner() === ownerKey, resetDraft }}>{children}</DraftContext.Provider>;
}
export function useGiftBoxDraft() {
  const draft = useContext(DraftContext);
  if (!draft) throw new Error('Gift Box draft provider is required.');
  return draft;
}
