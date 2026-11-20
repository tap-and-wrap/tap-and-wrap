import { toast } from 'sonner';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FONT_REGISTRY } from '../../../../shared/engraving/definitions.mjs';
import ImageSourceChooser from '../../components/ImageSourceChooser.jsx';
import ConfirmationDialog from '../../components/ConfirmationDialog.jsx';
import { authGeneration } from '../../services/api.js';
import { subscribeSession } from '../../auth/session.js';
import { clamp, emptyDesign, fitLayer, layerHeight, editLayer, validateDesign, createVisualDraft, restoreVisualDraft, designReadiness, newHistory, commitHistory, undoHistory, redoHistory, MAX_LAYERS } from './design.mjs';
import './visual-editor.css';
import LetteringControls from '../LetteringControls.jsx';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Minus, Plus, Undo2, Redo2, RotateCcw, X } from 'lucide-react';

import useArtworkGestures from './useArtworkGestures.js';
import LoadingState from '../../components/LoadingState.jsx';
import { artworkMetrics, loadArtworkFont } from './text-metrics.js';

const colors = { black: '#242020', white: '#ffffff', grey: '#888888' };
const emptySources = Object.freeze({});

/** No route, upload, price, cart or browser-storage side effects. Mount under the
 * host's verified owner + cart context. New scope discards all local resources. */
export default function VisualEngravingEditor({ ownerScope, ...props }) {
  const generation = useSyncExternalStore(subscribeSession, authGeneration);
  const boundary = useRef({ ownerScope, generation });
  if (boundary.current.ownerScope !== ownerScope) boundary.current = { ownerScope, generation };
  if (boundary.current.generation !== generation) return <p role="status">Your private session changed. Open this design again.</p>;
  if (!ownerScope) return <LoadingState kind="workspace" label="Opening your private design"/>;
  return <OwnedEditor key={`${ownerScope}:${generation}`} ownerScope={ownerScope} {...props}/>;
}

function safePublicSource(asset) {
  if (asset?.approved !== true || typeof asset.src !== 'string') return '';
  // Approval belongs to the host's verified catalog DTO, never user input.
  if (/^\/(?!\/)[^\\\s]+$/.test(asset.src)) return asset.src;
  try { const url = new URL(asset.src); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function useAssetSources(assets, ownerScope) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    const urls = [], next = {};
    for (const [id, asset] of Object.entries(assets)) {
      if (asset.ownerScope === ownerScope && asset.blob instanceof Blob) { next[id] = URL.createObjectURL(asset.blob); urls.push(next[id]); }
      else if (safePublicSource(asset)) next[id] = safePublicSource(asset);
    }
    setResolved({ assets, ownerScope, sources: next });
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [assets, ownerScope]);
  const current = resolved?.assets === assets && resolved.ownerScope === ownerScope;
  return [current ? resolved.sources : emptySources, id => setResolved(value => {
    if (!value || value.assets !== assets || value.ownerScope !== ownerScope) return value;
    const sources = { ...value.sources }; delete sources[id]; return { ...value, sources };
  }), !current];
}

export async function imageRatio(file) {
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url; await image.decode();
    const ratio = image.naturalWidth / image.naturalHeight;
    if (ratio < .05 || ratio > 20) throw new Error('Choose an image with a less narrow shape.');
    return ratio;
  } finally { URL.revokeObjectURL(url); }
}

export function TextArtwork({ layer, font, appearance }) {
  // Font files are preloaded by the editor. Paint the first character with
  // the available fallback instead of hiding the SVG until a late font-load
  // effect forces an extra React paint on mobile.
  useEffect(() => { void loadArtworkFont(font.family).catch(() => {}); }, [font.family]);
  if (!layer.text) return null;
  const metrics = artworkMetrics(layer.text, font.family);
  const lines = layer.text.split('\n'), height = 1000 / layer.aspectRatio;
  const size = Math.min(1000 / (metrics.width / 100 + .2), height / (lines.length * 1.4));
  return <svg viewBox={`0 0 1000 ${height}`} aria-hidden="true" style={{ fontFamily: font.family, fill: appearance || colors[layer.color] }}><text textAnchor="middle" direction={/\p{Script=Arabic}/u.test(layer.text) ? 'rtl' : 'ltr'}>{lines.map((line, index) => <tspan key={index} x="500" y={height / 2 + (index - (lines.length - 1) / 2) * size * 1.3 + size * .28} fontSize={size}>{line || '\u00a0'}</tspan>)}</text></svg>;
}

