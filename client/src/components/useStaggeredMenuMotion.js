import { useCallback, useEffect, useRef, useState } from 'react';

// Adapted choreography from React Bits StaggeredMenu (David Haz).
// See client/public/licenses/react-bits.txt. Web Animations replaces GSAP; the
// application's native modal remains responsible for isolation and focus.
export default function useStaggeredMenuMotion(root, onClose) {
  const [closing,setClosing]=useState(false), animations=useRef([]), active=useRef(false), closingRef=useRef(false), finished=useRef(false), after=useRef(null), closeRef=useRef(onClose);
  closeRef.current=onClose;
  const finish=useCallback(()=>{
    if(!active.current||finished.current)return;finished.current=true;
    closeRef.current();after.current?.();
  },[]);
  useEffect(()=>{
    active.current=true;finished.current=false;const query=matchMedia('(prefers-reduced-motion: reduce)'),dialog=root.current;
    const animate=(node,frames,options)=>{const animation=node.animate(frames,{fill:'both',...options});animations.current.push(animation);return animation;};
    if(!query.matches){
      const easing='cubic-bezier(.16,1,.3,1)';
      [...dialog.querySelectorAll('.sm-prelayer')].forEach((node,index)=>animate(node,[{transform:'translateX(-105%)'},{transform:'translateX(0)'}],{duration:500,delay:index*70,easing}));
      animate(dialog.querySelector('.sm-panel'),[{transform:'translateX(-105%)'},{transform:'translateX(0)'}],{duration:650,delay:220,easing});
      [...dialog.querySelectorAll('.sm-link-label>span')].forEach((node,index)=>animate(node,[{transform:'translateY(140%) rotate(10deg)'},{transform:'translateY(0) rotate(0)'}],{duration:1000,delay:320+index*80,easing}));
    }
    const reduce=()=>{if(query.matches){animations.current.forEach(a=>{try{a.finish();}catch{a.cancel();}});if(closingRef.current)finish();}};
    query.addEventListener('change',reduce);
    return()=>{active.current=false;query.removeEventListener('change',reduce);animations.current.forEach(a=>a.cancel());animations.current=[];};
  },[root,finish]);
  function close(callback) {
    if(closingRef.current)return;closingRef.current=true;after.current=callback;setClosing(true);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    const nodes=[...root.current.querySelectorAll('.sm-prelayer'),root.current.querySelector('.sm-panel')], positions=nodes.map(node=>getComputedStyle(node).transform);
    animations.current.forEach(a=>a.cancel());
    const exit=nodes.map((node,index)=>node.animate([{transform:positions[index]},{transform:'translateX(-105%)'}],{duration:320,easing:'cubic-bezier(.7,0,1,.5)',fill:'both'}));
    animations.current=exit;Promise.allSettled(exit.map(a=>a.finished)).then(finish);
  }
  return {closing,close};
}
