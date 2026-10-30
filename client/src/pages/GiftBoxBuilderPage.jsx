import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BUILDER_STEPS, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { countBuilderCategories, exceedingBuilderCategories, resolveBoxCategoryLimits } from '../../../shared/gift-box/selection-limits.mjs';
import { arrangementReducer, canAdd, codePointCount, componentCanSupply, componentLabel, counts, estimateSelection, initialArrangement, validMessage } from '../gift-box/state.mjs';
import { getCatalog, getEstimate } from '../gift-box/api.js';
import { commerceError, money } from '../commerce/api.js';
import ArrangementCanvas from '../gift-box/ArrangementCanvas.jsx';
import Options from '../gift-box/Options.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { prepareGiftBoxCommerceConfiguration } from '../gift-box/commerce-payload.mjs';
import { usePersonalDraft } from '../gift-box/usePersonalDraft.js';
import PersonalTouches, { PersonalPreview } from '../gift-box/PersonalTouches.jsx';
import '../gift-box/gift-box.css';

const categories = ['box', 'flower', 'plush', 'chocolate', null, 'ribbon'];
const LAST_STEP = BUILDER_STEPS.length - 1;
const descriptions = ['The beginning of something lovely. Choose the box that feels just right.', 'A little color, one rose at a time. Mix your favorites.', 'Make room for a soft-hearted companion.', 'A sweet finishing layer. Each tap adds one complete pictured retail unit.', 'Your favorite pictures and words, together in one thoughtful gift.', 'A ribbon, a few words, and a gift that feels personal.'];
export default function GiftBoxBuilderPage() {
  const session = useSession();
  const catalog = useQuery({ queryKey: ['gift-box', 'catalog'], queryFn: ({ signal }) => getCatalog(signal), retry: false, staleTime: 0 });
  const [history, dispatch] = useReducer(arrangementReducer, null, () => ({ present: initialArrangement(), past: [] }));
  const [step, setStep] = useState(0), [revealed, setRevealed] = useState({}), [review, setReview] = useState(false);
  const [notice, setNotice] = useState('');
  const personal = usePersonalDraft();
  const state = history.present, components = catalog.data?.components || [];
  const study = import.meta.env.DEV;
  const titleRef = useRef(null), shouldFocus = useRef(false), stepsRef = useRef(null), pageRef = useRef(null);
  const quantities = counts(state.instances);
  const publishedBoxLimits = catalog.data?.boxLimits;
  const activeLimits = resolveBoxCategoryLimits(state.boxId, publishedBoxLimits);
  const categoryCounts = countBuilderCategories(state.instances, item => getFixedComponent(item.componentId)?.category);
  const categoryOverLimit = exceedingBuilderCategories(categoryCounts, activeLimits);
  const card = components.find(item => item.category === 'gift_card');
  const cartConfigurationReady = useMemo(() => {
    if (!review || categoryOverLimit.length || personal.hasContent) return false;
    try { return Boolean(prepareGiftBoxCommerceConfiguration(state, { cardId: card?.componentId })); }
    catch { return false; }
  }, [review, state, card?.componentId, categoryOverLimit.length, personal.hasContent]);
  const selectionKey = JSON.stringify(estimateSelection(state, card?.componentId));
  // Position changes leave this key unchanged: no requests are made for dragging.
  const selection = useMemo(() => JSON.parse(selectionKey), [selectionKey]);
  const selectedLines = selection ? [{ componentId: selection.boxId, quantity: 1 }, ...selection.items, ...(selection.ribbonId ? [{ componentId: selection.ribbonId, quantity: 1 }] : []), ...(selection.giftCard ? [{ componentId: selection.giftCard.componentId, quantity: 1 }] : [])] : [];
  const unavailableSelection = selectedLines.some(line => !componentCanSupply(components.find(item => item.componentId === line.componentId), line.quantity));
  const estimate = useQuery({ queryKey: ['private', session.ownerKey, 'gift-box-estimate', selection], queryFn: ({ signal }) => getEstimate(selection, signal), enabled: Boolean(selection) && !unavailableSelection, retry: false, staleTime: 0, gcTime: 0 });
  const currentEstimate = selection && !unavailableSelection && estimate.isSuccess && !estimate.isFetching ? estimate.data : null;
  const priceText = currentEstimate ? money(currentEstimate.componentSubtotalPiastres) : unavailableSelection ? 'Selection unavailable' : selection && estimate.isFetching ? 'Calculating…' : 'Awaiting estimate';
  useEffect(() => {
    if (!stepsRef.current) return undefined;
    const element = stepsRef.current;
    const observer = new ResizeObserver(() => pageRef.current?.style.setProperty('--gb-step-height', `${element.getBoundingClientRect().height}px`));
    observer.observe(element); return () => observer.disconnect();
  }, [catalog.isSuccess]);
  useEffect(() => { if (shouldFocus.current) { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); shouldFocus.current = false; } }, [step, review]);
  function navigate(next, showReview = false) { shouldFocus.current = true; setStep(next); setReview(showReview); }
  function choose(id) {
    const item = components.find(component => component.componentId === id);
    if (!componentCanSupply(item)) return;
    if (item.category === 'box') {
      dispatch({ type: 'box', id });
      setNotice(state.instances.length ? 'Box changed. Existing items are kept in the placement tray; arrange them again after reviewing the new box.' : 'Box selected.');
    } else if (item.category === 'ribbon') dispatch({ type: 'ribbon', id });
    else if (canAdd(state, id, item, publishedBoxLimits, { study })) { dispatch({ type: 'add', id, instanceId: crypto.randomUUID(), study, component: item, boxLimits: publishedBoxLimits }); setNotice(`${componentLabel(item)} added.`); }
    else setNotice(item.category === 'flower' && study ? 'No free rose position remains in this layout study, or the current selection/stock limit was reached. Move a rose or choose another box.' : 'Available stock or the current selection limit has been reached. Remove an item before adding another.');
  }
  const category = categories[step], options = components.filter(item => item.category === category);
  const label = id => componentLabel(components.find(item => item.componentId === id) || { componentId: id, category: 'item' });
  return <main className="gb-page" ref={pageRef} aria-busy={catalog.isPending}>
    <header className="gb-heading"><p className="gb-eyebrow">Made personal, by you</p><h1>Build your gift box</h1><p>A box full of little things. A gesture that means everything.</p></header>
    <div className="gb-development-note">Preview only. Arrangement fit and physical scale require review. Requests and checkout are unavailable.{import.meta.env.DEV && <> <Link to="/dev/gift-box/geometry">Geometry review</Link></>}</div>
    {categoryOverLimit.length > 0 && <p role="alert" className="gb-feedback">This box has more {categoryOverLimit.join(' / ')} items than its current reviewed limit. Remove the extra items before cart review.</p>}
    {catalog.isPending ? <p role="status">Loading your choices…</p> : catalog.error ? <div className="gb-empty"><p role="alert">{commerceError(catalog.error)}</p><button className="button button-secondary" onClick={() => catalog.refetch()}>Retry choices</button></div> : <>
      <nav className="gb-steps" ref={stepsRef} aria-label="Gift builder steps">{BUILDER_STEPS.map((item, index) => <button key={item.id} type="button" aria-current={step === index && !review ? 'step' : undefined} disabled={index > 0 && !state.boxId} onClick={() => navigate(index)}><span>{index + 1}</span><span>{item.title}</span></button>)}</nav>
      <div className="gb-mobile-summary"><span>{state.instances.length} items{state.boxId ? ' + box' : ''}</span><strong>{priceText}</strong></div>
      <div className="gb-workspace">
        <section className="gb-preview" aria-label="Your gift box"><div className="gb-preview-heading"><h2>Your arrangement</h2><span>{state.instances.length} {state.instances.length === 1 ? 'item' : 'items'}{state.boxId ? ' + box' : ''}</span></div>
          <ArrangementCanvas state={state} components={components} dispatch={dispatch} study={study}/>
          <PersonalPreview personal={personal}/>
          <div className="gb-tools"><button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length}>Undo</button><button type="button" onClick={() => dispatch({ type: 'clear' })} disabled={!state.instances.length}>Clear items</button></div>
          {study && state.boxId && <p className="gb-help">Drag an item, use its arrow keys, or select it for movement buttons. This layout study does not confirm physical fit.</p>}
          <div className="gb-price-summary" aria-live="polite"><span>Component estimate</span><strong>{priceText}</strong><small>Delivery quoted separately. Prices are checked by Tap &amp; Wrap.{personal.hasContent ? ' Local photo and engraving drafts are NOT included in this estimate.' : ''}</small></div>
          {estimate.error && <div className="gb-feedback"><p role="alert">{commerceError(estimate.error)}</p><button type="button" onClick={() => estimate.refetch()}>Retry estimate</button><button type="button" onClick={() => catalog.refetch()}>Refresh choices</button></div>}
          {unavailableSelection && <p className="gb-feedback" role="alert">A selected component is unavailable or exceeds current stock. Reduce its quantity, remove it, or choose an available replacement.</p>}
          {(state.boxId || state.instances.length > 0) && <ul className="gb-item-list">{state.boxId && <li><span>{label(state.boxId)} × 1</span><span>{currentEstimate?.items?.find(item => item.componentId === state.boxId) ? money(currentEstimate.items.find(item => item.componentId === state.boxId).lineSubtotalPiastres) : 'Pending'}</span></li>}
            {Object.entries(quantities).map(([id, quantity]) => <li key={id}><span>{label(id)} × {quantity}</span><div><button type="button" aria-label={`Remove one ${label(id)}`} onClick={() => dispatch({ type: 'remove', id: state.instances.findLast(item => item.componentId === id).id })}>−</button><button type="button" aria-label={`Add one ${label(id)}`} disabled={!canAdd(state, id, components.find(item => item.componentId === id) ?? null, publishedBoxLimits, { study })} onClick={() => choose(id)}>+</button></div><span>{currentEstimate ? money(currentEstimate.items.find(item => item.componentId === id)?.lineSubtotalPiastres) : 'Pending'}</span></li>)}
            {state.ribbonId && <li><span>{label(state.ribbonId)} × 1</span><span>{currentEstimate ? money(currentEstimate.items.find(item => item.componentId === state.ribbonId)?.lineSubtotalPiastres) : 'Pending'}</span></li>}{state.cardEnabled && <li><span>{card ? componentLabel(card) : 'Gift card'} × 1</span><span>{currentEstimate ? money(currentEstimate.items.find(item => item.componentId === card?.componentId)?.lineSubtotalPiastres) : 'Pending'}</span></li>}
          </ul>}
        </section>
        <section className="gb-choices" aria-label="Build your gift"><header className="gb-step-intro"><p className="gb-eyebrow">{review ? 'Your gift, considered' : `Step ${step + 1} of ${BUILDER_STEPS.length} · ${step === 0 ? 'Required' : 'Optional'}`}</p><h2 ref={titleRef} tabIndex={-1}>{review ? 'Review your gift' : BUILDER_STEPS[step].title}</h2>{step > 0 && step < 4 && !review && <p className="gb-help" role="status">{categoryCounts[categories[step]]} of {activeLimits[categories[step]]} {categories[step] === 'flower' ? 'flowers' : categories[step] === 'plush' ? 'plush toys' : 'chocolates'} selected for this box.</p>}<p>{review ? 'Take a moment to review your selections. This preview cannot be submitted yet.' : descriptions[step]}</p></header>
          {review ? <div className="gb-review"><p>{state.boxId ? label(state.boxId) : 'Choose a box'}</p>{Object.entries(quantities).map(([id, quantity]) => <p key={id}>{label(id)} × {quantity}</p>)}{state.ribbonId && <p>Ribbon: {label(state.ribbonId)}</p>}{state.cardEnabled && <><p>{card ? componentLabel(card) : 'Gift card'} × 1</p>{state.message && <><h3>Your message</h3><p className="gb-message">{state.message}</p></>}</>}{personal.hasContent && <><h3>Personal touches (local draft only)</h3><p>{personal.photos.length} selected photo(s); {personal.engravings.filter(line => line.text.trim()).length} engraving(s). Not uploaded or priced.</p>{personal.engravings.filter(line => line.text.trim()).map(line => <p key={line.id} className="gb-message">{line.text}</p>)}</>}<p>{cartConfigurationReady ? 'Your selections are prepared for cart review. Gift-box ordering remains unavailable while fulfillment and artwork approvals are pending.' : 'A box, ribbon and complete arrangement are required for future cart review. Gift-box ordering remains unavailable.'}</p><button className="button button-primary" disabled>Request submission unavailable</button></div> : <>
            {category && <Options category={category} components={options} revealed={revealed[category] || 12} onReveal={() => setRevealed(current => ({ ...current, [category]: (current[category] || 12) + 12 }))} onChoose={choose} selectedId={category === 'box' ? state.boxId : state.ribbonId} quantities={quantities} boxSelected={Boolean(state.boxId)} canAddItem={item => canAdd(state, item.componentId, item, publishedBoxLimits, { study })}/>}
            {step === 4 && <PersonalTouches personal={personal}/>}
            {step === LAST_STEP && <div className="gb-finishing">{state.ribbonId && <button type="button" className="button button-secondary" onClick={() => dispatch({ type: 'ribbon', id: null })}>No ribbon</button>}<label className="gb-card-toggle"><input type="checkbox" checked={state.cardEnabled} disabled={!componentCanSupply(card) && !state.cardEnabled} aria-describedby="gb-card-policy" onChange={event => dispatch({ type: 'card', enabled: event.target.checked })}/>Add a gift card{card?.displayName ? ` · ${card.displayName}` : ''}</label><p id="gb-card-policy">{componentCanSupply(card) ? `${money(card.pricePiastres)} for one card, with or without a message. Your message is optional, up to 500 characters.` : 'Gift card unavailable · price, availability, or stock needs approval.'}</p>{state.cardEnabled && <><label htmlFor="gb-card-message">Your personal message (optional)</label><textarea id="gb-card-message" value={state.message} rows={5} aria-describedby="gb-card-count gb-card-policy" aria-invalid={!validMessage(state.message)} onChange={event => { const text = event.target.value; if (codePointCount(text) <= 500) dispatch({ type: 'message', message: text }); }}/><span id="gb-card-count">{codePointCount(state.message)} / 500 characters</span>{!validMessage(state.message) && <p role="alert">Use text without unsupported control characters.</p>}</>}</div>}
          </>}
          <p className="gb-announcement" role="status">{notice}</p>
          <div className="gb-navigation">{step === 0 ? <Link className="button button-secondary" to="/customize">Back</Link> : <button type="button" className="button button-secondary" onClick={() => navigate(review ? LAST_STEP : step - 1)}>Back</button>}
            {!review && <><button type="button" className="button button-primary" disabled={!state.boxId} onClick={() => navigate(Math.min(LAST_STEP, step + 1), step === LAST_STEP)}>{step === LAST_STEP ? 'Next: Review' : 'Next'}</button>{step > 0 && <button type="button" className="gb-skip" onClick={() => navigate(Math.min(LAST_STEP, step + 1), step === LAST_STEP)}>Skip this step</button>}</>}
          </div>
        </section>
      </div>
    </>}
  </main>;
}
