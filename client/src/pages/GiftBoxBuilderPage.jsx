import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, X } from 'lucide-react';
import useModalDialog from '../components/useModalDialog.js';
import { FREE_PRESENTATION } from '../gift-box/free-presentation.mjs';
import { BUILDER_STEPS, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { countBuilderCategories, exceedingBuilderCategories, resolveBoxCategoryLimits } from '../../../shared/gift-box/selection-limits.mjs';
import { arrangementReducer, canAdd, codePointCount, componentCanSupply, componentLabel, counts, estimateSelection, initialArrangement, validMessage } from '../gift-box/state.mjs';
import { getCatalog, getEstimate, getGiftBoxPersonalizationOptions, getGiftBoxPersonalizationQuote } from '../gift-box/api.js';
import { commerceError, money, uploadPrivateFile } from '../commerce/api.js';
import ArrangementCanvas from '../gift-box/ArrangementCanvas.jsx';
import Options from '../gift-box/Options.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { prepareGiftBoxCommerceConfiguration } from '../gift-box/commerce-payload.mjs';
import { giftBoxPersonalDraftSignature, giftBoxConfigurationWithPersonalization, estimateGiftBoxPersonalizationChoices, assertGiftBoxPersonalizationPriceUnchanged, verifyGiftBoxPersonalDraft } from '../gift-box/personalization-submission.mjs';

import { usePersonalDraft } from '../gift-box/usePersonalDraft.js';
import PersonalizationEditor from '../gift-box/PersonalizationEditor.jsx';

import '../gift-box/gift-box.css';

const categories = ['box', 'flower', 'plush', 'chocolate', null, 'ribbon'];
const LAST_STEP = BUILDER_STEPS.length - 1;

function ExpandedArrangement({ onClose, children }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  return createPortal(<dialog ref={dialogRef} {...dialogProps} className="gb-arrangement-dialog" aria-labelledby="gb-expanded-title"><header><h2 id="gb-expanded-title">Your arrangement</h2><button type="button" aria-label="Close expanded preview" onClick={onClose}><X size={22}/></button></header>{children}</dialog>,document.body);
}

export default function GiftBoxBuilderPage() {
  const session = useSession();
  const cart = useCart();
  const navigateCart = useNavigate();
  const [addingGift, setAddingGift] = useState(false);
  const pendingGiftOperation = useRef(null);
  const catalog = useQuery({ queryKey: ['gift-box', 'catalog'], queryFn: ({ signal }) => getCatalog(signal), retry: false, staleTime: 0 });
  const [history, dispatch] = useReducer(arrangementReducer, null, () => ({ present: { ...initialArrangement(), freePlacement: true }, past: [] }));
  const [step, setStep] = useState(0), [revealed, setRevealed] = useState({}), [review, setReview] = useState(false);
  const [notice, setNotice] = useState('');
  const personal = usePersonalDraft({ freePlacement: true, arrangementPositions: history.present.photoPositions || {}, onPosition: (id,position) => dispatch({ type:'photo-move',id,position }), hiddenPhotoIds: history.present.hiddenPhotoIds || [], onRemovePhoto: id => dispatch({ type:'photo-remove',id }), onRestorePhoto: id => dispatch({ type:'photo-restore',id }) });
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [printOptionsByPhoto, setPrintOptionsByPhoto] = useState({});
  const [surfaceOptionsByEngraving] = useState({});
  const uploadCache = useRef(new Map());
  const uploadIds = useRef([]);
  const ownerRef = useRef(session.ownerKey);
  const personalizationOptions = useQuery({
    queryKey: ['private', session.ownerKey, 'gift-box-personalization-options'],
    queryFn: ({ signal }) => getGiftBoxPersonalizationOptions(signal),
    enabled: Boolean(session.ready && catalog.isSuccess),
    retry: false, staleTime: 30_000, gcTime: 0,
  });

  const state = history.present, components = catalog.data?.components || [];
  // Only the server can authorize Gift Box commerce. Without its approval, selections are browser-local visual drafts.
  const draftMode = false;

  const draftSignature = giftBoxPersonalDraftSignature(state.boxId, personal, printOptionsByPhoto, surfaceOptionsByEngraving);
  const latest = useRef({ ownerKey: session.ownerKey, draftSignature });
  latest.current = { ownerKey: session.ownerKey, draftSignature, arrangementSignature: JSON.stringify(state) };
  useEffect(() => {
    // Never reuse a private upload receipt or pending operation after a verified
    // account/guest session change. Abandoned receipts expire via backend TTL.
    if (ownerRef.current === session.ownerKey) return;
    ownerRef.current = session.ownerKey;
    uploadCache.current.clear(); uploadIds.current = [];
    pendingGiftOperation.current = null;
  }, [session.ownerKey]);

  // Draft placement is safe in the browser; order conversion remains separately server-authorized.
  const study = true;
  const titleRef = useRef(null), shouldFocus = useRef(false), stepsRef = useRef(null), pageRef = useRef(null);
  const quantities = counts(state.instances);
  const publishedBoxLimits = catalog.data?.boxLimits;
  const activeLimits = resolveBoxCategoryLimits(state.boxId, publishedBoxLimits);
  const categoryCounts = countBuilderCategories(state.instances, item => getFixedComponent(item.componentId)?.category);
  const categoryOverLimit = exceedingBuilderCategories(categoryCounts, activeLimits);
  const card = components.find(item => item.category === 'gift_card');
  const personalPriceEstimate = estimateGiftBoxPersonalizationChoices({ boxId: state.boxId, personal,
    options: personalizationOptions.data?.options, printOptionsByPhoto, surfaceOptionsByEngraving });
  const cartConfigurationReady = useMemo(() => {
    if (!review || categoryOverLimit.length || personal.sticker.enabled && !personal.sticker.text.trim() || (personal.hasContent && personalPriceEstimate === null)) return false;
    try { return Boolean(prepareGiftBoxCommerceConfiguration(state, { cardId: card?.componentId })); }
    catch { return false; }
  }, [review, state, card?.componentId, categoryOverLimit.length, personal.hasContent, personalPriceEstimate, personal.sticker.enabled, personal.sticker.text]);
  const selectionKey = JSON.stringify(estimateSelection(state, card?.componentId));
  // Position changes leave this key unchanged: no requests are made for dragging.
  const selection = useMemo(() => JSON.parse(selectionKey), [selectionKey]);
  const selectedLines = selection ? [{ componentId: selection.boxId, quantity: 1 }, ...selection.items, ...(selection.ribbonId ? [{ componentId: selection.ribbonId, quantity: 1 }] : []), ...(selection.giftCard ? [{ componentId: selection.giftCard.componentId, quantity: 1 }] : [])] : [];
  const unavailableSelection = !draftMode && selectedLines.some(line => !componentCanSupply(components.find(item => item.componentId === line.componentId), line.quantity));
  const estimate = useQuery({ queryKey: ['private', session.ownerKey, 'gift-box-estimate', selection], queryFn: ({ signal }) => getEstimate(selection, signal), enabled: Boolean(selection) && !unavailableSelection, retry: false, staleTime: 0, gcTime: 0 });
  const currentEstimate = selection && !unavailableSelection && estimate.isSuccess && !estimate.isFetching ? estimate.data : null;
  const combinedPiastres = currentEstimate && personalPriceEstimate !== null
    ? currentEstimate.componentSubtotalPiastres + personalPriceEstimate : null;
  const priceText = personal.hasContent && personalPriceEstimate === null ? 'Review personal touches' : Number.isSafeInteger(combinedPiastres) ? money(combinedPiastres)
    : currentEstimate ? money(currentEstimate.componentSubtotalPiastres)
      : unavailableSelection ? 'Selection unavailable' : selection && estimate.isFetching ? 'Calculating…' : 'Awaiting estimate';
  useEffect(() => {
    if (!stepsRef.current) return undefined;
    const element = stepsRef.current;
    const observer = new ResizeObserver(() => pageRef.current?.style.setProperty('--gb-step-height', `${element.getBoundingClientRect().height}px`));
    observer.observe(element); return () => observer.disconnect();
  }, [catalog.isSuccess]);
  useEffect(() => { if (shouldFocus.current) { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); shouldFocus.current = false; } }, [step, review]);
  function navigate(next, showReview = false) { shouldFocus.current = true; setStep(next); setReview(showReview); }
  async function addConfiguredGiftToCart() {
    if (addingGift || !cartConfigurationReady || !currentEstimate || !catalog.data?.freePlacementCommerceEnabled
      || !catalog.data.orderableBoxIds?.includes(state.boxId) || personal.hasContent && !personalizationOptions.data?.personalizationCheckoutEnabled) return;
    setAddingGift(true);
    setNotice('Verifying your gift box and current prices…');
    try {
      const sourceSignature = `${session.ownerKey}:${JSON.stringify(state)}:${draftSignature}`;
      if (pendingGiftOperation.current?.sourceSignature === sourceSignature) {
        // The previous response may have been lost after the server attached
        // the photos. Replay the immutable add, not its pre-attachment quote.
        await cart.addGiftBox(pendingGiftOperation.current.payload);
        pendingGiftOperation.current = null;
        navigateCart('/cart');
        return;
      }
      if (pendingGiftOperation.current) {
        // A changed design is a new operation. Its photos need fresh receipts;
        // the previous uncertain operation may already own the old attachments.
        uploadCache.current.clear();
        pendingGiftOperation.current = null;
      }
      let intent = null;
      if (personal.hasContent) {
        const signatureBefore = draftSignature, arrangementBefore = JSON.stringify(state), ownerKey = session.ownerKey;
        const result = await verifyGiftBoxPersonalDraft({ boxId: state.boxId, personal, ownerKey,
          options: personalizationOptions.data?.options, printOptionsByPhoto, surfaceOptionsByEngraving,
          uploadFile: uploadPrivateFile, quote: getGiftBoxPersonalizationQuote,
          cache: uploadCache.current, uploadedIds: uploadIds.current,
          ownerIsCurrent: () => latest.current.ownerKey === ownerKey,
          draftIsCurrent: () => latest.current.draftSignature === signatureBefore
            && latest.current.arrangementSignature === arrangementBefore,
          onProgress: message => setNotice(message),
        });
        try { assertGiftBoxPersonalizationPriceUnchanged(result.quote, personalPriceEstimate); }
        catch (error) { void personalizationOptions.refetch(); throw error; }
        intent = result.intent;
      }
      const configuration = giftBoxConfigurationWithPersonalization(state, { cardId: card?.componentId, intent });
      const signature = `${session.ownerKey}:${JSON.stringify(configuration)}`;
      if (!pendingGiftOperation.current || pendingGiftOperation.current.signature !== signature) {
        pendingGiftOperation.current = { signature, sourceSignature,
          payload: { kind: 'gift_box_v2', operationKey: crypto.randomUUID(), quantity: 1, configuration } };
      }
      await cart.addGiftBox(pendingGiftOperation.current.payload);
      pendingGiftOperation.current = null;
      navigateCart('/cart');
    } catch (error) { setNotice(commerceError(error)); }
    finally { setAddingGift(false); }
  }
  function choose(id) {
    const item = components.find(component => component.componentId === id);
    if (!item || (!draftMode && !componentCanSupply(item))) return;
    if (item.category === 'box') {
      if (id !== state.boxId) personal.resetPhotoPositions();
      dispatch({ type: 'box', id, presentationVersion:catalog.data?.presentationVersion === FREE_PRESENTATION ? FREE_PRESENTATION : undefined });
      setNotice('');
    } else if (item.category === 'ribbon') dispatch({ type: 'ribbon', id });
    else if (canAdd(state, id, draftMode ? undefined : item, publishedBoxLimits, { study, flexible: !draftMode })) { dispatch({ type: 'add', id, instanceId: crypto.randomUUID(), study, flexible: !draftMode, component: draftMode ? undefined : item, boxLimits: publishedBoxLimits }); setNotice(''); }
    else setNotice('This item is unavailable. Reduce the quantity or choose another item.');
  }
  const category = categories[step], options = components.filter(item => item.category === category);
  const label = id => componentLabel(components.find(item => item.componentId === id) || { componentId: id, category: 'item' });
  const approvedOptions = personalizationOptions.data?.options || [];
  const printOptions = approvedOptions.filter(option => option.kind === 'photo_print' && option.boxIds?.includes(state.boxId));
  const defaultPrint = printOptions.length === 1 ? printOptions[0] : null;
  const photoPrices = personal.photos.map(photo => printOptions.find(option => option.optionId === printOptionsByPhoto[photo.id])?.pricePiastres);
  const photoSubtotal = photoPrices.every(Number.isSafeInteger) ? photoPrices.reduce((sum,price) => sum + price,0) : null;
  useEffect(() => {
    if (!defaultPrint) return;
    setPrintOptionsByPhoto(current => {
      const next = { ...current }; let changed = false;
      for (const photo of personal.photos) if (!next[photo.id]) { next[photo.id] = defaultPrint.optionId; changed = true; }
      return changed ? next : current;
    });
  }, [defaultPrint, personal.photos]);
  const canPurchase = catalog.data?.freePlacementCommerceEnabled && catalog.data.orderableBoxIds?.includes(state.boxId)
    && (!personal.hasContent || personalizationOptions.data?.personalizationCheckoutEnabled);
  const canvasProps = {state,components,dispatch,personal,undo:()=>dispatch({type:'undo'}),canUndo:history.past.length > 0,selectedId,onSelect:setSelectedId};
  return <main className={`gb-page gb-shopping ${review ? 'gb-final-review' : ''}`} ref={pageRef} aria-busy={catalog.isPending}>
    <h1 className="sr-only">Build your gift box</h1>
    {catalog.isPending ? <p role="status">Loading your choices...</p> : catalog.error ? <div className="gb-empty"><p role="alert">{commerceError(catalog.error)}</p><button className="button button-secondary" onClick={() => catalog.refetch()}>Retry choices</button></div> : <>
      <nav className="gb-progress" ref={stepsRef} aria-label="Gift builder steps">{BUILDER_STEPS.map((item,index) => <button key={item.id} type="button" aria-label={item.title} title={item.title} aria-current={step === index && !review ? 'step' : undefined} disabled={index > 0 && !state.boxId} onClick={() => navigate(index)}><span className={index <= step ? 'is-complete' : ''}/><span className="sr-only">{item.title}</span></button>)}</nav>
      <div className="gb-workspace">
        <section className="gb-preview" aria-label="Your gift box"><div className="gb-preview-heading"><h2>{review ? 'Made by you' : 'Your arrangement'}</h2><button className="gb-expand" type="button" aria-label="Expand preview" aria-haspopup="dialog" aria-expanded={expanded} onClick={() => setExpanded(true)}><Maximize2 size={19} aria-hidden="true"/></button></div>
          {!expanded && <ArrangementCanvas {...canvasProps}/>}
          {expanded && <ExpandedArrangement onClose={()=>setExpanded(false)}><ArrangementCanvas {...canvasProps}/></ExpandedArrangement>}
        </section>
        <section className="gb-choices" aria-label="Build your gift"><header className="gb-step-intro"><p className="gb-progress-message">{review ? 'Ready for a final look' : `${step + 1} of ${BUILDER_STEPS.length}${step > 0 ? ' - Optional' : ''}`}</p><h2 ref={titleRef} tabIndex={-1}>{review ? 'Review your gift' : BUILDER_STEPS[step].title}</h2></header>
          {review ? <div className="gb-review">
            <p className="gb-review-dedication">A thoughtful gift, made your way.</p>
            <ul className="gb-review-highlights"><li>{label(state.boxId)}</li>{Object.entries(quantities).map(([id,quantity])=><li key={id}>{quantity} × {label(id)}</li>)}{state.ribbonId && <li>{label(state.ribbonId)}</li>}{personal.photos.length > 0 && <li>{personal.photos.length} photo prints</li>}{personal.sticker.enabled && <li>Personalized sticker: <bdi>{personal.sticker.text}</bdi></li>}</ul>
            {personal.hasContent && personalPriceEstimate === null && <p role="alert">Personalization is unavailable or incomplete. Review your photos and sticker before adding to cart.</p>}
            {!canPurchase && <p className="gb-purchase-unavailable">Online ordering for this gift is currently unavailable.</p>}
            <button className="gb-edit-gift" type="button" disabled={addingGift} onClick={()=>navigate(0)}>Edit your gift</button>
          </div> : <>
            {category && <Options draftMode={draftMode} category={category} components={options} revealed={revealed[category] || 6} onReveal={() => setRevealed(current => ({ ...current, [category]: (current[category] || 6) + 6 }))} onChoose={choose} selectedId={category === 'box' ? state.boxId : state.ribbonId} quantities={quantities} boxSelected={Boolean(state.boxId)} canAddItem={item => canAdd(state,item.componentId,item,publishedBoxLimits,{study,flexible:true})}/>}
            {step === 4 && <PersonalizationEditor boxId={state.boxId} personal={personal} options={approvedOptions} printSelections={printOptionsByPhoto} onPrintSelection={(id,value) => setPrintOptionsByPhoto(current => ({ ...current,[id]:value }))}/>}
            {step === LAST_STEP && <div className="gb-finishing">{state.ribbonId && <button type="button" className="button button-secondary" onClick={() => dispatch({ type: 'ribbon',id:null })}>No ribbon</button>}<label className="gb-card-toggle"><input type="checkbox" checked={state.cardEnabled} disabled={!componentCanSupply(card) && !state.cardEnabled} onChange={event => dispatch({ type:'card',enabled:event.target.checked })}/>Add a gift card {componentCanSupply(card) ? ` - ${money(card.pricePiastres)}` : ' - Unavailable'}</label>{state.cardEnabled && <><label htmlFor="gb-card-message">Your message (optional)</label><textarea id="gb-card-message" value={state.message} rows={3} aria-invalid={!validMessage(state.message)} onChange={event => { if (codePointCount(event.target.value) <= 500) dispatch({ type:'message',message:event.target.value }); }}/>{!validMessage(state.message) && <p role="alert">Use up to 500 characters without unsupported control characters.</p>}</>}</div>}
          </>}
          <details className="gb-your-gift"><summary>Your Gift <span>{state.instances.length} items{state.boxId ? ' + box' : ''}</span></summary><ul className="gb-item-list">{state.boxId && <li><span>{label(state.boxId)}</span><span>{currentEstimate ? money(currentEstimate.items?.find(item => item.componentId === state.boxId)?.lineSubtotalPiastres) : 'Pending'}</span></li>}
            {Object.entries(quantities).map(([id,quantity]) => <li key={id}><span>{label(id)} × {quantity}</span><div><button type="button" aria-label={`Remove one ${label(id)}`} onClick={() => dispatch({ type:'remove',id:state.instances.findLast(item => item.componentId === id).id })}>−</button><button type="button" aria-label={`Add one ${label(id)}`} disabled={!canAdd(state,id,components.find(item => item.componentId === id),publishedBoxLimits,{study,flexible:true})} onClick={() => choose(id)}>+</button></div><span>{currentEstimate ? money(currentEstimate.items?.find(item => item.componentId === id)?.lineSubtotalPiastres) : 'Pending'}</span></li>)}
            {state.ribbonId && <li><span>{label(state.ribbonId)}</span><span>{money(components.find(item => item.componentId === state.ribbonId)?.pricePiastres)}</span></li>}
            {state.cardEnabled && <li><span>Gift card</span><span>{money(card?.pricePiastres)}</span></li>}
            {personal.photos.length > 0 && <li><span>{personal.photos.length} photo prints</span><span>{photoSubtotal === null ? 'Choose print types' : money(photoSubtotal)}</span></li>}
            {personal.sticker.enabled && <li><span>Personalized sticker: <bdi>{personal.sticker.text}</bdi></span><span>{money(approvedOptions.find(option => option.optionId === personal.sticker.optionId)?.pricePiastres)}</span></li>}
          </ul></details>
          {categoryOverLimit.length > 0 && <p role="alert">Reduce the selected {categoryOverLimit.join(' / ')} quantity to continue.</p>}
          {estimate.error && <div className="gb-feedback"><p role="alert">{commerceError(estimate.error)}</p><button type="button" onClick={() => estimate.refetch()}>Retry total</button></div>}
          {unavailableSelection && <p role="alert">A selected item is unavailable. Remove it or choose a replacement.</p>}
          {notice && <p className="gb-announcement" role="status">{notice}</p>}
          <footer className="gb-purchase-bar"><div className="gb-live-total" aria-live="polite"><span>Your total</span><strong>{priceText}</strong><small>Delivery priced separately</small></div><div className="gb-navigation">
            {review ? <button className="button button-primary gb-add-gift" type="button" disabled={addingGift || !canPurchase || !cartConfigurationReady || !currentEstimate} onClick={addConfiguredGiftToCart}>{addingGift ? 'Adding your gift…' : 'Add Your Gift to Cart'}</button> : <>
            {step === 0 ? <Link className="button button-secondary" to="/customize">Back</Link> : <button type="button" className="button button-secondary" onClick={() => navigate(review ? LAST_STEP : step - 1)}>Back</button>}
            {!review && <button type="button" className="button button-primary" disabled={!state.boxId} onClick={() => navigate(Math.min(LAST_STEP,step+1),step === LAST_STEP)}>{step === LAST_STEP ? 'Next: Review' : 'Next'}</button>}
            </>}
          </div></footer>
        </section>
      </div>
    </>}
  </main>;
}
