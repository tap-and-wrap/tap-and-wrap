import { useEffect, useRef, useState } from 'react';

/** Track only *visible* pending/invalid file selections. Never use a picker
 * cancellation as a reason to relayout or reset the builder. */
export default function useImageSelectionReady(rootRef) {
  const [ready, setReady] = useState(true);
  const watched = useRef(null);
  const observer = useRef(null);
  // The builder root can first appear after an async authorization/bootstrap.
  // Reconnect only when that actual root changes, not on every keystroke.
  useEffect(() => {
    const root = rootRef.current;
    if (watched.current === root) return;
    observer.current?.disconnect(); observer.current = null; watched.current = root;
    if (!root) { setReady(true); return; }
    const check = () => {
      const blocking = [...root.querySelectorAll('[data-image-state="checking"], [data-image-state="invalid"]')]
        .some(node => node.getClientRects().length > 0);
      setReady(previous => previous === !blocking ? previous : !blocking);
    };
    const next = new MutationObserver(check);
    next.observe(root, {subtree:true,childList:true,attributes:true,attributeFilter:['data-image-state','hidden','open']});
    observer.current = next; check();
  }, [rootRef]);
  useEffect(() => () => { observer.current?.disconnect(); observer.current = null; watched.current = null; }, []);
  return ready;
}
