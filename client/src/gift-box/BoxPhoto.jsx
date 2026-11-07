import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import useModalDialog from '../components/useModalDialog.js';
import { boxPhotoUrl } from './box-photo-media.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function PhotoViewer({ src, label, onClose }) {
  const id=useId(),stage=useRef(null),pointers=useRef(new Map()),gesture=useRef(null);
  const [size,setSize]=useState({width:0,height:0}),[natural,setNatural]=useState(null),[failed,setFailed]=useState(false);
  const [view,setView]=useState({zoom:1,x:0,y:0});
  const {dialogRef,dialogProps}=useModalDialog({onClose});
  const ratio=natural?Math.min(size.width/natural.width,size.height/natural.height,1):0;
  const width=natural?natural.width*ratio:0,height=natural?natural.height*ratio:0,maxZoom=ratio?Math.min(4,1/ratio):1;
  const geometry=useRef(null);geometry.current={width,height,maxZoom,size};
  function bounded(value) {
    const g=geometry.current,zoom=clamp(value.zoom,1,g.maxZoom);
    return {zoom,x:clamp(value.x,-Math.max(0,(g.width*zoom-g.size.width)/2),Math.max(0,(g.width*zoom-g.size.width)/2)),y:clamp(value.y,-Math.max(0,(g.height*zoom-g.size.height)/2),Math.max(0,(g.height*zoom-g.size.height)/2))};
  }
  const zoomBy=useRef(null);
  zoomBy.current=(factor,anchor={x:0,y:0})=>setView(current=>{
    const zoom=clamp(current.zoom*factor,1,geometry.current.maxZoom),scale=zoom/current.zoom;
    return bounded({zoom,x:anchor.x-(anchor.x-current.x)*scale,y:anchor.y-(anchor.y-current.y)*scale});
  });
  useEffect(()=>{
    const node=stage.current,activePointers=pointers.current;
    const observer=new ResizeObserver(([entry])=>{setSize({width:entry.contentRect.width,height:entry.contentRect.height});setView({zoom:1,x:0,y:0});});observer.observe(node);
    const wheel=event=>{event.preventDefault();const rect=node.getBoundingClientRect();zoomBy.current(Math.exp(-event.deltaY*.002),{x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2});};
    node.addEventListener('wheel',wheel,{passive:false});
    return ()=>{observer.disconnect();node.removeEventListener('wheel',wheel);activePointers.clear();};
  },[]);
  function start(event) {
    if(event.pointerType==='mouse'&&event.button!==0) return;
    stage.current.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});gesture.current=null;
  }
  function move(event) {
    const points=pointers.current;if(!points.has(event.pointerId))return;
    const previous=points.get(event.pointerId);points.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(points.size===2) {
      const [a,b]=[...points.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},rect=stage.current.getBoundingClientRect();
      if(gesture.current?.distance)zoomBy.current(distance/gesture.current.distance,{x:center.x-rect.left-rect.width/2,y:center.y-rect.top-rect.height/2});
      gesture.current={distance};
    } else if(points.size===1) { gesture.current=null;setView(current=>bounded({...current,x:current.x+event.clientX-previous.x,y:current.y+event.clientY-previous.y})); }
  }
  function end(event){pointers.current.delete(event.pointerId);gesture.current=null;}
  return createPortal(<dialog ref={dialogRef} {...dialogProps} className="gb-lightbox" aria-labelledby={id}>
    <header><h2 id={id}>{label}</h2><button type="button" aria-label="Close box photo" onClick={onClose}><X aria-hidden="true" size={21}/></button></header>
    <div ref={stage} className={`gb-lightbox-stage ${view.zoom>1?'is-zoomed':''}`} tabIndex={0} role="group" aria-label="Box photo. Zoom to inspect; drag or use arrow keys to pan." onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onKeyDown={event=>{if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();if(event.key==='0')setView({zoom:1,x:0,y:0});else if(['+','=','-'].includes(event.key))zoomBy.current(event.key==='-'?1/1.25:1.25);else setView(current=>bounded({...current,x:current.x+(event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0),y:current.y+(event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0)}));}}}>
      {!natural&&!failed&&<p role="status">Loading photograph…</p>}{failed&&<p role="alert">The photograph could not load. Close and try again.</p>}
      <img src={src} alt={label} draggable="false" onLoad={event=>setNatural({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} onError={()=>setFailed(true)} style={{width,height,visibility:natural?'visible':'hidden',transform:`translate3d(${view.x}px,${view.y}px,0) scale(${view.zoom})`}}/>
    </div>
    <footer><div><button type="button" aria-label="Zoom out" disabled={!natural||view.zoom<=1} onClick={()=>zoomBy.current(1/1.25)}><ZoomOut size={19} aria-hidden="true"/></button><output aria-live="polite">{Math.round(view.zoom*100)}%</output><button type="button" aria-label="Zoom in" disabled={!natural||view.zoom>=maxZoom-.001} onClick={()=>zoomBy.current(1.25)}><ZoomIn size={19} aria-hidden="true"/></button><button type="button" aria-label="Fit photo to screen" onClick={()=>setView({zoom:1,x:0,y:0})}><RotateCcw size={17} aria-hidden="true"/><span>Fit</span></button></div><small>{view.zoom>1?'Drag to explore':'Full photograph'} · original quality</small></footer>
  </dialog>,document.body);
}

export function BoxThumbnail({componentId,label}) {
  const small=boxPhotoUrl(componentId,'thumbnail',320),large=boxPhotoUrl(componentId,'thumbnail',640);
  return <span className="gb-box-choice-photo"><img src={small} srcSet={small&&large?`${small} 320w, ${large} 640w`:undefined} sizes="(max-width:400px) 140px, (max-width:900px) 200px, 180px" width="640" height="853" alt={label} loading="lazy" decoding="async"/></span>;
}
export default function BoxPhoto({componentId,label}) {
  const [open,setOpen]=useState(false);
  return <><button type="button" className="gb-photo-enlarge" aria-label={`Enlarge ${label} photo`} aria-haspopup="dialog" onClick={()=>setOpen(true)}><Maximize2 size={18} aria-hidden="true"/></button>{open&&<PhotoViewer src={boxPhotoUrl(componentId,'original')} label={label} onClose={()=>setOpen(false)}/>}</>;
}
