import { useRef, useState } from 'react';
import Artwork from './Artwork.jsx';
import RibbonOnBox from './RibbonOnBox.jsx';
import PhotoPrintsOnBox, { PhotoPrintControls } from './PhotoPrintsOnBox.jsx';
import { componentLabel } from './state.mjs';
import { BOX_ARTWORK_DIMENSIONS } from './artwork-dimensions.mjs';
import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { getStudyScene, positionStudyItem, studyAnchor, dropZoneForStudyItem } from './placement-study.mjs';

export default function ArrangementCanvas({ state, components, dispatch, study = false, overlay, onTrace, extendedScene = false, personal = null }) {
  const canvas = useRef(null), drag = useRef(null);
  const [selected, setSelected] = useState(null), [draftPosition, setDraftPosition] = useState(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const active = state.instances.find(item => item.id === selected);
  const extended=study&&(extendedScene||Boolean(state.boxId && personal?.photos?.length)||state.instances.some(item =>
    item.x!==null && (item.placementZone==='beside' || ['plush','chocolate'].includes(getFixedComponent(item.componentId)?.category))));
  const scene=getStudyScene(extended), draft=study&&getDraftGeometry(state.boxId);
  const boxSize=BOX_ARTWORK_DIMENSIONS[state.boxId]||[1,1];
  const boxStyle={left:`${-scene.x/scene.width*100}%`,top:`${-scene.y/scene.height*100}%`,width:`${100/scene.width}%`,height:`${100/scene.height}%`};
  const label = id => componentLabel(components.find(item => item.componentId === id) || { componentId: id, category: id.startsWith('rose') ? 'flower' : id.split('-')[0] });
  function move(item, dx, dy) {
    if (study) dispatch({ type: 'move', id: item.id, study: true, position: { x: (item.x ?? 0.4) + dx, y: (item.y ?? 0.4) + dy } });
  }
  function endDrag(event, cancel = false) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!cancel && current.position) dispatch({ type: 'move', id: current.item.id, study: true,
      position: current.position, zone: current.position.placementZone });
    drag.current = null; setDraftPosition(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className="gb-preview-content">
    <div className="gb-canvas" style={{ aspectRatio: `${boxSize[0]*scene.width} / ${boxSize[1]*scene.height}` }} ref={canvas} role="group" aria-label="Gift arrangement preview" onClick={event => {
      if (onTrace && event.target.closest('.gb-canvas') && !event.target.closest('button')) {
        const rect = canvas.current.getBoundingClientRect(); onTrace([scene.x+(event.clientX-rect.left)/rect.width*scene.width,scene.y+(event.clientY-rect.top)/rect.height*scene.height]);
      }
    }}>
      {state.boxId ? <div className="gb-box-art" style={boxStyle}><Artwork key={state.boxId} componentId={state.boxId} role="placement" alt="Selected open box"/></div>
        : <div className="gb-preview-empty"><span className="gb-preview-flower" aria-hidden="true">✧</span><p>A thoughtful gift,<br/>made by you.</p><span>Choose a box to begin.</span></div>}
      {state.instances.filter(item => item.x !== null).map(item => {
        const position = draftPosition?.id === item.id ? draftPosition : item;
        return <button type="button" key={item.id} className={`gb-placed ${selected === item.id ? 'is-active' : ''}`}
          data-instance-id={item.id} aria-label={`Move ${label(item.componentId)} ${state.instances.indexOf(item) + 1}`}
          aria-pressed={selected === item.id} style={{left:`${(position.x-scene.x)/scene.width*100}%`,top:`${(position.y-scene.y)/scene.height*100}%`,width:`${item.width/scene.width*100}%`,height:`${item.height/scene.height*100}%`,zIndex:(position.layerBase||item.layerBase||20)+Math.round(studyAnchor(item,position)[1]*60)}}
          onClick={() => setSelected(item.id)} onFocus={() => setSelected(item.id)} onKeyDown={event => {
            const delta = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[event.key];
            if (delta && study) { event.preventDefault(); move(item, ...delta); }
            if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); dispatch({ type: 'remove', id: item.id }); }
          }}
          onPointerDown={event => {
            setSelected(item.id);
            if (!study || !event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, item, startX: event.clientX, startY: event.clientY, rect: canvas.current.getBoundingClientRect(),scene };
          }} onPointerMove={event => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            const target = { x: current.item.x+(event.clientX-current.startX)/current.rect.width*current.scene.width,
              y: current.item.y+(event.clientY-current.startY)/current.rect.height*current.scene.height };
            const zone = dropZoneForStudyItem(state.boxId, item, target);
            const position = positionStudyItem(state.boxId, item, target, zone);
            current.position = position; setDraftPosition({ id: item.id, ...position });
          }} onPointerUp={endDrag} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)}>
          <Artwork componentId={item.componentId} role="placement" normalize/>
        </button>;
      })}
      {draft&&!draft.assetBlocked&&draft.foregroundMasks.map(mask=><div key={mask.id} className="gb-draft-rim" aria-hidden="true" style={{...boxStyle,zIndex:mask.layer,clipPath:`polygon(${mask.points.map(([x,y])=>`${x*100}% ${y*100}%`).join(',')})`}}><Artwork componentId={state.boxId} role="placement"/></div>)}
      {study && state.boxId && personal?.photos?.length>0 && <PhotoPrintsOnBox boxId={state.boxId} scene={scene} personal={personal} selectedId={selectedPhotoId} onSelect={setSelectedPhotoId}/>}
      {study && state.boxId && state.ribbonId && <RibbonOnBox key={state.boxId} boxId={state.boxId} ribbonId={state.ribbonId} scene={scene}/>}
      {typeof overlay==='function'?overlay(scene):overlay}
      {state.boxId && <span className="gb-preview-caption">{study ? 'Photo-derived layout study · approximate scale, not guaranteed fit' : 'Placement awaiting review'}</span>}
    </div>
    {study && state.boxId && personal?.photos?.length>0 && <p className="gb-help">Photo prints: drag inside or beside the box, focus a print and use arrow keys, or use its placement buttons. Illustrative only, not uploaded or priced.</p>}
    {study && state.boxId && personal && <PhotoPrintControls boxId={state.boxId} personal={personal} selectedId={selectedPhotoId}/>}
    {study && state.boxId && state.ribbonId && <p className="gb-help">Move the bow by dragging it along the front of the box, or focus it and use arrow keys. Approximate placement only.</p>}
    {active && <div className="gb-move-controls" role="group" aria-label={`Position ${label(active.componentId)}`}>
      <span>{label(active.componentId)}</span>
      {study && <>{[['Left', -0.02, 0], ['Up', 0, -0.02], ['Down', 0, 0.02], ['Right', 0.02, 0]].map(([name, x, y]) => <button type="button" key={name} onClick={() => move(active, x, y)} aria-label={`Move ${name.toLowerCase()}`}>{name}</button>)}</>}
      <button type="button" onClick={() => dispatch({ type: 'remove', id: active.id })}>Remove selected item</button>
      {study&&['plush','chocolate'].includes(getFixedComponent(active.componentId)?.category)&&<button type="button" onClick={()=>dispatch({type:'study-zone',id:active.id,zone:active.placementZone==='beside'?'inside':'beside',study:true})}>{active.placementZone==='beside'?'Move inside (draft)':'Move beside box (draft)'}</button>}
    </div>}
    {state.instances.some(item => item.x === null) && <div className="gb-unplaced"><p>Items waiting for placement</p>{state.instances.filter(item => item.x === null).map(item => <div key={item.id}><span>{label(item.componentId)}</span>{study && <button type="button" onClick={() => { setSelected(item.id); move(item, 0, 0); }}>Place in layout study</button>}<button type="button" onClick={() => dispatch({ type: 'remove', id: item.id })}>Remove</button></div>)}</div>}
  </div>;
}
