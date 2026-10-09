import AdminForm, { hasAdminFieldErrors } from '../admin/AdminForm.jsx';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCommerceGet, adminCommercePatch, commerceError, getPrivateAdminFile } from '../commerce/api';
import { OrderRecord } from './OrdersPage';
import AdminLayout from '../admin/AdminLayout.jsx';
import { adminOrderActions } from '../admin/order-actions.js';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';
import useModalDialog from '../components/useModalDialog.js';
import { sessionSnapshot } from '../auth/session.js';

function PrivateFileDialog({ file, onClose }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose, returnFocus: file.returnFocus });
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <dialog ref={dialogRef} {...dialogProps} className="commerce-private-dialog" aria-labelledby="private-file-title"><div className="commerce-heading"><h2 id="private-file-title">{file.label}</h2><button type="button" className="commerce-link-button" onClick={onClose} aria-label="Close private file">Close</button></div>{url && <img src={url} alt={file.label} />}<p className="commerce-muted">Private authenticated file. Close this viewer when you have finished reviewing.</p></dialog>;
}

function ContactDetails({ customer }) {
  if (!customer) return null;
  return <section className="admin-panel admin-order-contact" aria-labelledby="admin-delivery-title"><h2 id="admin-delivery-title">Customer and delivery details</h2><dl>
    <div><dt>Customer name</dt><dd>{customer.name || 'Not supplied'}</dd></div>
    <div><dt>Email</dt><dd>{customer.email ? <a href={'mailto:' + customer.email}>{customer.email}</a> : 'Not supplied'}</dd></div>
    <div><dt>Phone</dt><dd>{customer.phone ? <a href={'tel:' + customer.phone}>{customer.phone}</a> : 'Not supplied'}</dd></div>
    <div><dt>Governorate</dt><dd>{customer.governorate || 'Not supplied'}</dd></div>
    <div><dt>Delivery address</dt><dd className="admin-order-address">{customer.address || 'Not supplied'}</dd></div>
    <div><dt>Customer order notes</dt><dd className="admin-order-address">{customer.notes || 'No customer notes'}</dd></div>
  </dl></section>;
}

