import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import useModalDialog from '../components/useModalDialog.js';

export default function ConfirmRemoval({ target, onCancel, onConfirm }) {
  const titleId = useId(), descriptionId = useId(), confirmed = useRef(false);
  const { dialogRef, dialogProps } = useModalDialog({ onClose: onCancel, returnFocus: target.opener });
  return createPortal(<dialog ref={dialogRef} {...dialogProps} data-gb-preview-control className="gb-confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <p className="eyebrow">Your gift</p><h2 id={titleId}>Remove {target.label}?</h2>
    <p id={descriptionId}>Only this item will be removed. You can undo this change.</p>
    <div className="gb-dialog-actions"><button type="button" className="button button-secondary" autoFocus onClick={onCancel}>Keep item</button>
      <button type="button" className="button button-primary" onClick={() => { if (confirmed.current) return; confirmed.current = true;
        const container = target.opener?.closest('.gb-free-preview') || target.opener?.closest('.gb-choices');
        onConfirm();
        requestAnimationFrame(() => {
          if (!container?.isConnected || document.activeElement !== document.body) return;
          container.querySelector('.gb-free-tools button:not(:disabled), input:not(:disabled), textarea:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
        }); }}>Remove item</button></div>
  </dialog>, document.body);
}
