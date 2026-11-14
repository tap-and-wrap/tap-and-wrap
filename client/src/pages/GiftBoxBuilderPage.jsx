import { toast } from 'sonner';
import { StickerProof } from '../gift-box/StickerWorkspace.jsx';
import { defaultStickerPlacement } from '../../../shared/gift-box/sticker-placement.mjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil, ArrowRight, X } from 'lucide-react';
import useModalDialog from '../components/useModalDialog.js';
import { FREE_PRESENTATION,LEGACY_FREE_PRESENTATION } from '../gift-box/free-presentation.mjs';
import { BUILDER_STEPS, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { countBuilderCategories, exceedingBuilderCategories, resolveBoxCategoryLimits } from '../../../shared/gift-box/selection-limits.mjs';
import { canAdd, codePointCount, componentCanSupply, componentLabel, counts, estimateSelection, validMessage } from '../gift-box/state.mjs';
import { getCatalog, getEstimate, getGiftBoxPersonalizationOptions, getGiftBoxPersonalizationQuote } from '../gift-box/api.js';
import { commerceError, money, uploadPrivateFile } from '../commerce/api.js';
import BuilderStepper from '../gift-box/BuilderStepper.jsx';
import ConfirmRemoval from '../gift-box/ConfirmRemoval.jsx';
import { hasGiftCardMessage } from '../../../shared/gift-box/card-message.mjs';
import ArrangementCanvas from '../gift-box/ArrangementCanvas.jsx';
import Options from '../gift-box/Options.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { prepareGiftBoxCommerceConfiguration } from '../gift-box/commerce-payload.mjs';
import { giftBoxPersonalDraftSignature, giftBoxConfigurationWithPersonalization, estimateGiftBoxPersonalizationChoices, assertGiftBoxPersonalizationPriceUnchanged, verifyGiftBoxPersonalDraft } from '../gift-box/personalization-submission.mjs';

import { useGiftBoxDraft } from '../gift-box/GiftBoxDraftProvider.jsx';
import PersonalizationEditor from '../gift-box/PersonalizationEditor.jsx';

import '../gift-box/gift-box.css';

const categories = ['box', 'flower', 'plush', 'chocolate', null, 'ribbon'];
const LAST_STEP = BUILDER_STEPS.length - 1;

function ExpandedArrangement({ onClose, children }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose, restoreFocus: false });
  return createPortal(<dialog ref={dialogRef} {...dialogProps} className="gb-arrangement-dialog" aria-labelledby="gb-expanded-title"><header><h2 id="gb-expanded-title">Your gift box</h2><button type="button" data-gb-preview-control aria-label="Close expanded preview" onClick={onClose}><X size={22} aria-hidden="true"/></button></header>{children}</dialog>,document.body);
}

