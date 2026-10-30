import { useRef, useState } from 'react';
import RibbonBow from './RibbonBow.jsx';

// Coordinates target the front-facing presentation surface in the PHOTO STUDY,
// not a certified attachment location or order-time engraving geometry.
const areas = Object.freeze({
  'box-1': [.32,.65,.56,.78], 'box-2': [.31,.66,.58,.79], 'box-3': [.31,.66,.58,.79],
  'box-4': [.34,.61,.65,.84], 'box-5': [.35,.59,.63,.82], 'box-6': [.35,.59,.63,.82],
  'box-7': [.32,.63,.64,.86], 'box-8': [.32,.63,.64,.87], 'box-9': [.32,.63,.64,.87],
  'box-10': [.32,.63,.63,.86], 'box-11': [.25,.57,.61,.75], 'box-12': [.35,.60,.57,.78],
});
const defaultArea=[.32,.63,.60,.80];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function initialRibbonPose(boxId) {
  const [left,right,top,bottom]=areas[boxId]||defaultArea;
  return {x:(left+right)/2,y:(top+bottom)/2};
}
export function constrainedRibbonPose(boxId,pose) {
  const [left,right,top,bottom]=areas[boxId]||defaultArea;
  return {x:clamp(pose.x,left,right),y:clamp(pose.y,top,bottom)};
}
export default function RibbonOnBox({ boxId, ribbonId, scene }) {
  const [pose,setPose]=useState(()=>initialRibbonPose(boxId));
  const drag=useRef(null);
  function move(x,y){setPose(constrainedRibbonPose(boxId,{x,y}));}
  function finish(event){if(drag.current?.id!==event.pointerId)return;drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
  const width=.18,height=.18;
  return <button type="button" className="gb-bow-on-box"
    aria-label="Position the selected bow on the front of the gift box"
    title="Drag or use arrow keys to move the bow on the box front (draft)"
    style={{left:`${(pose.x-width/2-scene.x)/scene.width*100}%`,top:`${(pose.y-height/2-scene.y)/scene.height*100}%`,width:`${width/scene.width*100}%`,height:`${height/scene.height*100}%`}}
    onPointerDown={event=>{if(!event.isPrimary||event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,pose,rect:event.currentTarget.parentElement.getBoundingClientRect()};}}
    onPointerMove={event=>{const d=drag.current;if(d?.id!==event.pointerId)return;move(d.pose.x+(event.clientX-d.x)/d.rect.width*scene.width,d.pose.y+(event.clientY-d.y)/d.rect.height*scene.height);}}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event=>{const delta={ArrowLeft:[-.015,0],ArrowRight:[.015,0],ArrowUp:[0,-.015],ArrowDown:[0,.015]}[event.key];if(delta){event.preventDefault();move(pose.x+delta[0],pose.y+delta[1]);}if(event.key==='Home'){event.preventDefault();setPose(initialRibbonPose(boxId));}}}>
    <RibbonBow key={ribbonId} componentId={ribbonId}/>
  </button>;
}
