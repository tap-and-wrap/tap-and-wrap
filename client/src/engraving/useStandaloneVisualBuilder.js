import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { commerceGet, commercePost, commerceError, uploadPrivateFile } from '../commerce/api.js';
import { useEngravingDraft } from './EngravingDraftProvider.jsx';
import { imageRatio } from './visual/VisualEngravingEditor.jsx';
import { loadPrivateVisualAsset } from './visual/private-assets.js';
import { designReadiness, fitLayer } from './visual/design.mjs';
import { visualResources, visualSpecification } from './visual/specification.mjs';
import { engravingFileEntries } from '../../../shared/engraving/definitions.mjs';

export default function useStandaloneVisualBuilder(saved, editId) {
  const session = useSession(), cart = useCart(), state = useEngravingDraft();
  const { draft, setDraft, attempt, cache, ownerKey, pending, setPending } = state;
  const [page, setPage] = useState(1), [types, setTypes] = useState([]), [hydrating, setHydrating] = useState(Boolean(saved)), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const [quote, setQuote] = useState(null), [ready, setReady] = useState(false), [added, setAdded] = useState(false), [acceptedOrder, setAcceptedOrder] = useState(null), [recovering, setRecovering] = useState(false);
  const scope = `tw-engraving-add:${cart.checkoutOwnerKey || ownerKey}`;
  const [uncertain, setUncertain] = useState(() => { try { return JSON.parse(sessionStorage.getItem(scope))?.pending === true; } catch { return false; } });
  const alive = useRef(true), requests = useRef(new AbortController()), selection = useRef(0);
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
    } catch { if (alive.current && generation === authGeneration()) setError('Choose a clear JPEG, PNG or WebP photo of your surface.'); }
  }
  function validate(designRequired = false) {
    if (!type) return 'Choose an available engraving type.';
    if (!draft.visual.design.surface || !draft.visual.assets[draft.visual.design.surface.assetId]) return 'Add a photo of the exact surface you want engraved.';
    if (draft.visual.itemPhotos.some(id => !draft.visual.assets[id])) return 'Replace or remove the unavailable overall item photo.';
    if (type.typeId === 'other' && !draft.description.trim()) return 'Briefly describe your item.';
    if (draft.placement.kind === 'selected' && !type.placements.some(value => value.id === draft.placement.placementId && value.status === 'active')) return 'Choose an available position suggestion or ask us to help.';
    if (designRequired && (!ready || !designReadiness(draft.visual.design, { approvedFontIds: type.fontIds, availableAssetIds: Object.keys(draft.visual.assets) }).ready)) return 'Add your text or artwork and replace any missing design photos.';
    return '';
  }
  async function review() {
    const invalid = validate(true); if (invalid) { setError(invalid); return; }
    const generation = authGeneration(); setPending(true); setError('');
    try { const quoted = await commercePost('/engraving/quote', { specification: visualSpecification(draft, type) }, { signal: requests.current.signal });
      if (!alive.current || generation !== authGeneration()) return; setQuote(quoted); setDraft(previous => ({ ...previous, step: 2 }));
    } catch (caught) { if (alive.current && generation === authGeneration()) { setError(commerceError(caught)); void options.refetch(); } }
    finally { if (alive.current && generation === authGeneration()) setPending(false); }
  }
  function remember(value) { try { sessionStorage.setItem(scope, JSON.stringify(value)); } catch { /* Only opaque recovery keys, never design content. */ } }
  async function check() {
    const generation = authGeneration(); setRecovering(true);
    try {
      let key = attempt.current?.operationKey; try { key ||= JSON.parse(sessionStorage.getItem(scope))?.key; } catch { /* Optional storage. */ }
      if (!key) throw Error('Review your cart before starting another engraving.');
      const result = await commerceGet(`/cart/operations/${key}`, undefined, requests.current.signal);
      if (!alive.current || generation !== authGeneration()) return;
      if (result.applied) { setAcceptedOrder(result.alreadyOrdered || null); setUncertain(false); remember({ key, pending: false }); setAdded(true); attempt.current = null; await cart.refresh(); }
      else setError('This add is unconfirmed. Retry the same saved request or check again before starting another item.');
    } catch (caught) { if (alive.current && generation === authGeneration()) setError(commerceError(caught)); }
    finally { if (alive.current && generation === authGeneration()) setRecovering(false); }
  }
  async function add() {
    if (!attempt.current) { const invalid = validate(true); if (invalid || !quote) { setError(invalid || 'Review the current engraving price first.'); return; } }
    const generation = authGeneration(); setPending(true); setError('');
    try {
      if (!attempt.current) {
        const current = await commercePost('/engraving/quote', { specification: visualSpecification(draft, type) }, { signal: requests.current.signal });
        if (current.reviewFingerprint !== quote.reviewFingerprint || current.unitPricePiastres !== quote.unitPricePiastres) throw Error('Your engraving price or options changed. Review them again before adding.');
        const uploaded = {};
        for (const { assetId, role } of visualResources(draft.visual)) {
          const file = draft.visual.assets[assetId]?.blob; if (!file) throw Error('A private photo is unavailable. Replace it before adding.');
          const cached = cache.current.get(file); let id = cached?.ownerKey === ownerKey && cached.itemKey === draft.itemKey && cached.role === role ? cached.id : null;
          if (!id) { id = await uploadPrivateFile(file, { purpose: 'engraving_service', ownerContext: cart.checkoutOwnerKey, engravingItemKey: draft.itemKey, fieldKey: role, generation, signal: requests.current.signal, onProgress: setProgress }); cache.current.set(file, { id, itemKey: draft.itemKey, role, ownerKey }); }
          uploaded[assetId] = id;
        }
        if (!alive.current || generation !== authGeneration()) return;
        attempt.current = { kind: 'engraving_service_v2', operationKey: crypto.randomUUID(), quantity: 1, specification: visualSpecification(draft, type, uploaded), reviewFingerprint: quote.reviewFingerprint,
          ...(draft.replaceLineId ? { replaceLineId: draft.replaceLineId, replaceFingerprint: draft.replaceFingerprint } : {}) };
      }
      const operationKey = attempt.current.operationKey; remember({ key: operationKey, pending: true }); setUncertain(true);
      const result = await cart.add(attempt.current);
      if (!alive.current || generation !== authGeneration()) return;
      setAcceptedOrder(result.alreadyOrdered || null); remember({ key: operationKey, pending: false }); setUncertain(false); setAdded(true); attempt.current = null;
    } catch (caught) { if (alive.current && generation === authGeneration()) { setError(commerceError(caught));
      if (caught.response && caught.response.status < 500) { setUncertain(false); remember({ pending: false }); attempt.current = null; setQuote(null); void options.refetch(); }
    } } finally { if (alive.current && generation === authGeneration()) { setPending(false); setProgress(''); } }
  }
  return { ...state, options, types, type, hydrating, error, setError, progress, quote, setQuote, added, setAdded, acceptedOrder, uncertain, recovering, update, selectPhotos, validate, review, add, check, editorChange, pending };
}
