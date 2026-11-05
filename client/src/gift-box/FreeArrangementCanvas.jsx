import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { boundFreePlacement } from '../../../shared/gift-box/commerce-contract.mjs';
import Artwork from './Artwork.jsx';
import RibbonBow from './RibbonBow.jsx';
import { FREE_PRESENTATION, freePresentation } from './free-presentation.mjs';

export default function FreeArrangementCanvas({ state, components, dispatch, personal, undo, canUndo, readOnly = false, photoUrls = {}, selectedId, onSelect }) {
  const canvas = useRef(null), drag = useRef(null);
  const [localSelected, setLocalSelected] = useState(null), [moving, setMoving] = useState(null);
  const selected = onSelect ? selectedId : localSelected;
  const setSelected = onSelect || setLocalSelected;
  const presentation = state.presentationVersion === FREE_PRESENTATION ? freePresentation(state.boxId) : null;
  const frame = presentation?.box;
  const boxStyle = frame ? { left:`${frame.x*100}%`,top:`${frame.y*100}%`,width:`${frame.width*100}%`,height:`${frame.height*100}%` } : undefined;
  const name = id => components.find(item => item.componentId === id)?.displayName || id;
  const objects = [...state.instances.map(item => ({ ...item, zone: item.placementZone, label: name(item.componentId) })),
    ...(state.ribbonId ? [{ id: 'ribbon', componentId: state.ribbonId, label: name(state.ribbonId), width: .23, height: .16,
      x: .32, y: .65, zone: 'inside', ...state.ribbonPosition }] : []),
    ...(personal?.photos || []).map((photo, index) => ({ id: photo.id, photo: true, label: `Photo ${index + 1}`, width: .12, height: .16,
      x: .72, y: .22 + index % 4 * .13, ...personal.photoPositions?.[photo.id], zone: personal.photoPositions?.[photo.id]?.placementZone || 'beside', url: photo.url || photoUrls[photo.id] }))];
  useEffect(() => {
    if (readOnly || !selected) return undefined;
    const deselect = event => { if (event.key === 'Escape') { setSelected(null); drag.current = null; setMoving(null); } };
    window.addEventListener('keydown',deselect);
    return () => window.removeEventListener('keydown',deselect);
  },[readOnly,selected,setSelected]);
  const active = objects.find(item => item.id === selected);
  function save(item, target, zone = item.zone) {
    const position = boundFreePlacement(target, item);
    if (item.photo) personal.placePhoto(state.boxId, item.id, { ...position, placementZone: zone });
    else if (item.id === 'ribbon') dispatch({ type: 'ribbon-move', position, zone });
    else dispatch({ type: 'move', id: item.id, study: true, position, zone });
  }
  function remove(item) {
    if (!item) return;
    if (item.photo) personal.removePhoto(item.id);
    else dispatch({ type: item.id === 'ribbon' ? 'ribbon' : 'remove', id: item.id === 'ribbon' ? null : item.id });
    setSelected(null);
  }
  function end(event, cancel = false) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!cancel && current.position) save(current.item, current.position);
    setMoving(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className="gb-free-preview" onKeyDown={event => { if (event.key === 'Escape') { setSelected(null); drag.current = null; setMoving(null); } }}>
    <div ref={canvas} className="gb-canvas gb-free-canvas" style={presentation ? { aspectRatio:presentation.aspect } : undefined} role="group" aria-label="Gift arrangement preview"
      onPointerDown={event => { if (!event.target.closest('button')) setSelected(null); }}>
      {state.boxId ? <div className="gb-box-art gb-free-box" style={boxStyle}><Artwork key={state.boxId} componentId={state.boxId} role="placement" alt="Selected open box" normalize={Boolean(presentation)}/></div>
        : <div className="gb-preview-empty"><p>A gift, made by you.</p><span>Choose your box</span></div>}
      {objects.map(item => {
        const position = moving?.id === item.id ? moving : item;
        const style = { left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%`, zIndex: !readOnly && selected === item.id ? 140 : readOnly && Number.isSafeInteger(item.layer) ? item.layer : item.id === 'ribbon' ? 110 : 20 + Math.round(position.y * 60) };
        const art = item.photo ? (item.url ? <img src={item.url} alt={item.label}/> : <span className="gb-photo-placeholder">{item.label}</span>) : item.id === 'ribbon' ? <RibbonBow componentId={item.componentId}/> : <Artwork componentId={item.componentId} role="placement" normalize/>;
        if (readOnly) return <div key={item.id} className={`gb-placed ${item.photo ? 'gb-free-photo' : ''}`} style={style} title={`${item.label} - ${item.zone}`}>{art}</div>;
        return <button key={item.id} type="button" className={`gb-placed ${item.photo ? 'gb-free-photo' : ''} ${selected === item.id ? 'is-active' : ''}`} style={style}
          data-instance-id={item.id} aria-label={`Move ${item.label}`} aria-pressed={selected === item.id}
          onClick={() => setSelected(item.id)} onFocus={() => setSelected(item.id)} onKeyDown={event => {
            const delta = { ArrowLeft: [-.02,0], ArrowRight: [.02,0], ArrowUp: [0,-.02], ArrowDown: [0,.02] }[event.key];
            if (delta) { event.preventDefault(); save(item, { x: item.x + delta[0], y: item.y + delta[1] }); }
            if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(item); }
          }} onPointerDown={event => {
            setSelected(item.id);
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, rect: canvas.current.getBoundingClientRect() };
          }} onPointerMove={event => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            current.position = boundFreePlacement({ x: item.x + (event.clientX - current.startX) / current.rect.width, y: item.y + (event.clientY - current.startY) / current.rect.height }, item);
            setMoving({ id: item.id, ...current.position });
          }} onPointerUp={end} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)}>{art}</button>;
      })}
    </div>
    {!readOnly && <div className="gb-free-tools" role="group" aria-label="Arrangement controls">
      <button type="button" onClick={undo} disabled={!canUndo}>Undo</button>
      <div className="gb-arrows">{[[ArrowLeft,'left',-.02,0],[ArrowUp,'up',0,-.02],[ArrowDown,'down',0,.02],[ArrowRight,'right',.02,0]].map(([Icon,label,x,y]) => <button type="button" key={label} aria-label={`Move ${label}`} disabled={!active} onClick={() => save(active,{ x: active.x + x, y: active.y + y })}><Icon size={17} aria-hidden="true"/></button>)}</div>
      <button type="button" aria-label="Delete selected item" disabled={!active} onClick={() => remove(active)}><Trash2 size={18} aria-hidden="true"/></button>
      {active && <button type="button" className="gb-zone-toggle" onClick={() => save(active, active, active.zone === 'inside' ? 'beside' : 'inside')}>{active.zone === 'inside' ? 'Move beside box' : 'Move inside'}</button>}
    </div>}
  </div>;
}
