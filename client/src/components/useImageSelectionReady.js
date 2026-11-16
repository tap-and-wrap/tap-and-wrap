import { useEffect, useState } from 'react';

// Covers button-based builders as well as ordinary forms. No file data leaves
// the picker; only its bounded validation state is observed within this page.
export default function useImageSelectionReady(rootRef) {
  const [ready, setReady] = useState(true);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const check = () => setReady(![...root.querySelectorAll('[data-image-state="checking"], [data-image-state="invalid"]')].some(node => node.getClientRects().length));
    const observer = new MutationObserver(check);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-image-state', 'hidden', 'open'] });
    check();
    return () => observer.disconnect();
  });
  return ready;
}
