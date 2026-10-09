import { useEffect, useRef } from 'react';

// Native dialogs supply focus containment and background isolation. Keep only
// their shared lifecycle here so stacked dialogs cannot unlock one another.
const locks = new Set();
let originalOverflow = '';
function lockScroll(dialog) {
  if (!locks.size) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks.add(dialog);
  return () => {
    locks.delete(dialog);
    if (!locks.size) document.body.style.overflow = originalOverflow;
  };
}
function outside(dialog, event) {
  const bounds = dialog.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
}

export default function useModalDialog({ onClose, restoreFocus = true, returnFocus }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const backdropDown = useRef(false);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    // Asynchronous viewers may temporarily disable the initiating button.
    // Capture that element at the action when supplied, rather than after loading.
    const opener = returnFocus || document.activeElement;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    const unlock = lockScroll(dialog);
    return () => {
      if (dialog.open) dialog.close();
      unlock();
      if (restoreFocus && opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled') && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    };
  }, [restoreFocus, returnFocus]);
  const dialogProps = {
    onCancel: (event) => { event.preventDefault(); closeRef.current(); },
    onKeyDown: (event) => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll('a[href], button, input, select, textarea, iframe, [tabindex]')].filter((node) => !node.matches(':disabled') && node.tabIndex >= 0 && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); event.currentTarget.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    },
    onPointerDown: (event) => { backdropDown.current = event.target === event.currentTarget && outside(event.currentTarget, event); },
    onClick: (event) => {
      // Clicking padding, or ending a drag on the backdrop, must not discard a form.
      if (backdropDown.current && event.target === event.currentTarget && outside(event.currentTarget, event)) closeRef.current();
      backdropDown.current = false;
    },
  };
  return { dialogRef, dialogProps };
}