function OwnedEditor({ ownerScope, initialDraft, assets: suppliedAssets, approvedFontIds = [], onChange, surfaceControls = true, confirmReset = false, stylesReady = true, onError }) {
  const approvedFontKey = approvedFontIds.join(',');
  const fonts = useMemo(() => FONT_REGISTRY.filter(font => approvedFontKey.split(',').includes(font.id)), [approvedFontKey]);
  const initial = useRef(null);
  if (!initial.current) {
    try { initial.current = { design: initialDraft ? restoreVisualDraft(initialDraft, ownerScope) : emptyDesign(), error: '' }; }
    catch { initial.current = { design: emptyDesign(), error: 'This saved design belongs to another session or could not be opened.' }; }
  }
  const [history, setHistory] = useState(() => newHistory(initial.current.design));
  const [preview, setPreview] = useState(null), [selected, setSelected] = useState(null), [zoom, setZoom] = useState(1), [error, setError] = useState(initial.current.error);
  const [localAssets, setLocalAssets] = useState({});
  const [resetTarget, setResetTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const textScale = useRef(null), addTextControl = useRef(null);
  const [viewBefore, setViewBefore] = useState(null);
  // Keep resource identity stable between geometry edits and expose only owned blobs.
  const assetCache = useRef({ supplied: null, local: null, value: {} });
  if (assetCache.current.supplied !== suppliedAssets || assetCache.current.local !== localAssets) assetCache.current = { supplied: suppliedAssets, local: localAssets, value: { ...suppliedAssets, ...localAssets } };
  const [sources, rejectSource] = useAssetSources(assetCache.current.value, ownerScope);
  const design = preview || history.present, layer = design.layers.find(item => item.id === selected);
  const editorRoot = useRef(null);
  const board = useRef(null), viewport = useRef(null), gesture = useRef(null), pointers = useRef(new Map()), mounted = useRef(true), selectionVersion = useRef(0), live = useRef({ design, zoom });
  live.current = { design, zoom };
  const changeHandler = useRef(onChange); changeHandler.current = onChange;
  const approvedFonts = useRef(approvedFontIds); approvedFonts.current = approvedFontIds;
  useEffect(() => { fonts.forEach(font => { void loadArtworkFont(font.family).catch(() => {}); }); }, [fonts]);
  const helpId = useId(), textId = useId();
  const textEditVersion = useRef(0);
  const errorHandler = useRef(onError); errorHandler.current = onError;
  const visibleError = error || (unsupportedError());
  function unsupportedError() { return stylesReady && design.layers.some(item => item.type === 'text' && !fonts.some(font => font.id === item.fontId)) ? 'Choose a current lettering style for the highlighted text.' : ''; }
  useEffect(() => { errorHandler.current?.(visibleError); if (error && !errorHandler.current) toast.error(error, { id: 'visual-engraving-error' }); }, [visibleError, error]);
  // Let the outside control receive its click before collapsing selection tools;
  // moving the footer between pointerdown and pointerup can swallow its action.
  useEffect(() => { const deselect = event => { if (!event.target.closest?.('dialog') && !editorRoot.current?.contains(event.target)) setSelected(null); }; document.addEventListener('click', deselect); return () => document.removeEventListener('click', deselect); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    // Metadata + memory-only resources. The host decides when/how to save using
    // an existing owned persistence contract; this editor never stores files.
    changeHandler.current?.(createVisualDraft(ownerScope, history.present), assetCache.current.value, { ...designReadiness(history.present, { approvedFontIds: approvedFonts.current, availableAssetIds: Object.keys(sources) }), ...(visibleError ? {ready:false} : {}) });
  }, [history.present, ownerScope, sources, approvedFontKey, visibleError]);
  function commit(next) {
    setPreview(null);
    try { validateDesign(next); } catch { setError('This design could not be updated. Check your text and try again.'); return; }
    setError(''); setHistory(value => commitHistory(value, next));
  }
  function patch(patchValue) { textScale.current = null; if (layer) commit(editLayer(design, layer.id, patchValue)); }
  function editText(patchValue) {
    if (!layer || layer.type !== 'text') return;
    const version = ++textEditVersion.current, id = layer.id;
    const next = { ...layer, ...patchValue };
    const oldFont = FONT_REGISTRY.find(font => font.id === layer.fontId), newFont = FONT_REGISTRY.find(font => font.id === next.fontId);
    if (textScale.current?.id !== id) {
      const old = artworkMetrics(layer.text, oldFont?.family || newFont.family);
      textScale.current = { id, em: layer.text ? layer.width * Math.min(1000 / (old.width / 100 + .2), 1000 / layer.aspectRatio / (old.lines * 1.4)) / 1000 : Math.min(layer.width / 6, .08) };
    }
    const em = textScale.current.em;
    const apply = () => {
      if (!mounted.current || version !== textEditVersion.current) return;
      const metrics = artworkMetrics(next.text, newFont.family), width = metrics.width + 20, height = metrics.lines * 140;
      commit(editLayer(live.current.design, id, { ...patchValue, width: em * width / 100, aspectRatio: clamp(width / height, .05, 40) }));
    };
    // Commit real input synchronously. Measure the currently rendered font,
    // then refine once if loading completes; older keystrokes cannot overwrite it.
    apply();
    if (!document.fonts.check(`100px "${newFont.family}"`)) void loadArtworkFont(newFont.family).then(apply).catch(() => { if (mounted.current && version === textEditVersion.current) setError('This lettering could not be loaded. Choose another style.'); });
  }
  async function selectFile(files, role) {
    const file = files[0], version = ++selectionVersion.current, generation = authGeneration();
    try {
      const aspectRatio = await imageRatio(file);
      if (!mounted.current || version !== selectionVersion.current || generation !== authGeneration()) return;
      const assetId = crypto.randomUUID(), current = live.current.design;
      setLocalAssets(value => ({ ...value, [assetId]: { ownerScope, blob: file } })); setError('');
      if (role === 'surface') {
        commit({ ...current, surface: { assetId, aspectRatio }, layers: current.layers.map(item => fitLayer(item, aspectRatio)) });
      } else {
        if (!current.surface || current.layers.length >= MAX_LAYERS) return;
        const added = fitLayer({ id: crypto.randomUUID(), type: 'image', assetId, aspectRatio, x: .5, y: .5, width: .35 }, current.surface.aspectRatio);
        commit({ ...current, layers: [...current.layers, added] }); setSelected(added.id);
      }
      toast.success(role === 'surface' ? 'Surface photo selected.' : 'Artwork selected.');
    } catch { if (mounted.current && version === selectionVersion.current && generation === authGeneration()) setError('This image could not be opened. Choose a JPEG, PNG or WebP image with a less narrow shape.'); }
  }
  function addText() {
    if (!fonts.length || !design.surface || design.layers.length >= MAX_LAYERS) return;
    const added = fitLayer({ id: crypto.randomUUID(), type: 'text', text: '', fontId: (fonts.find(font => font.language === 'en') || fonts[0]).id, color: 'black', x: .5, y: .5, width: .45, aspectRatio: 3 }, design.surface.aspectRatio);
    commit({ ...design, layers: [...design.layers, added] }); setSelected(added.id);
  }
  const artworkGesture = useArtworkGestures({ board,
    read: event => { const id = event.target.closest('[data-layer-id]')?.dataset.layerId; const item = history.present.layers.find(value => value.id === id); setSelected(item?.id || null); return item; },
    fit: value => fitLayer(value, history.present.surface.aspectRatio),
    onPreview: value => setPreview(value ? editLayer(history.present, value.id, value) : null),
    onCommit: value => commit(editLayer(history.present, value.id, value)),
  });
  function pointerDown(event) {
    if (!viewBefore) { artworkGesture.onPointerDown(event); return; }
    if (!design.surface || event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); board.current.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a,b]=[...pointers.current.values()];
      gesture.current={kind:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,midpoint:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},scrollLeft:viewport.current.scrollLeft,scrollTop:viewport.current.scrollTop};
    } else if(pointers.current.size===1) gesture.current={kind:'pan',x:event.clientX,y:event.clientY,left:viewport.current.scrollLeft,top:viewport.current.scrollTop};
  }
  function pointerMove(event) {
    if (!viewBefore) { artworkGesture.onPointerMove(event); return; }
    if(!pointers.current.has(event.pointerId))return;
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const active=gesture.current;
    if(active?.kind==='pan')viewport.current.scrollTo(active.left+active.x-event.clientX,active.top+active.y-event.clientY);
    else if(active?.kind==='pinch'&&pointers.current.size===2){const [a,b]=[...pointers.current.values()];setZoom(clamp(active.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(active.distance,1),1,3));viewport.current.scrollTo(active.scrollLeft+active.midpoint.x-(a.x+b.x)/2,active.scrollTop+active.midpoint.y-(a.y+b.y)/2);}
  }
  function pointerEnd(event) {
    if (!viewBefore) { artworkGesture.onPointerUp(event); return; }
    pointers.current.delete(event.pointerId);gesture.current=null;
    if(pointers.current.size===1){const [p]=[...pointers.current.values()];gesture.current={kind:'pan',x:p.x,y:p.y,left:viewport.current.scrollLeft,top:viewport.current.scrollTop};}
    if(board.current.hasPointerCapture(event.pointerId))board.current.releasePointerCapture(event.pointerId);
  }
  function cancelGesture() { textEditVersion.current += 1; textScale.current = null; artworkGesture.cancel(); pointers.current.clear(); gesture.current = null; setPreview(null); }
  function move(dx, dy) { if (layer) patch({ x: layer.x + dx, y: layer.y + dy }); }
  const surfaceMissing = design.surface && !sources[design.surface.assetId];
  function resetDesign() { cancelGesture(); commit({ ...design, layers: [] }); setSelected(null); setResetTarget(null); }
  return <section ref={editorRoot} className="visual-engraving" aria-label="Visual engraving editor">
    <header className="ve-heading"><div><p className="eyebrow">Make it personal</p><h2>Your engraving, your way</h2></div></header>
    <div className="ve-layout"><div className="ve-workspace">
      <div className="ve-editor-toolbar"><div className="ve-history" aria-label="Design history"><button type="button" disabled={Boolean(viewBefore) || !history.past.length || Boolean(gesture.current)} onClick={() => { cancelGesture(); setHistory(undoHistory); }} aria-label="Undo"><Undo2 size={18} aria-hidden="true"/></button><button type="button" disabled={Boolean(viewBefore) || !history.future.length || Boolean(gesture.current)} onClick={() => { cancelGesture(); setHistory(redoHistory); }} aria-label="Redo"><Redo2 size={18} aria-hidden="true"/></button><button type="button" disabled={Boolean(viewBefore) || !design.layers.length} onClick={event => confirmReset ? setResetTarget(event.currentTarget) : resetDesign()} aria-label="Reset design"><RotateCcw size={18} aria-hidden="true"/></button></div><div className="ve-view-controls">{viewBefore ? <><span>Adjusting editor view</span><button type="button" aria-label="Zoom out workspace" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}>-</button><output aria-label="Workspace zoom">{Math.round(zoom * 100)}%</output><button type="button" aria-label="Zoom in workspace" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}>+</button><button type="button" onClick={() => { setZoom(1); viewport.current.scrollTo(0, 0); }}>Fit view</button><button type="button" onClick={() => { cancelGesture(); setViewBefore(null); }}>Save view</button><button type="button" onClick={() => { cancelGesture(); setZoom(viewBefore.zoom); const { left, top } = viewBefore; requestAnimationFrame(() => viewport.current?.scrollTo(left, top)); setViewBefore(null); }}>Cancel</button></> : <button type="button" onClick={() => { cancelGesture(); setViewBefore({ zoom, left: viewport.current.scrollLeft, top: viewport.current.scrollTop }); }}>Adjust View</button>}</div></div>
      <div className={`ve-viewport ${viewBefore ? 'is-adjusting' : ''}`} ref={viewport} tabIndex={viewBefore ? 0 : undefined} aria-label="Engraving editor view"><div className="ve-scroll-space" style={{ width: `calc(min(100%, ${50 * (design.surface?.aspectRatio || 1)}svh) * ${zoom})` }}>
        <div ref={board} className="ve-board" style={{ aspectRatio: design.surface?.aspectRatio || 1 }} aria-label="Engraving surface workspace" aria-describedby={helpId} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={cancelGesture} onLostPointerCapture={event => { if (!viewBefore) artworkGesture.onLostPointerCapture(event); else if (pointers.current.has(event.pointerId)) cancelGesture(); }}>
          {sources[design.surface?.assetId] ? <img className="ve-surface" src={sources[design.surface.assetId]} alt="Engraving surface" draggable="false" onError={() => rejectSource(design.surface.assetId)}/> : <p className="ve-empty">{surfaceMissing ? 'This surface photo is unavailable. Choose or open it again.' : 'Start with a photo of your engraving surface.'}</p>}
          {design.surface && design.layers.map(item => <div key={item.id} data-layer-id={item.id} className={`ve-layer ${selected === item.id ? 'is-selected' : ''}`} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${layerHeight(item, design.surface.aspectRatio) * 100}%`, transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)` }}>
            <button type="button" className="ve-layer-target" disabled={Boolean(viewBefore)} aria-label={`Select ${item.type === 'text' ? item.text || 'text' : 'image artwork'}`} aria-pressed={selected === item.id} onClick={() => { if (!viewBefore) setSelected(item.id); }} onKeyDown={event => { if (viewBefore) return; const delta = event.shiftKey ? .05 : .01, offsets = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }; if (offsets[event.key]) { event.preventDefault(); setSelected(item.id); commit(editLayer(design, item.id, { x: item.x + offsets[event.key][0], y: item.y + offsets[event.key][1] })); } }}>
              {item.type === 'text' ? <TextArtwork layer={item} font={FONT_REGISTRY.find(font => font.id === item.fontId)}/> : sources[item.assetId] ? <img src={sources[item.assetId]} alt="" draggable="false" onError={() => rejectSource(item.assetId)}/> : <span>Open artwork again</span>}
            </button>
          </div>)}
        </div>
      </div></div>
      {layer && <fieldset className="ve-transform-controls" disabled={Boolean(viewBefore)}><legend className="sr-only">Selected artwork position and size</legend>        <div className="ve-move" role="group" aria-label="Move selected design"><button type="button" onClick={() => move(0, -.02)} aria-label="Move up" title="Move up"><ArrowUp size={20} aria-hidden="true"/></button><button type="button" onClick={() => move(-.02, 0)} aria-label="Move left" title="Move left"><ArrowLeft size={20} aria-hidden="true"/></button><button type="button" onClick={() => move(.02, 0)} aria-label="Move right" title="Move right"><ArrowRight size={20} aria-hidden="true"/></button><button type="button" onClick={() => move(0, .02)} aria-label="Move down" title="Move down"><ArrowDown size={20} aria-hidden="true"/></button></div>
        <div className="ve-actions" role="group" aria-label="Design size"><button type="button" onClick={() => patch({ width: layer.width - .04 })} aria-label="Smaller design" title="Smaller design"><Minus size={20} aria-hidden="true"/></button><button type="button" onClick={() => patch({ width: layer.width + .04 })} aria-label="Larger design" title="Larger design"><Plus size={20} aria-hidden="true"/></button></div>
</fieldset>}
      <p id={helpId} className="sr-only">{viewBefore ? 'Drag to pan or pinch to zoom. This editor view does not change the final engraving.' : 'Drag selected artwork to move. Pinch with two fingers to resize and twist to rotate. Arrow keys move the focused layer. Adjust View changes only your workspace view.'}</p>
    </div><fieldset className="ve-controls" disabled={Boolean(viewBefore)}><legend className="sr-only">Design controls</legend>
      {surfaceControls && <section aria-label="Surface photo"><h3>Your surface</h3><ImageSourceChooser uploadArea helperText="Choose a clear photo of the area to engrave." label={design.surface ? 'Replace surface photo' : 'Choose surface photo'} inputLabel="Surface photo" context="Engraving surface" maxBytes={8388608} onSelect={files => selectFile(files, 'surface')} onError={setError}/><p className="ve-help">Your surface and engraving artwork stay separate.</p></section>}
      <section aria-label="Add design"><h3>Add your design</h3><div className="ve-actions"><button type="button" disabled={!design.surface || !fonts.length || design.layers.length >= MAX_LAYERS} ref={addTextControl} onClick={addText}>Add text</button><ImageSourceChooser label="Add image artwork" inputLabel="Image artwork" context="Engraving artwork" disabled={!design.surface || design.layers.length >= MAX_LAYERS} maxBytes={8388608} onSelect={files => selectFile(files, 'artwork')} onError={setError}/></div>{!fonts.length && <p className="ve-help">Approved text styles are not available for this item.</p>}
        {design.layers.length > 0 && <div className="ve-layers" role="group" aria-label="Design layers">{design.layers.map((item, index) => <span className="ve-layer-chip" key={item.id}><button type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{index + 1}. {item.type === 'text' ? item.text.slice(0, 25) || 'Text' : 'Image artwork'}</button>{selected === item.id && <button type="button" className="ve-delete-layer" aria-label={`Delete ${item.type === 'text' ? 'text' : 'image'} layer ${index + 1}`} onClick={event => setRemoveTarget({ id: item.id, type: item.type, opener: event.currentTarget })}><X size={16} aria-hidden="true"/></button>}</span>)}</div>}

      </section>
      {layer && <section className="ve-selection" aria-label="Selected design controls">
        {layer.type === 'text' && <>{stylesReady && !fonts.some(font => font.id === layer.fontId) && <p className="form-error" role="alert">Choose a current lettering style for this text.</p>}<label htmlFor={textId}>Your text</label><textarea id={textId} dir="auto" maxLength={500} value={layer.text} onChange={event => { const text = event.target.value, eligible = fonts.filter(font => !/\p{Script=Arabic}/u.test(text) || font.language === 'ar'); if (!eligible.length) { setError('No approved Arabic style is available for this item.'); return; } setError(''); void editText({ text, fontId: eligible.some(font => font.id === layer.fontId) ? layer.fontId : eligible[0].id }); }}/><LetteringControls text={layer.text} fontId={layer.fontId} color={layer.color} fontIds={approvedFontIds} onChange={value => value.fontId ? void editText(value) : patch(value)}/></>}
      </section>}

    </fieldset></div>
    {removeTarget && <ConfirmationDialog title={`Remove ${removeTarget.type === 'text' ? 'text' : 'image artwork'}?`} description="Only this layer will be removed. You can undo the change." returnFocus={removeTarget.opener} onCancel={() => setRemoveTarget(null)} onConfirm={() => { cancelGesture(); commit({ ...live.current.design, layers: live.current.design.layers.filter(item => item.id !== removeTarget.id) }); setSelected(null); setRemoveTarget(null); requestAnimationFrame(() => addTextControl.current?.focus({preventScroll:true})); }} confirmLabel="Remove" cancelLabel="Cancel"/>}
    {resetTarget && <ConfirmationDialog title="Reset your engraving design?" description="Your text and artwork will be cleared. Your surface photo stays ready." returnFocus={resetTarget} onCancel={() => setResetTarget(null)} onConfirm={resetDesign} confirmLabel="Reset design" cancelLabel="Keep editing"/>}
  </section>;
}
