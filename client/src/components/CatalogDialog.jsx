import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function CatalogDialog({ title, children, onClose, bottomSheet = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialogRef} className={`catalog-dialog ${bottomSheet ? 'catalog-dialog-bottom' : ''}`} aria-labelledby={titleId}
      onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="catalog-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="catalog-icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={22} /></button>
      </div>
      {children}
    </dialog>
  );
}