export default function GiftBoxBuilderPage() {
  const session = useSession();
  const cart = useCart();
  const navigateCart = useNavigate();
  const draft=useGiftBoxDraft();
  const {history,dispatch,personal,step,setStep,review,setReview,revealed,setRevealed,reached,setReached,selectedId,setSelectedId,
    printOptionsByPhoto,setPrintOptionsByPhoto,surfaceOptionsByEngraving,addingGift,setAddingGift,uploadCache,uploadIds,pendingGiftOperation,latest,setPhotoAspectRatios}=draft;
  const catalog = useQuery({ queryKey: ['gift-box', 'catalog'], queryFn: ({ signal }) => getCatalog(signal), retry: false, staleTime: 0 });
  const [notice,setNotice]=useState(''),[expanded,setExpanded]=useState(false),[removal,setRemoval]=useState(null);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setPhotoAspectRatios(catalog.data?.photoAspectRatios === true);},[catalog.data?.photoAspectRatios,setPhotoAspectRatios]);
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
  // Draft placement is safe in the browser; order conversion remains separately server-authorized.
  const study = true;
  const titleRef = useRef(null), shouldFocus = useRef(false), pageRef = useRef(null);
  const quantities = counts(state.instances);
  const publishedBoxLimits = catalog.data?.boxLimits;
  const activeLimits = resolveBoxCategoryLimits(state.boxId, publishedBoxLimits);
  const categoryCounts = countBuilderCategories(state.instances, item => getFixedComponent(item.componentId)?.category);
  const categoryOverLimit = exceedingBuilderCategories(categoryCounts, activeLimits);
  const card = components.find(item => item.category === 'gift_card');
  const personalPriceEstimate = estimateGiftBoxPersonalizationChoices({ boxId: state.boxId, personal,
    options: personalizationOptions.data?.options, printOptionsByPhoto, surfaceOptionsByEngraving });
  const photoDimensionsPending=personal.photoAspectRatios && personal.photos.some(photo=>photo.dimensionsPending);
  const cartConfigurationReady = useMemo(() => {
    if (!review || photoDimensionsPending || categoryOverLimit.length || personal.sticker.enabled && !personal.sticker.text.trim() || (personal.hasContent && personalPriceEstimate === null)) return false;
    try { return Boolean(prepareGiftBoxCommerceConfiguration(state, { cardId: card?.componentId })); }
    catch { return false; }
  }, [review, photoDimensionsPending, state, card?.componentId, categoryOverLimit.length, personal.hasContent, personalPriceEstimate, personal.sticker.enabled, personal.sticker.text]);
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
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    titleRef.current?.focus({ preventScroll: true });
  }, [step, review]);
  function navigate(next, showReview = false) {
    if (addingGift || next === step && showReview === review) return;
    shouldFocus.current = true;
    setReached(value => Math.max(value, next + (showReview ? 1 : 0)));
    setStep(next); setReview(showReview);
  }
  function requestRemoval(target) {
    if (!removal && !addingGift) setRemoval({ ...target, opener: document.activeElement });
  }
  function confirmRemoval() {
    if (!removal) return;
    if (removal.photo) personal.removePhoto(removal.id);
    else if (removal.id === 'ribbon') {
      if (state.ribbonId === removal.componentId) dispatch({ type: 'ribbon', id: null });
    } else dispatch({ type: 'remove', id: removal.id });
    setRemoval(null);
  }
  function finishAdded(signature) {
    if (!draft.isCurrent()) return;
    if (latest.current.sourceSignature === signature) draft.resetDraft();
    else { uploadCache.current.clear();pendingGiftOperation.current=null; }
    if (mounted.current) navigateCart('/cart');
  }
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
        finishAdded(sourceSignature);
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
          ownerIsCurrent: () => draft.isCurrent() && latest.current.ownerKey === ownerKey,
          draftIsCurrent: () => mounted.current && latest.current.draftSignature === signatureBefore
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
      finishAdded(sourceSignature);
    } catch (error) { if (mounted.current && draft.isCurrent()) toast.error(commerceError(error), { id: 'gift-box-error' }); }
    finally { setAddingGift(false); }
  }
  function choose(id) {
    const item = components.find(component => component.componentId === id);
    if (!item || (!draftMode && !componentCanSupply(item))) return;
    if (item.category === 'box') {
      if (id !== state.boxId) personal.resetPhotoPositions();
      dispatch({ type: 'box', id, presentationVersion:state.presentationVersion || (catalog.data?.supportedPresentationVersions?.includes(FREE_PRESENTATION) ? FREE_PRESENTATION : catalog.data?.presentationVersion === LEGACY_FREE_PRESENTATION ? LEGACY_FREE_PRESENTATION : undefined) });
      setNotice('');
    } else if (item.category === 'ribbon') {
      if (state.ribbonId === id) requestRemoval({ id: 'ribbon', componentId: id, label: componentLabel(item) });
      else dispatch({ type: 'ribbon', id });
    }
    else if (canAdd(state, id, draftMode ? undefined : item, publishedBoxLimits, { study, flexible: !draftMode })) { dispatch({ type: 'add', id, instanceId: crypto.randomUUID(), study, flexible: !draftMode, component: draftMode ? undefined : item, boxLimits: publishedBoxLimits }); setNotice(''); }
    else toast.error('This item is unavailable. Reduce the quantity or choose another item.', { id: 'gift-box-error' });
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
  }, [defaultPrint, personal.photos,setPrintOptionsByPhoto]);
  const canPurchase = catalog.data?.freePlacementCommerceEnabled && catalog.data.orderableBoxIds?.includes(state.boxId)
    && (!personal.hasContent || personalizationOptions.data?.personalizationCheckoutEnabled);
  const canvasProps = {state,components,dispatch,personal,undo:()=>dispatch({type:'undo'}),canUndo:history.past.length > 0,selectedId,onSelect:setSelectedId};
  return <main className={`gb-page gb-shopping ${review ? 'gb-final-review' : ''}`} ref={pageRef} aria-busy={catalog.isPending}>
    <h1 className="sr-only">Build your gift box</h1>
    {removal && <ConfirmRemoval target={removal} onCancel={() => setRemoval(null)} onConfirm={confirmRemoval}/>}
    {catalog.isPending ? <p role="status">Loading your choices...</p> : catalog.error ? <div className="gb-empty"><p role="alert">{commerceError(catalog.error)}</p><button className="button button-secondary" onClick={() => catalog.refetch()}>Retry choices</button></div> : <>
      <BuilderStepper step={step} reached={reached} review={review} boxSelected={Boolean(state.boxId)} onNavigate={navigate}/>
      <div className="gb-workspace">
        <section className="gb-preview" aria-label="Your gift box">
          {!expanded && <ArrangementCanvas {...canvasProps} onExpand={() => setExpanded(true)}/>}
          {expanded && <ExpandedArrangement onClose={()=>{ setExpanded(false); requestAnimationFrame(() => pageRef.current?.querySelector('.gb-expand')?.focus({ preventScroll: true })); }}><ArrangementCanvas {...canvasProps}/></ExpandedArrangement>}
        </section>
        <section className="gb-choices" aria-label="Build your gift"><header className="gb-step-intro"><p className="eyebrow">{review ? 'Made by you' : step === 0 ? 'A thoughtful beginning' : 'Make it yours'}</p><h2 ref={titleRef} tabIndex={-1}>{review ? 'Review your gift' : BUILDER_STEPS[step].title}</h2></header>
          {!review && reached > LAST_STEP && <button className="gb-return-review" type="button" onClick={() => navigate(LAST_STEP, true)}>Return to review <ArrowRight size={16} aria-hidden="true"/></button>}
          {review ? <div className="gb-review">
            <p className="gb-review-dedication">A thoughtful gift, made your way.</p>
            <ul className="gb-review-highlights"><li>{label(state.boxId)}</li>{Object.entries(quantities).map(([id,quantity])=><li key={id}>{quantity} × {label(id)}</li>)}{state.ribbonId && <li>{label(state.ribbonId)}</li>}{personal.photos.length > 0 && <li>{personal.photos.length} photo prints</li>}{personal.sticker.enabled && <li>Personalized sticker: <bdi>{personal.sticker.text}</bdi></li>}</ul>
            {personal.sticker.enabled && defaultStickerPlacement(state.boxId) && <StickerProof sticker={personal.sticker} placement={personal.sticker.placements?.[state.boxId] || defaultStickerPlacement(state.boxId)}/>}
            {personal.hasContent && personalPriceEstimate === null && <p role="alert">Personalization is unavailable or incomplete. Review your photos and sticker before adding to cart.</p>}
            {!canPurchase && <p className="gb-purchase-unavailable">Online ordering for this gift is currently unavailable.</p>}
            <div className="gb-review-edit"><h3><Pencil size={17} aria-hidden="true"/> Edit your gift</h3><div>{[['Box',0],['Contents',1],['Personalization',4],['Finishing touches',5]].map(([title,index]) => <button key={title} type="button" disabled={addingGift} onClick={() => navigate(index)}>{title}<ArrowRight size={16} aria-hidden="true"/></button>)}</div></div>
          </div> : <>
            {category && <Options draftMode={draftMode} category={category} components={options} revealed={revealed[category] || 6} onReveal={() => setRevealed(current => ({ ...current, [category]: (current[category] || 6) + 6 }))} onChoose={choose} selectedId={category === 'box' ? state.boxId : state.ribbonId} quantities={quantities} boxSelected={Boolean(state.boxId)} canAddItem={item => canAdd(state,item.componentId,item,publishedBoxLimits,{study,flexible:true})}/>}
            {step === 4 && <PersonalizationEditor boxId={state.boxId} personal={personal} options={approvedOptions} printSelections={printOptionsByPhoto} onRemovePhoto={(id,label) => requestRemoval({id,label,photo:true})} onPrintSelection={(id,value) => setPrintOptionsByPhoto(current => ({ ...current,[id]:value }))}/>}
            {step === LAST_STEP && <section className="gb-personal-section gb-finishing" aria-labelledby="gb-card-heading"><header><div><p className="eyebrow">Optional</p><h3 id="gb-card-heading">Add a gift card</h3></div><small>{componentCanSupply(card) ? money(card.pricePiastres) : 'Currently unavailable'}</small></header><div className="gb-personal-body">
              <label htmlFor="gb-card-message">Your message</label><textarea id="gb-card-message" value={state.message} dir="auto" rows={4} disabled={!componentCanSupply(card) && !state.message} aria-invalid={!validMessage(state.message)} aria-describedby="gb-card-hint" onChange={event => { if (codePointCount(event.target.value) <= 500) dispatch({ type:'message',message:event.target.value }); }}/>
              <p id="gb-card-hint" className="gb-field-hint">{!validMessage(state.message) ? 'Use up to 500 characters without unsupported control characters.' : hasGiftCardMessage(state.message) ? 'Gift card added to your gift.' : 'Leave empty to continue without a card.'}</p>
            </div></section>}
          </>}
          <details className="gb-your-gift"><summary>Your Gift <span>{state.instances.length} items{state.boxId ? ' + box' : ''}</span></summary><ul className="gb-item-list">{state.boxId && <li><span>{label(state.boxId)}</span><span>{currentEstimate ? money(currentEstimate.items?.find(item => item.componentId === state.boxId)?.lineSubtotalPiastres) : 'Pending'}</span></li>}
            {Object.entries(quantities).map(([id,quantity]) => <li key={id}><span>{label(id)} × {quantity}</span><div><button type="button" aria-label={`Remove one ${label(id)}`} onClick={() => requestRemoval({ id:state.instances.findLast(item => item.componentId === id).id, label:label(id) })}>−</button><button type="button" aria-label={`Add one ${label(id)}`} disabled={!canAdd(state,id,components.find(item => item.componentId === id),publishedBoxLimits,{study,flexible:true})} onClick={() => choose(id)}>+</button></div><span>{currentEstimate ? money(currentEstimate.items?.find(item => item.componentId === id)?.lineSubtotalPiastres) : 'Pending'}</span></li>)}
            {state.ribbonId && <li><span>{label(state.ribbonId)}</span><span>{money(components.find(item => item.componentId === state.ribbonId)?.pricePiastres)}</span></li>}
            {hasGiftCardMessage(state.message) && <li><span>Gift card</span><span>{money(card?.pricePiastres)}</span></li>}
            {personal.photos.length > 0 && <li><span>{personal.photos.length} photo prints</span><span>{photoSubtotal === null ? 'Choose print types' : money(photoSubtotal)}</span></li>}
            {personal.sticker.enabled && <li><span>Personalized sticker: <bdi>{personal.sticker.text}</bdi></span><span>{money(approvedOptions.find(option => option.optionId === personal.sticker.optionId)?.pricePiastres)}</span></li>}
          </ul></details>
          {categoryOverLimit.length > 0 && <p role="alert">Reduce the selected {categoryOverLimit.join(' / ')} quantity to continue.</p>}
          {estimate.error && <div className="gb-feedback"><p role="alert">{commerceError(estimate.error)}</p><button type="button" onClick={() => estimate.refetch()}>Retry total</button></div>}
          {unavailableSelection && <p role="alert">A selected item is unavailable. Remove it or choose a replacement.</p>}
          {notice && <p className="gb-announcement" role="status">{notice}</p>}
          <footer className="gb-purchase-bar"><div className="gb-live-total" aria-live="polite"><span>Your total</span><strong>{priceText}</strong></div><div className="gb-navigation">
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
