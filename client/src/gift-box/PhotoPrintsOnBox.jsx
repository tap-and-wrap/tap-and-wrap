import { useRef, useState } from 'react';
import { movePhotoPrint, photoPrintPosition } from './photo-print-study.mjs';

const moves = [['Left',-0.02,0],['Up',0,-0.02],['Down',0,0.02],['Right',0.02,0]];

export default function PhotoPrintsOnBox({ boxId, scene, personal, selectedId, onSelect }) {
  const drag = useRef(null);
  const [draft, setDraft] = useState(null);
  const selectedIndex = personal.photos.findIndex(photo => photo.id === selectedId);
  const current = selectedIndex < 0 ? null : photoPrintPosition(boxId, selectedIndex, personal.photoPositions[selectedId]);
  function finish(event, cancelled = false) {
    const pending = drag.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (!cancelled && pending.position && personal.photos.some(photo => photo.id === pending.id)) {
      personal.placePhoto(boxId, pending.id, pending.position);
    }
    drag.current = null;
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <>
    {personal.photos.map((photo,index) => {
      const starting = photoPrintPosition(boxId,index,personal.photoPositions[photo.id]);
      if (!starting) return null;
      const position = draft?.id === photo.id ? draft : starting;
      return <div key={photo.id} className={`gb-photo-on-box ${selectedId === photo.id ? 'is-active' : ''}`}
        data-photo-id={photo.id} data-zone={position.placementZone}
        style={{left:`${(position.x-scene.x)/scene.width*100}%`,top:`${(position.y-scene.y)/scene.height*100}%`,
          width:`${position.width/scene.width*100}%`,height:`${position.height/scene.height*100}%`,
          zIndex:position.placementZone==='beside'?460:35+Math.round(position.y*60)}}>
        <img src={photo.url} alt={`Selected photo ${index+1}`} draggable="false"/>
        <button type="button" className="gb-photo-handle" aria-label={`Position photo print ${index+1}`} aria-pressed={selectedId === photo.id}
          onClick={() => onSelect(photo.id)} onFocus={() => onSelect(photo.id)}
        onKeyDown={event => {
          const delta={ArrowLeft:[-0.02,0],ArrowRight:[0.02,0],ArrowUp:[0,-0.02],ArrowDown:[0,0.02]}[event.key];
          if (delta) {
            event.preventDefault();
            personal.placePhoto(boxId,photo.id,movePhotoPrint(boxId,starting,{x:starting.x+delta[0],y:starting.y+delta[1]},starting.placementZone));
          }
        }}
        onPointerDown={event => {
          onSelect(photo.id);
          if (!event.isPrimary || event.button!==0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current={pointerId:event.pointerId,id:photo.id,start:starting,startX:event.clientX,startY:event.clientY,
            rect:event.currentTarget.closest('.gb-canvas').getBoundingClientRect(),scene};
        }}
        onPointerMove={event => {
          const active=drag.current;
          if (!active || active.pointerId!==event.pointerId || active.id!==photo.id) return;
          const target={x:active.start.x+(event.clientX-active.startX)/active.rect.width*active.scene.width,
            y:active.start.y+(event.clientY-active.startY)/active.rect.height*active.scene.height};
          active.position=movePhotoPrint(boxId,active.start,target);
          setDraft({id:photo.id,...active.position});
        }}
        onPointerUp={finish} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)} />
      </div>;
    })}
    {current && <div className="gb-photo-position-a11y" role="status" aria-live="polite">Photo {selectedIndex+1}: {current.placementZone} box (illustrative)</div>}
  </>;
}

export function PhotoPrintControls({ boxId, personal, selectedId }) {
  const index=personal.photos.findIndex(photo=>photo.id===selectedId);
  if (index<0) return null;
  const photo=personal.photos[index], position=photoPrintPosition(boxId,index,personal.photoPositions[photo.id]);
  if (!position) return null;
  const shift=(dx,dy)=>personal.placePhoto(boxId,photo.id,movePhotoPrint(boxId,position,{x:position.x+dx,y:position.y+dy},position.placementZone));
  const swap=()=>{
    const zone=position.placementZone==='beside'?'inside':'beside';
    personal.placePhoto(boxId,photo.id,movePhotoPrint(boxId,position,position,zone));
  };
  return <div className="gb-move-controls gb-photo-controls" role="group" aria-label={`Position photo print ${index+1} controls`}>
    <span>Photo print {index+1} · {position.placementZone} (layout study)</span>
    {moves.map(([name,dx,dy])=><button key={name} type="button" onClick={()=>shift(dx,dy)} aria-label={`Move photo ${name.toLowerCase()}`}>{name}</button>)}
    <button type="button" onClick={swap}>{position.placementZone==='beside'?'Move photo inside (draft)':'Move photo beside box (draft)'}</button>
  </div>;
}
