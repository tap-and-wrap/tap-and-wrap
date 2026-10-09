import { useState } from 'react';

export const isEditConflict = (error) => error?.response?.data?.error?.code === 'EDIT_CONFLICT';

/** Failed saves retain the draft. Replacing it always requires a deliberate second action. */
export default function EditConflict({ error, onReload }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadError, setReloadError] = useState('');
  if (!isEditConflict(error)) return null;
  async function reload() {
    setLoading(true);
    setReloadError('');
    try { await onReload(); setConfirming(false); }
    catch { setReloadError('The latest record could not be loaded. Your draft is still available.'); }
    finally { setLoading(false); }
  }
  return <div role="status" className="admin-feedback">
    <p>Another editor changed this record. Your unsaved changes are still here. Copy any changes you need before reloading.</p>
    {!confirming ? <button type="button" className="button button-secondary" onClick={() => setConfirming(true)}>Reload latest record</button> : <>
      <p>Reloading will replace this draft with the latest saved record.</p>
      <button type="button" className="button button-secondary" disabled={loading} onClick={reload}>{loading ? 'Reloading…' : 'Confirm reload and discard draft'}</button>
      <button type="button" className="button button-secondary" disabled={loading} onClick={() => setConfirming(false)}>Keep my draft</button>
    </>}
    {reloadError && <p role="alert">{reloadError}</p>}
  </div>;
}
