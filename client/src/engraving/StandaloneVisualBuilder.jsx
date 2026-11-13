import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { commerceError, money } from '../commerce/api.js';
import ImageSourceChooser from '../components/ImageSourceChooser.jsx';
import PageMetadata from '../seo/PageMetadata.jsx';
import ServiceRequestPage from '../pages/ServiceRequestPage.jsx';
import VisualEngravingEditor from './visual/VisualEngravingEditor.jsx';
import VisualDesignPreview from './visual/VisualDesignPreview.jsx';
import { FONT_REGISTRY } from '../../../shared/engraving/definitions.mjs';
import { LocalPhoto } from './StudioControls.jsx';
import useStandaloneVisualBuilder from './useStandaloneVisualBuilder.js';
import './standalone-visual.css';
import EngravingStepper from './EngravingStepper.jsx';
import { ChevronDown, X } from 'lucide-react';

const steps = ['Your Item', 'Design Your Engraving', 'Review Your Engraving'];
export default function StandaloneVisualBuilder({ saved, editId }) {
  const state = useStandaloneVisualBuilder(saved, editId), [, setParams] = useSearchParams();
  const { draft, setDraft, ownerKey, pending, options, types, type, hydrating, error, setError, progress, quote, setQuote, added, setAdded, acceptedOrder, uncertain, recovering, update, selectPhotos, validate, review, add, check, editorChange, reset, attempt } = state;
  const [editorError, setEditorError] = useState(''), alertRef = useRef(null);
  const stepStart = useRef(null), lastStep = useRef(draft.step);
  useEffect(() => {
    if (lastStep.current === draft.step) return;
    lastStep.current = draft.step;
    const frame = requestAnimationFrame(() => {
      stepStart.current?.focus({ preventScroll: true });
      stepStart.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [draft.step]);
  const shownError = error || (draft.step === 1 ? editorError : '');
  useEffect(() => { if (shownError) { alertRef.current?.focus({ preventScroll: true }); alertRef.current?.scrollIntoView({ block: 'nearest' }); } }, [shownError]);
  if (options.isPending || hydrating) return <main className="commerce-page" role="status">Opening your engraving studio...</main>;
  if (options.error) return <main className="commerce-page"><h1>Laser Engraving</h1><p role="alert">{commerceError(options.error)}</p><button onClick={() => options.refetch()}>Try again</button></main>;
  if (!options.data.enabled) return <ServiceRequestPage service="laser_engraving"/>;
  return <main className="standalone-visual-page">
    <PageMetadata title="Design Your Engraving | Tap & Wrap" description="Create an engraving on your own item." pathname="/customize/laser-engraving" indexable={false}/>
    <header className="sv-heading"><p className="eyebrow">Made personal, by you</p><h1>Your piece. Your story.</h1><p>Create something meaningful on an item you already own.</p></header>
    <div ref={stepStart} className="sv-step-start" tabIndex={-1} aria-label={steps[draft.step]}><EngravingStepper steps={steps} step={draft.step} disabled={pending || uncertain || added} onNavigate={index => { setError(''); setDraft(previous => ({ ...previous, step: index })); }}/></div>
    {shownError && <p ref={alertRef} tabIndex={-1} id="standalone-engraving-error" className="sv-error" role="alert">{shownError}</p>}
    {uncertain && <section className="commerce-notice"><h2>Check your cart addition</h2><p>Your last add is unconfirmed. Check before starting another item.</p><button disabled={recovering || pending} onClick={check}>Check add status</button>{attempt.current && <button disabled={pending} onClick={add}>Retry same add</button>}</section>}
    <fieldset className="sv-builder" disabled={pending || uncertain || added} aria-busy={pending} aria-describedby={error ? 'standalone-engraving-error' : undefined}>
      <legend className="sr-only">{steps[draft.step]}</legend>
      {draft.step === 0 && <div className="sv-item-layout"><section className="sv-item-controls"><h2>Your Item</h2><label>Engraving type<select aria-label="Engraving type" value={draft.typeId} onChange={event => update({ typeId: event.target.value, placement: { kind: 'help' } })}><option value="">Choose your item</option>{types.map(value => <option key={value.typeId} value={value.typeId}>{value.name}</option>)}</select></label>
        <div><h3>Your engraving surface <span aria-hidden="true">*</span></h3><p>The exact area you want to make personal.</p><ImageSourceChooser uploadArea helperText="Tap to choose a clear photo from your gallery or files." label={draft.visual.design.surface ? 'Replace surface photo' : 'Choose surface photo'} context="Engraving surface" inputLabel="Engraving surface photo" maxBytes={8388608} onSelect={files => selectPhotos(files, 'surface')} onError={setError}/></div>

        <details className="sv-overall"><summary><span><strong>Additional item photos</strong><small>Optional - up to 3 photos</small></span><ChevronDown size={18} aria-hidden="true"/></summary><p>Show the whole item or another angle. These are separate from your surface and artwork.</p><ImageSourceChooser uploadArea helperText="Add another angle or a view of the whole item." label="Add overall photos" inputLabel="Overall item photos" multiple maxFiles={Math.max(1, 3 - draft.visual.itemPhotos.length)} maxBytes={8388608} disabled={draft.visual.itemPhotos.length >= 3} onSelect={files => selectPhotos(files, 'overall')} onError={setError}/><div className="sv-photo-strip">{draft.visual.itemPhotos.map((id, index) => <div key={id}>{draft.visual.assets[id]?.blob ? <LocalPhoto file={draft.visual.assets[id].blob} alt={`Overall item photo ${index + 1}`}/> : <p>Photo unavailable</p>}<button type="button" onClick={() => update({ visual: { ...draft.visual, itemPhotos: draft.visual.itemPhotos.filter(value => value !== id) } })} aria-label={`Remove photo ${index + 1}`}><X size={17} aria-hidden="true"/></button></div>)}</div></details>
        <label>{type?.typeId === 'other' ? 'Describe your item' : 'About your item (optional)'}<textarea rows={2} maxLength={300} value={draft.description} onChange={event => update({ description: event.target.value })}/></label>
      </section><section className="sv-surface-preview" aria-label="Your selected surface"><VisualDesignPreview design={draft.visual.design} assets={draft.visual.assets} ownerScope={ownerKey}/></section></div>}
      <div hidden={draft.step !== 1} className="sv-editor"><VisualEngravingEditor key={`${draft.itemKey}:${draft.editorRevision}`} ownerScope={ownerKey} initialDraft={{ ownerScope: ownerKey, design: draft.visual.design }} assets={draft.visual.assets} approvedFontIds={type?.fontIds || []} surfaceControls={false} confirmReset onError={setEditorError} onChange={editorChange}/></div>
      {draft.step === 2 && <div className="sv-review-layout"><div><h2>Review Your Engraving</h2><VisualDesignPreview design={draft.visual.design} assets={draft.visual.assets} ownerScope={ownerKey} label="Your complete engraving design"/></div><section className="sv-review-details"><h3>{type?.name}, made yours</h3><dl>{draft.visual.design.layers.map(layer => <div key={layer.id}><dt>{layer.type === 'text' ? 'Text' : 'Image artwork'}</dt><dd>{layer.type === 'text' ? <><bdi>{layer.text}</bdi><br/>{FONT_REGISTRY.find(font => font.id === layer.fontId)?.language === 'ar' ? 'Arabic lettering' : 'English lettering'} · {layer.color}</> : 'Your original uploaded artwork'}</dd></div>)}</dl>{draft.description && <p>{draft.description}</p>}
        {draft.visual.itemPhotos.length > 0 && <div className="sv-photo-strip">{draft.visual.itemPhotos.map((id, index) => draft.visual.assets[id]?.blob && <LocalPhoto key={id} file={draft.visual.assets[id].blob} alt={`Overall item photo ${index + 1}`}/>)}</div>}
        <button type="button" onClick={() => setDraft(previous => ({ ...previous, step: 1 }))}>Edit Design</button></section></div>}
      <div className="sv-footer"><span>{type ? money(quote?.unitPricePiastres ?? type.pricePiastres) : 'Choose your item'}</span><div>{draft.step > 0 && <button type="button" className="button button-secondary" onClick={() => setDraft(previous => ({ ...previous, step: previous.step - 1 }))}>Back</button>}{draft.step === 0 ? <button type="button" className="button button-primary" onClick={() => { const invalid = validate(); if (invalid) setError(invalid); else update({ step: 1 }); }}>Design Your Engraving</button> : draft.step === 1 ? <button type="button" className="button button-primary" onClick={review}>Review Your Engraving</button> : <button type="button" className="button button-primary" disabled={!quote} onClick={add}>{pending ? 'Adding securely...' : 'Add to Cart'}</button>}</div></div>
    </fieldset>
    {progress && <p role="status">{progress}</p>}
    {added && <section className="sv-success" role="status"><h2>{acceptedOrder ? 'Your engraving is already ordered' : 'Your engraving is in the cart'}</h2><Link className="button button-primary" to={acceptedOrder ? `/orders/${acceptedOrder}` : '/cart'}>{acceptedOrder ? 'View accepted order' : 'View cart'}</Link><button onClick={() => { reset(); setParams({}); setAdded(false); setQuote(null); }}>Start a new engraving</button></section>}
  </main>;
}
