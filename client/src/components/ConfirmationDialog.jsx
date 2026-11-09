import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import useModalDialog from './useModalDialog.js';
import './confirmation-dialog.css';

export default function ConfirmationDialog({ title, description, children, onCancel, onConfirm, cancelLabel = 'Cancel', confirmLabel = 'Confirm', pending = false, error, returnFocus, className = '', ...attributes }) {
  const titleId = useId(), descriptionId = useId();
  const close = () => { if (!pending) onCancel(); };
  const { dialogRef, dialogProps } = useModalDialog({ onClose: close, returnFocus });
  useEffect(() => {
    const viewport = window.visualViewport, node = dialogRef.current;
    let frame;
    const measure = () => {
      const top = viewport?.offsetTop || 0, left = viewport?.offsetLeft || 0;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      for (const [key,value] of Object.entries({ top, left, width, height })) node.style.setProperty(`--confirmation-${key}`, `${value}px`);
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        if (!node.open || !node.contains(document.activeElement)) return;
        const bounds=node.getBoundingClientRect(), control=document.activeElement.getBoundingClientRect();
        // Keep the focused control visible after orientation/keyboard changes,
        // scrolling only this dialog rather than the page behind it.
        if (control.bottom>bounds.bottom-12) node.scrollTop+=control.bottom-bounds.bottom+12;
        else if (control.top<bounds.top+12) node.scrollTop-=bounds.top+12-control.top;
      });
    };
    measure(); window.addEventListener('resize',measure);
    viewport?.addEventListener('resize',measure); viewport?.addEventListener('scroll',measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize',measure); viewport?.removeEventListener('resize',measure); viewport?.removeEventListener('scroll',measure); };
  }, [dialogRef]);
  return createPortal(<dialog {...attributes} ref={dialogRef} {...dialogProps} className={`confirmation-dialog ${className}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-busy={pending} aria-modal="true">
    <h2 id={titleId}>{title}</h2>
    {description && <p id={descriptionId}>{description}</p>}
    {children}
    {error && <p className="confirmation-error" role="alert">{error}</p>}
    <div className="confirmation-actions"><button type="button" className="button button-secondary" autoFocus disabled={pending} onClick={close}>{cancelLabel}</button><button type="button" className="button button-primary" disabled={pending} onClick={onConfirm}>{pending ? 'Please wait...' : confirmLabel}</button></div>
  </dialog>,document.body);
}