export default function AdminOrderPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [fulfillmentState, setFulfillmentState] = useState('');
  const [paymentState, setPaymentState] = useState('');
  const [publicReason, setPublicReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const query = useQuery({ queryKey: ['admin', 'commerce', 'order', id], queryFn: ({ signal }) => adminCommerceGet('/orders/' + id, undefined, signal), retry: false, staleTime: 0, gcTime: 0 });
  const order = query.data?.order;
  const choices = order ? adminOrderActions(order, { fulfillmentState, paymentState }) : { fulfillment: [], payment: [] };
  const validSelection = Boolean(fulfillmentState || paymentState) && (!fulfillmentState || choices.fulfillment.includes(fulfillmentState)) && (!paymentState || choices.payment.includes(paymentState));
  const mutation = useMutation({ mutationFn: () => adminCommercePatch('/orders/' + id + '/state', { revision: order.revision, ...(fulfillmentState ? { fulfillmentState } : {}), ...(paymentState ? { paymentState } : {}), ...(publicReason.trim() ? { publicReason: publicReason.trim() } : {}), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }), onSuccess: async () => {
    setFulfillmentState(''); setPaymentState(''); setPublicReason(''); setInternalNote('');
    await invalidateAdminDependencies(queryClient, 'orders');
  } });
  async function viewFile(path, label, returnFocus) {
    const generation = sessionSnapshot().generation;
    setLoadingFile(true); setFileError('');
    try {
      const result = await getPrivateAdminFile(path);
      if (sessionSnapshot().generation === generation) setFile({ ...result, label, returnFocus });
    } catch (error) { if (sessionSnapshot().generation === generation) setFileError(commerceError(error)); }
    finally { if (sessionSnapshot().generation === generation) setLoadingFile(false); }
  }
  return <AdminLayout title="Order details" busy={query.isPending} actions={<Link className="admin-button admin-button-secondary" to="/admin/commerce/orders">Back to orders</Link>}>
    {query.isPending ? <p className="admin-state" role="status">Loading order…</p> : query.error ? <div className="admin-state"><p role="alert">{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button></div> : order && <>
      <OrderRecord order={order} headingLevel={2} />
      <ContactDetails customer={order.customer} />
      <section className="commerce-editor"><h2>Manage Order</h2><p className="commerce-muted">Only valid next steps are offered. The server independently authorizes and records each update.</p>
        {order.paymentMethod === 'instapay' && order.paymentState !== 'paid' && order.fulfillmentState !== 'cancelled' && <p className="commerce-notice">Verify the full InstaPay payment before confirming or preparing this order.</p>}
        {order.paymentState === 'paid' && ['received', 'confirmed'].includes(order.fulfillmentState) && <p>Paid orders require a separate refund review before cancellation.</p>}
        <AdminForm error={mutation.error} onSubmit={(event) => { event.preventDefault(); if (validSelection) mutation.mutate(); }}><fieldset className="admin-form-fields" disabled={mutation.isPending}><div className="commerce-editor-grid">
          <label className="commerce-field">Fulfillment update<select name="fulfillmentState" value={fulfillmentState} disabled={!choices.fulfillment.length} onChange={(event) => { setFulfillmentState(event.target.value); if (!adminOrderActions(order, { fulfillmentState: event.target.value, paymentState }).payment.includes(paymentState)) setPaymentState(''); }}><option value="">Keep {order.fulfillmentState.replaceAll('_', ' ')}</option>{choices.fulfillment.map(state => <option value={state} key={state}>{state.replaceAll('_', ' ')}</option>)}</select></label>
          <label className="commerce-field">Payment update<select name="paymentState" value={paymentState} disabled={!choices.payment.length} onChange={(event) => { setPaymentState(event.target.value); if (!adminOrderActions(order, { fulfillmentState, paymentState: event.target.value }).fulfillment.includes(fulfillmentState)) setFulfillmentState(''); }}><option value="">Keep {order.paymentState.replaceAll('_', ' ')}</option>{choices.payment.includes('paid') && <option value="paid">{order.paymentMethod === 'instapay' ? 'Verify full InstaPay payment' : 'Confirm COD collected'}</option>}{choices.payment.includes('rejected') && <option value="rejected">Reject payment proof</option>}</select></label>
        </div><label className="commerce-field">Customer-visible explanation<textarea name="publicReason" value={publicReason} maxLength={500} rows={3} onChange={(event) => setPublicReason(event.target.value)} required={paymentState === 'rejected' || fulfillmentState === 'cancelled'} /></label><label className="commerce-field">Private operational note<textarea name="internalNote" value={internalNote} maxLength={500} rows={3} onChange={(event) => setInternalNote(event.target.value)} /></label>
        {!choices.fulfillment.length && !choices.payment.length && <p>No status changes are available for this order.</p>}
        <button className="button button-primary" disabled={mutation.isPending || !validSelection}>{mutation.isPending ? 'Saving…' : 'Save order update'}</button>{mutation.isSuccess && <p role="status">Order updated.</p>}{mutation.error && !hasAdminFieldErrors(mutation.error) && <p className="form-error" role="alert">{commerceError(mutation.error)}</p>}
        {mutation.error?.response?.data?.error?.code === 'ORDER_CHANGED' && <p className="admin-feedback" role="alert">This order changed while you were editing. Your explanations are retained. Review the latest state before saving again. <button type="button" className="admin-text-button" onClick={async () => { await query.refetch(); setFulfillmentState(''); setPaymentState(''); mutation.reset(); }}>Reload latest order status</button></p>}
        </fieldset></AdminForm>
      </section>
      <section className="commerce-editor"><h2>Private operational history</h2>{(order.history || []).some(entry => entry.internalNote) ? order.history.filter(entry => entry.internalNote).map((entry, index) => <p key={index}>{entry.internalNote}</p>) : <p>No private notes recorded.</p>}</section>
      <section className="commerce-editor"><h2>Private Files</h2><p>Files are loaded only when you request them.</p>{order.proofAvailable && <button className="button button-secondary" disabled={loadingFile} onClick={event => viewFile('/orders/' + id + '/proof', 'InstaPay payment proof', event.currentTarget)}>{loadingFile ? 'Loading private file…' : 'View Proof'}</button>}<div className="commerce-editor-actions">{(order.files || []).filter(entry => entry.purpose !== 'payment_proof').map((entry, index) => <button key={entry._id || entry.id} className="button button-secondary" disabled={loadingFile} onClick={event => viewFile('/orders/' + id + '/files/' + (entry._id || entry.id), 'Customer ' + (entry.purpose === 'artwork' ? 'artwork' : 'personalization') + ' ' + (index + 1), event.currentTarget)}>View {entry.purpose === 'artwork' ? 'Artwork' : 'Personalization'} {index + 1}</button>)}</div>{fileError && <p className="form-error" role="alert">{fileError}</p>}</section>
    </>}{file && <PrivateFileDialog file={file} onClose={() => setFile(null)} />}
  </AdminLayout>;
}
