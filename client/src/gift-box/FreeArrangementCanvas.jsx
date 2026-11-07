import ConfirmRemoval from './ConfirmRemoval.jsx';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Trash2, Maximize2 } from 'lucide-react';
import { boundFreePlacement } from '../../../shared/gift-box/commerce-contract.mjs';
import Artwork from './Artwork.jsx';
import RibbonBow from './RibbonBow.jsx';
import { photoPrintFootprint,defaultPhotoPosition } from '../../../shared/gift-box/photo-presentation.mjs';
import { isFreePresentation,sceneY,ribbonFootprint } from '../../../shared/gift-box/presentation.mjs';
import { customerGiftComponentName } from '../../../shared/gift-box/customer-label.mjs';
import { freePresentation, freeForegroundMasks, freePlacementZone } from './free-presentation.mjs';

export default function FreeArrangementCanvas({ state, components, dispatch, personal, undo, canUndo, readOnly = false, photoUrls = {}, selectedId, onSelect, onExpand }) {
  const canvas = useRef(null),root=useRef(null), drag = useRef(null);
  const [localSelected, setLocalSelected] = useState(null), [moving, setMoving] = useState(null);
  const [removal, setRemoval] = useState(null);
  const selected = onSelect ? selectedId : localSelected;
  const setSelected = onSelect || setLocalSelected;
  const presentation = isFreePresentation(state.presentationVersion) ? freePresentation(state.boxId,state.presentationVersion) : null;
  const frame = presentation?.box;
  const boxStyle = frame ? { left:`${frame.x*100}%`,top:`${frame.y*100}%`,width:`${frame.width*100}%`,height:`${frame.height*100}%` } : undefined;
  const name = id => customerGiftComponentName(components.find(item=>item.componentId === id) || {componentId:id}) || id;
  const objects = [...state.instances.map(item => ({ ...item, zone: item.placementZone, label: name(item.componentId) })),
    ...(state.ribbonId ? [{ id: 'ribbon', componentId: state.ribbonId, label: name(state.ribbonId), ...ribbonFootprint(state.presentationVersion),
      x: state.presentationVersion ? .385 : .32, y: sceneY(state.presentationVersion ? .67 : .65,state.presentationVersion), zone: 'inside', ...state.ribbonPosition }] : []),
    ...(personal?.photos || []).map((photo, index) => ({ id: photo.id, photo: true, label: `Photo ${index + 1}`, ...photoPrintFootprint(personal.photoAspectRatios === false ? undefined : photo.aspectRatio,presentation?.aspect || 1,state.presentationVersion),
      ...defaultPhotoPosition(index,state.presentationVersion), ...personal.photoPositions?.[photo.id], zone: personal.photoPositions?.[photo.id]?.placementZone || 'beside', url: photo.url || photoUrls[photo.id] }))].map(item=>{const position=readOnly ? item : boundFreePlacement(item,item);return {...item,...position,zone:readOnly ? item.zone : freePlacementZone(state.boxId,item,position,state.presentationVersion)};});
  useEffect(() => {
    if (readOnly || !selected || removal) return undefined;
    const deselect = event => { if (event.key === 'Escape') { setSelected(null); drag.current = null; setMoving(null); } };
    const outside=event=>{
      if (!drag.current && !root.current?.contains(event.target) && !event.target.closest?.('[data-gb-preview-control]')) { setSelected(null);setMoving(null); }
    };
    document.addEventListener('pointerdown',outside);
    window.addEventListener('keydown',deselect);
    return () => { document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',deselect); };
  },[readOnly,selected,setSelected,removal]);
  const active = objects.find(item => item.id === selected);
  function save(item, target) {
    const position = boundFreePlacement(target, item);
    const zone = freePlacementZone(state.boxId,item,position,state.presentationVersion);
    if (item.photo) personal.placePhoto(state.boxId, item.id, { ...position, width:item.width,height:item.height,placementZone: zone });
    else if (item.id === 'ribbon') dispatch({ type: 'ribbon-move', position, zone });
    else dispatch({ type: 'move', id: item.id, study: true, position, zone });
  }
  function requestRemove(item) {
    if (!item || removal) return;
    drag.current = null; setMoving(null);
    setRemoval({ ...item, opener: document.activeElement });
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
  return <div ref={root} className="gb-free-preview" style={presentation ? {'--gb-scene-aspect':presentation.aspect} : undefined} onKeyDown={event => { if (!removal && event.key === 'Escape') { setSelected(null); drag.current = null; setMoving(null); } }}>
    <div ref={canvas} className="gb-canvas gb-free-canvas" style={presentation ? { aspectRatio:presentation.aspect } : undefined} role="group" aria-label="Gift arrangement preview"
      onPointerDown={event => { if (!event.target.closest('button')) setSelected(null); }}>
      {state.boxId ? <div className="gb-box-art gb-free-box" style={boxStyle}><Artwork key={state.boxId} componentId={state.boxId} role="placement" alt="Selected open box" normalize={Boolean(presentation)}/></div>
        : <div className="gb-preview-empty"><p>A gift, made by you.</p><span>Choose your box</span></div>}
      {objects.map(item => {
        const position = moving?.id === item.id ? moving : item;
        const style = { left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%`, zIndex: item.id === 'ribbon' ? 190 : ((moving?.id === item.id ? freePlacementZone(state.boxId,item,position,state.presentationVersion) : item.zone) === 'beside' ? 160 : 20) + Math.round(position.y * 60) };
        const art = item.photo ? (item.url ? <img src={item.url} alt={item.label}/> : <span className="gb-photo-placeholder">{item.label}</span>) : item.id === 'ribbon' ? <RibbonBow componentId={item.componentId}/> : <Artwork componentId={item.componentId} role="placement" normalize/>;
        if (readOnly) return <div key={item.id} className={`gb-placed ${item.photo ? 'gb-free-photo' : ''}`} style={style} title={`${item.label} - ${item.zone}`}>{art}</div>;
        return <button key={item.id} type="button" className={`gb-placed ${item.photo ? 'gb-free-photo' : ''} ${selected === item.id ? 'is-active' : ''}`} style={style}
          data-instance-id={item.id} aria-label={`Move ${item.label}`} aria-pressed={selected === item.id}
          onClick={() => setSelected(item.id)} onFocus={() => setSelected(item.id)} onKeyDown={event => {
            const delta = { ArrowLeft: [-.02,0], ArrowRight: [.02,0], ArrowUp: [0,-.02], ArrowDown: [0,.02] }[event.key];
            if (delta) { event.preventDefault(); save(item, { x: item.x + delta[0], y: item.y + delta[1] }); }
            if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (!event.repeat) requestRemove(item); }
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
      {state.boxId && freeForegroundMasks(state.boxId,state.presentationVersion).map(mask=><div key={mask.id} className="gb-free-rim" aria-hidden="true" style={{clipPath:mask.clipPath}}><div className="gb-box-art gb-free-box" style={boxStyle}><Artwork componentId={state.boxId} role="placement" normalize={Boolean(presentation)}/></div></div>)}
    </div>
    {!readOnly && <div className="gb-free-tools" role="group" aria-label="Arrangement controls">
      <button type="button" onClick={undo} disabled={!canUndo}>Undo</button>
      <div className="gb-arrows">{[[ArrowLeft,'left',-.02,0],[ArrowUp,'up',0,-.02],[ArrowDown,'down',0,.02],[ArrowRight,'right',.02,0]].map(([Icon,label,x,y]) => <button type="button" key={label} aria-label={`Move ${label}`} disabled={!active} onClick={() => save(active,{ x: active.x + x, y: active.y + y })}><Icon size={17} aria-hidden="true"/></button>)}</div>
      <button type="button" className="gb-delete" aria-label="Delete selected item" disabled={!active} onClick={() => requestRemove(active)}><Trash2 size={18} aria-hidden="true"/><span>Remove</span></button>

      {onExpand && <button type="button" className="gb-expand" data-gb-preview-control aria-label="Expand preview" aria-haspopup="dialog" onClick={onExpand}><Maximize2 size={18} aria-hidden="true"/><span>Expand</span></button>}
    </div>}
    {removal && <ConfirmRemoval target={removal} onCancel={() => setRemoval(null)} onConfirm={() => {
      // The identity captured at the action, never whichever item is focused later.
      const current = objects.find(item => item.id === removal.id && item.componentId === removal.componentId);
      if (current) remove(current);
      setRemoval(null);
    }}/>}
  </div>;
}
