import { toast } from 'sonner';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { commerceGet, commercePost, commerceError } from '../commerce/api.js';
import { useEngravingDraft } from './EngravingDraftProvider.jsx';
import { imageRatio } from './visual/VisualEngravingEditor.jsx';
import { loadPrivateVisualAsset } from './visual/private-assets.js';
import { designReadiness, fitLayer } from './visual/design.mjs';
import { visualSpecification } from './visual/specification.mjs';
import { engravingFileEntries } from '../../../shared/engraving/definitions.mjs';

export default function useStandaloneVisualBuilder(saved, editId) {
  const session = useSession(), cart = useCart(), state = useEngravingDraft();
  const { draft, setDraft, attempt, cache, ownerKey, pending, setPending } = state;
  const [page, setPage] = useState(1), [types, setTypes] = useState([]), [hydrating, setHydrating] = useState(Boolean(saved)), [error, setError] = useState(''), [progress] = useState('');
  const [quote, setQuote] = useState(null), [ready, setReady] = useState(false), [quoteRetry, setQuoteRetry] = useState(0), [added, setAdded] = useState(false), [acceptedOrder, setAcceptedOrder] = useState(null), [recovering, setRecovering] = useState(false);
  const scope = `tw-engraving-add:${cart.checkoutOwnerKey || ownerKey}`;
  const [uncertain, setUncertain] = useState(() => { try { return JSON.parse(sessionStorage.getItem(scope))?.pending === true; } catch { return false; } });
  const alive = useRef(true), requests = useRef(new AbortController()), selection = useRef(0), addLock = useRef(false);
  useEffect(() => { const controller = new AbortController(); requests.current = controller; alive.current = true; return () => { alive.current = false; controller.abort(); }; }, []);
  const options = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'visual-engraving-types', page), queryFn: ({ signal }) => commerceGet('/engraving/types', { page }, signal), enabled: session.ready, retry: false, staleTime: 0 });
  useEffect(() => { if (options.data?.enabled) { setTypes(previous => [...new Map([...(page === 1 ? [] : previous), ...options.data.types].map(type => [type.typeId, type])).values()]); if (options.data.hasNext) setPage(value => value + 1); } }, [options.data, page]);
  const type = types.find(type => type.typeId === draft.typeId);
  function update(patch) { setError(''); setQuote(null); setAdded(false); setDraft(previous => ({ ...previous, ...patch })); }
  useEffect(() => {
    if (!saved || draft.replaceLineId === editId) { setHydrating(false); return; }
    const controller = new AbortController(), generation = authGeneration(); setHydrating(true);
    async function load() {
      const spec = saved.specification, assets = {}, missing = [];
      await Promise.all(engravingFileEntries(spec).map(async ([, id, role]) => {
        try { const asset = await loadPrivateVisualAsset({ uploadId: id, ownerScope: ownerKey, sessionOwnerKey: session.ownerKey, signal: controller.signal }); assets[id] = asset;
          if (!controller.signal.aborted && generation === authGeneration()) cache.current.set(asset.blob, { id, itemKey: spec.itemKey, role, ownerKey });
        } catch { missing.push(role); }
      }));
      if (controller.signal.aborted || generation !== authGeneration()) return;
      setDraft(previous => ({ ...previous, itemKey: spec.itemKey, typeId: spec.typeId, description: spec.description, placement: spec.placement, specialRequests: spec.specialRequests,
        visual: { design: spec.design, assets, itemPhotos: spec.itemPhotoUploadIds }, editorRevision: previous.editorRevision + 1, step: 0, replaceLineId: editId, replaceFingerprint: saved.editFingerprint }));
      if (missing.length) setError('Some saved photos have expired or are unavailable. Replace missing photos or remove and replace missing artwork.');
      setHydrating(false);
    }
    void load(); return () => controller.abort();
    // Hydrate a deliberately chosen saved line once, never over an active draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, editId, ownerKey, session.ownerKey]);
  const editorChange = useCallback((value, assets, readiness) => {
    setReady(readiness.ready);
    setDraft(previous => {
      const old = previous.visual;
      if (JSON.stringify(old.design) === JSON.stringify(value.design) && Object.keys(assets).length === Object.keys(old.assets).length && Object.entries(assets).every(([id, asset]) => old.assets[id] === asset)) return previous;
      return { ...previous, visual: { ...old, design: value.design, assets } };
    });
  }, [setDraft]);
  async function selectPhotos(files, role) {
    const version = ++selection.current, generation = authGeneration();
    try {
      const ratio = role === 'surface' ? await imageRatio(files[0]) : null;
      if (!alive.current || generation !== authGeneration() || version !== selection.current) return;
      setDraft(previous => {
        const visual = previous.visual, assets = { ...visual.assets }, ids = files.map(blob => { const id = crypto.randomUUID(); assets[id] = { ownerScope: ownerKey, blob }; return id; });
        return { ...previous, editorRevision: previous.editorRevision + 1, visual: { ...visual, assets,
          ...(role === 'surface' ? { design: { ...visual.design, surface: { assetId: ids[0], aspectRatio: ratio }, layers: visual.design.layers.map(layer => fitLayer(layer, ratio)) } } : { itemPhotos: [...visual.itemPhotos, ...ids].slice(0, 3) }) } };
      }); setError(''); setQuote(null);
      toast.success(role === 'surface' ? 'Surface photo selected in your draft.' : 'Item photos selected in your draft.');
    } catch { if (alive.current && generation === authGeneration()) setError('Choose a clear JPEG, PNG or WebP photo of your surface.'); }
  }
  function validate(designRequired = false) {
    if (!type) return 'Choose an available engraving type.';
    if (!draft.visual.design.surface || !draft.visual.assets[draft.visual.design.surface.assetId]) return 'Add a photo of the exact surface you want engraved.';
    if (draft.visual.itemPhotos.some(id => !draft.visual.assets[id])) return 'Replace or remove the unavailable overall item photo.';
    if (type.typeId === 'other' && !draft.description.trim()) return 'Briefly describe your item.';

    if (designRequired && (!ready || !designReadiness(draft.visual.design, { approvedFontIds: type.fontIds, availableAssetIds: Object.keys(draft.visual.assets) }).ready)) return 'Add your text or artwork and replace any missing design photos.';
    return '';
  }
  async function review() {
    const invalid = validate(true); if (invalid) { setError(invalid); return; }
    const generation = authGeneration(); setPending(true); setError('');
    try { const quoted = await commercePost('/engraving/quote', { specification: visualSpecification(draft, type) }, { signal: requests.current.signal });
      if (!alive.current || generation !== authGeneration()) return; setQuote(quoted); setDraft(previous => ({ ...previous, step: 2 }));
    } catch (caught) { if (alive.current && generation === authGeneration()) { setError(commerceError(caught)); void options.refetch(); } }
    finally { if (generation === authGeneration()) setPending(false); }
  }
  // Recover the server-reviewed price after restoring step 3. We never
  // persist a quote or its fingerprint as authoritative payment information.
  const restoredQuoteKey = useRef(null);
  useEffect(() => {
    if (state.restoring || hydrating || draft.step !== 2 || quote || !ready || !type || pending) return;
    const key = JSON.stringify([draft.itemKey, draft.typeId, draft.visual.design]);
    if (restoredQuoteKey.current === key) return;
    restoredQuoteKey.current = key;
    const controller = new AbortController(), generation = authGeneration();
    void commercePost('/engraving/quote', { specification: visualSpecification(draft, type) }, {signal: controller.signal})
      .then(result => { if (!controller.signal.aborted && alive.current && generation === authGeneration()) setQuote(result); })
      .catch(error => { if (!controller.signal.aborted && alive.current && generation === authGeneration()) setError(commerceError(error)); });
    return () => controller.abort();
    // Dependencies identify the saved selection and the readiness of its editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.restoring, hydrating, draft.itemKey, draft.typeId, draft.step, type?.typeId, ready, quote, pending, quoteRetry]);

  function remember(value) { try { sessionStorage.setItem(scope, JSON.stringify(value)); } catch { /* Only opaque recovery keys, never design content. */ } }
  async function check() {
    const generation = authGeneration(); setRecovering(true);
    try {
      let key = attempt.current?.operationKey; try { key ||= JSON.parse(sessionStorage.getItem(scope))?.key; } catch { /* Optional storage. */ }
      if (!key) throw Error('Review your cart before starting another engraving.');
      const result = await commerceGet(`/cart/operations/${key}`, undefined, requests.current.signal);
      if (!alive.current || generation !== authGeneration()) return;
      if (result.applied) { setAcceptedOrder(result.alreadyOrdered || null); setUncertain(false); remember({ key, pending: false }); setAdded(false); state.reset(); toast.success(result.alreadyOrdered ? 'Your engraving is already ordered.' : 'Engraving added to cart.', {id:'cart-update'}); await cart.refresh(); }
      else setError('This add is unconfirmed. Retry the same saved request or check again before starting another item.');
    } catch (caught) { if (alive.current && generation === authGeneration()) setError(commerceError(caught)); }
    finally { if (alive.current && generation === authGeneration()) setRecovering(false); }
  }
  async function retryLegacyAdd() {
    // Historical pre-Stage-2 uncertain requests retain their original key.
    if (!attempt.current || pending) return;
    const generation = authGeneration(); setPending(true); setError('');
    try {
      const result = await commerceGet(`/cart/operations/${attempt.current.operationKey}`);
      if (generation !== authGeneration()) return;
      const response = result.applied ? result : await cart.add(attempt.current);
      remember({key:attempt.current.operationKey,pending:false}); state.reset();
      setUncertain(false); setAcceptedOrder(response.alreadyOrdered || null);
      await cart.refresh();
    } catch (caught) { if (generation === authGeneration()) setError(commerceError(caught)); }
    finally { if (generation === authGeneration()) setPending(false); }
  }
  async function add() {
    if (pending || uncertain || addLock.current) return;
    const invalid = validate(true);
    if (invalid || !quote) { setError(invalid || 'Review the current engraving price first.'); return; }
    addLock.current = true;
    const generation = authGeneration(); setPending(true); setError('');
    try {
      await cart.enqueueCustomization('engraving_service_v2', {
        draft, type, reviewFingerprint: quote.reviewFingerprint, reviewedPiastres: quote.unitPricePiastres,
      });
      if (generation !== authGeneration()) return;
      state.reset(); setQuote(null); setAdded(false);
      toast.message('Preparing your engraving. You can continue shopping.', {id:'engraving-queued'});
    } catch (caught) { if (alive.current && generation === authGeneration()) setError(commerceError(caught)); }
    finally { addLock.current = false; if (generation === authGeneration()) setPending(false); }
  }
  const retryQuoteAfterRestore = () => { restoredQuoteKey.current = null; setError(''); setQuoteRetry(value => value + 1); };
  return { ...state, options, types, type, hydrating: hydrating || state.restoring, error, setError, progress, quote, setQuote, added, setAdded, acceptedOrder, uncertain, recovering, update, selectPhotos, validate, review, add, check, editorChange, pending, retryLegacyAdd, retryQuoteAfterRestore };
}
