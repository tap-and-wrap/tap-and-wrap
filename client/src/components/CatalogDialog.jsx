import { useId } from 'react';
import { X } from 'lucide-react';
import useModalDialog from './useModalDialog.js';

export default function CatalogDialog({ title, children, onClose, bottomSheet = false }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  const titleId = useId();

  return (
    <dialog ref={dialogRef} {...dialogProps} className={`catalog-dialog ${bottomSheet ? 'catalog-dialog-bottom' : ''}`} aria-labelledby={titleId}>
      <div className="catalog-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="catalog-icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={22} /></button>
      </div>
      {children}
    </dialog>
  );
}
