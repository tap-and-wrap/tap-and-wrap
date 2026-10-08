import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCommerceGet, adminCommercePatch, commerceError, getPrivateAdminFile } from '../commerce/api';
import { OrderRecord } from './OrdersPage';

function PrivateFileDialog({ file, onClose }) {
  const dialogRef = useRef(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    const element = dialogRef.current;
    const previous = file.returnFocus || document.activeElement;
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    element.showModal();
    return () => { element.close(); URL.revokeObjectURL(objectUrl); previous?.focus(); };
  }, [file]);
  return <dialog ref={dialogRef} className="commerce-private-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }} aria-labelledby="private-file-title"><div className="commerce-heading"><h2 id="private-file-title">{file.label}</h2><button type="button" className="commerce-link-button" onClick={onClose} aria-label="Close private file">Close</button></div>{url && <img src={url} alt={file.label} />}<p className="commerce-muted">Private authenticated file. Close this viewer when you have finished reviewing.</p></dialog>;
}

export default function AdminOrderPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [fulfillmentState, setFulfillmentState] = useState('');
  const [paymentState, setPaymentState] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const query = useQuery({ queryKey: ['admin', 'commerce', 'order', id], queryFn: ({ signal }) => adminCommerceGet(`/orders/${id}`, undefined, signal), retry: false, staleTime: 0, gcTime: 0 });
  const order = query.data?.order;
  const mutation = useMutation({ mutationFn: () => adminCommercePatch(`/orders/${id}/state`, { revision: order.revision, ...(fulfillmentState ? { fulfillmentState } : {}), ...(paymentState ? { paymentState } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) }), onSuccess: async () => { setFulfillmentState(''); setPaymentState(''); setReason(''); await queryClient.invalidateQueries({ queryKey: ['admin', 'commerce', 'order', id] }); } });
  async function viewFile(path, label, returnFocus) {
    setLoadingFile(true); setFileError('');
    try { setFile({ ...await getPrivateAdminFile(path), label, returnFocus }); }
    catch (error) { setFileError(commerceError(error)); }
    finally { setLoadingFile(false); }
  }
  return <main className="commerce-page"><Link to="/admin/commerce/orders">← Orders</Link>{query.isPending ? <p role="status">Loading order…</p> : query.error ? <p role="alert">{commerceError(query.error)}</p> : order && <><OrderRecord order={order} /><section className="commerce-editor"><h2>Manage Order</h2><p className="commerce-muted">Changes are authorized and recorded on the server. Invalid payment or fulfillment transitions are rejected.</p><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="commerce-editor-grid"><label className="commerce-field">Fulfillment update<select value={fulfillmentState} onChange={(event) => setFulfillmentState(event.target.value)}><option value="">Keep {order.fulfillmentState.replaceAll('_', ' ')}</option>{['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'].map((state) => <option value={state} key={state}>{state.replaceAll('_', ' ')}</option>)}</select></label><label className="commerce-field">Payment update<select value={paymentState} onChange={(event) => setPaymentState(event.target.value)}><option value="">Keep {order.paymentState.replaceAll('_', ' ')}</option><option value="paid">{order.paymentMethod === 'instapay' ? 'Verify full InstaPay payment' : 'Confirm COD collected'}</option>{order.paymentMethod === 'instapay' && <option value="rejected">Reject payment proof</option>}</select></label></div><label className="commerce-field">Reason / audit note<textarea value={reason} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} required={paymentState === 'rejected' || fulfillmentState === 'cancelled'} /></label><button className="button button-primary" disabled={mutation.isPending || (!fulfillmentState && !paymentState)}>{mutation.isPending ? 'Saving…' : 'Save order update'}</button>{mutation.isSuccess && <p role="status">Order updated.</p>}{mutation.error && <p className="form-error" role="alert">{commerceError(mutation.error)}</p>}</form></section>
      <section className="commerce-editor"><h2>Private Files</h2><p>Files are loaded only when you request them.</p>{order.proofAvailable && <button className="button button-secondary" disabled={loadingFile} onClick={(event) => viewFile(`/orders/${id}/proof`, 'InstaPay payment proof', event.currentTarget)}>{loadingFile ? 'Loading private file…' : 'View Proof'}</button>}<div className="commerce-editor-actions">{(order.files || []).filter((entry) => entry.purpose !== 'payment_proof').map((entry, index) => <button key={entry._id || entry.id} className="button button-secondary" disabled={loadingFile} onClick={(event) => viewFile(`/orders/${id}/files/${entry._id || entry.id}`, `Customer ${entry.purpose === 'artwork' ? 'artwork' : 'personalization'} ${index + 1}`, event.currentTarget)}>View {entry.purpose === 'artwork' ? 'Artwork' : 'Personalization'} {index + 1}</button>)}</div>{fileError && <p className="form-error" role="alert">{fileError}</p>}</section>
    </>}{file && <PrivateFileDialog file={file} onClose={() => setFile(null)} />}</main>;
}
