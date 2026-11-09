import { useRef } from 'react';
import ConfirmationDialog from '../components/ConfirmationDialog.jsx';

export default function ConfirmRemoval({ target, onCancel, onConfirm }) {
  const confirmed = useRef(false);
  return <ConfirmationDialog data-gb-preview-control className="gb-confirm-dialog" title={`Remove ${target.label}?`} description="Only this item will be removed. You can undo this change." cancelLabel="Keep item" confirmLabel="Remove item" returnFocus={target.opener} onCancel={onCancel} onConfirm={() => { if (confirmed.current) return; confirmed.current = true;
        const container = target.opener?.closest('.gb-free-preview') || target.opener?.closest('.gb-choices');
        onConfirm();
        requestAnimationFrame(() => {
          if (!container?.isConnected || document.activeElement !== document.body) return;
          container.querySelector('.gb-free-tools button:not(:disabled), input:not(:disabled), textarea:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
        }); }}/>;
}
