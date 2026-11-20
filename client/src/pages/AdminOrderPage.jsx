import Select from '../components/form/Select.jsx';
import CustomerGiftDesign from '../commerce/CustomerGiftDesign.jsx';
import EngravingWorkflow from '../engraving/EngravingWorkflow.jsx';
import EngravingOrderFiles from '../engraving/EngravingOrderFiles.jsx';
import { AdminOrderAccounting } from '../commerce/OrderFinancials.jsx';
import AdminForm, { hasAdminFieldErrors } from '../admin/AdminForm.jsx';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCommerceGet, adminCommercePatch, commerceError, getPrivateAdminFile, money } from '../commerce/api';
import { OrderRecord } from './OrdersPage.jsx';
import AdminLayout from '../admin/AdminLayout.jsx';
import { adminOrderActions } from '../admin/order-actions.js';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';
import useModalDialog from '../components/useModalDialog.js';
import { sessionSnapshot } from '../auth/session.js';
import { stateLabel, adminDate } from '../admin/OrderTable.jsx';
import { CreditCard, FileImage, Package, UserRound, Truck } from 'lucide-react';

export function PrivateFileDialog({ file, onClose }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose, returnFocus: file.returnFocus });
  const [url, setUrl] = useState('');
  useEffect(() => { const objectUrl = URL.createObjectURL(file.blob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [file]);
  return <dialog ref={dialogRef} {...dialogProps} className="commerce-private-dialog v11-private-proof" aria-labelledby="private-file-title"><div className="commerce-heading"><h2 id="private-file-title">{file.label}</h2><button type="button" className="admin-button admin-button-secondary" onClick={onClose} aria-label="Close private file">Close</button></div>{url && <img src={url} alt={file.label}/>}<p className="commerce-muted">Private customer file. Access is limited to this administrator session.</p></dialog>;
}

function Details({ customer }) {
  if (!customer) return <p className="commerce-muted">Customer details are unavailable.</p>;
  const safe = text => typeof text === 'string' && text.trim() ? text : 'Not provided';
  const delivery = typeof customer.address === 'string' ? customer.address : [customer.address?.street, customer.address?.building, customer.address?.floor, customer.address?.apartment].filter(Boolean).join(', ');
  return <dl className="v11-admin-detail-list">
    <div><dt>Name</dt><dd>{safe(customer.name)}</dd></div>
    <div><dt>Phone</dt><dd>{customer.phone ? <a href={'tel:' + customer.phone}>{customer.phone}</a> : 'Not provided'}</dd></div>
    <div><dt>Email</dt><dd>{customer.email ? <a href={'mailto:' + customer.email}>{customer.email}</a> : 'Not provided'}</dd></div>
    <div><dt>Governorate</dt><dd>{safe(customer.governorate)}</dd></div>
    <div className="v11-detail-wide"><dt>Delivery address</dt><dd>{safe(delivery)}</dd></div>
    {customer.notes && <div className="v11-detail-wide"><dt>Order notes</dt><dd>{customer.notes}</dd></div>}
  </dl>;
}

function PaymentProofs({ order, id, loading, open, error }) {
  const proofs = [
    ...(order.accountingVersion !== 2 && order.proofAvailable ? [{ id: 'legacy', scope: 'checkout', path: `/orders/${id}/proof` }] : []),
    ...(order.proofs || []).map(proof => ({ ...proof, path: `/orders/${id}/files/${proof.id}` })),
  ];
  return <section className="admin-panel v11-admin-panel" id="order-payment">
    <div className="v11-panel-heading"><div className="v11-panel-icon"><CreditCard size={19}/></div><div><h2>Payment</h2><p>{order.paymentMethod === 'instapay' ? 'InstaPay transfer' : order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Payment details'}</p></div></div>
    <dl className="v11-admin-detail-list"><div><dt>Method</dt><dd>{order.paymentMethod === 'instapay' ? 'InstaPay' : order.paymentMethod === 'cod' ? 'Cash on Delivery' : stateLabel(order.paymentMethod)}</dd></div><div><dt>Status</dt><dd><span className={`owner-status owner-status-${order.paymentState}`}>{stateLabel(order.paymentState)}</span></dd></div></dl>
    {proofs.length > 0 && <div className="v11-private-file-list"><h3>Transfer screenshots</h3>{proofs.map((proof,index)=><button type="button" className="admin-button admin-button-secondary" key={proof.id} disabled={loading} onClick={event => open(proof.path, `Payment screenshot ${index+1}`, event.currentTarget)}><FileImage size={18} aria-hidden="true"/>View screenshot {index+1}</button>)}</div>}
    {!proofs.length && <p className="commerce-muted">No checkout payment screenshot attached to this order.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
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
  const mutation = useMutation({ mutationFn: () => adminCommercePatch('/orders/' + id + '/state', { revision: order.revision, ...(fulfillmentState ? { fulfillmentState } : {}), ...(paymentState ? { paymentState } : {}), ...(publicReason.trim() ? { publicReason: publicReason.trim() } : {}), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }), onSuccess: async () => { setFulfillmentState(''); setPaymentState(''); setPublicReason(''); setInternalNote(''); await invalidateAdminDependencies(queryClient, 'orders'); } });
  async function viewFile(path, label, returnFocus) {
    const generation = sessionSnapshot().generation;
    setLoadingFile(true); setFileError('');
    try { const result = await getPrivateAdminFile(path); if (sessionSnapshot().generation === generation) setFile({ ...result, label, returnFocus }); }
    catch (error) { if (sessionSnapshot().generation === generation) setFileError(commerceError(error)); }
    finally { if (sessionSnapshot().generation === generation) setLoadingFile(false); }
  }
  const totals = order?.pricing || order?.totals || order;
  return <AdminLayout title={order ? `Order #${order.orderNumber}` : 'Order details'} description={order ? `${adminDate(order.createdAt)} · ${order.customer?.name || 'Customer'}` : undefined} busy={query.isPending} actions={<Link className="admin-button admin-button-secondary" to="/admin/orders">All orders</Link>}>
    {query.isPending ? <div role="status" className="v11-admin-skeleton">Loading order details…</div> : query.error ? <div className="admin-state" role="alert"><p>{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Retry</button></div> : order && <div className="v11-admin-order">
      <section className="v11-order-topline" aria-label="Order overview"><div><p className="admin-eyebrow">Order status</p><strong>{stateLabel(order.merchandiseFulfillment || order.fulfillmentState)}</strong><span>{order.orderNumber && `Order #${order.orderNumber}`}</span></div><div><p className="admin-eyebrow">Order total</p><strong>{Number.isSafeInteger(totals?.totalPiastres) ? money(totals.totalPiastres) : '—'}</strong><span>Saved at purchase</span></div><div><p className="admin-eyebrow">Payment</p><strong>{stateLabel(order.paymentState)}</strong><span>{order.paymentMethod === 'instapay' ? 'InstaPay' : order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Payment method'}</span></div></section>
      <div className="v11-order-columns"><div className="v11-order-main">
        <section className="admin-panel v11-admin-panel" id="order-items"><div className="v11-panel-heading"><div className="v11-panel-icon"><Package size={19}/></div><div><h2>Purchased items</h2><p>Exact selections and personalizations saved with the order</p></div></div><OrderRecord order={order} headingLevel={2} admin /></section>
        {(order.lines || []).some(line => line.kind === 'gift_box_v2') && <details className="admin-panel v11-admin-details"><summary>Gift Box arrangement previews</summary>{(order.lines || []).filter(line => line.kind === 'gift_box_v2').map((line,index) => <CustomerGiftDesign key={`${id}:${index}`} giftBox={line.giftBox} orderId={id}/>)}</details>}
        {order.engravingWorkflow && <details className="admin-panel v11-admin-details" id="legacy-engraving-handling"><summary>Engraving item handling for existing orders</summary><EngravingWorkflow order={order} admin refresh={() => invalidateAdminDependencies(queryClient, 'orders')}/>{(order.lines || []).filter(line => line.engraving?.itemKey).map((line, index) => <div key={`${line.id || index}-private-engraving`}><h3>Item photographs and engraving artwork</h3><EngravingOrderFiles orderId={id} engraving={line.engraving} admin/></div>)}</details>}
        <section className="admin-panel v11-admin-panel" id="order-status"><div className="v11-panel-heading"><div className="v11-panel-icon"><Truck size={19}/></div><div><h2>Update order status</h2><p>Choose the status the customer should see.</p></div></div>
          <AdminForm error={mutation.error} onSubmit={event => { event.preventDefault(); if (validSelection) mutation.mutate(); }}><fieldset className="admin-form-fields" disabled={mutation.isPending}>
            <div className="v11-form-fields"><label className="commerce-field">Order status<Select value={fulfillmentState} disabled={!choices.fulfillment.length} onChange={event => { setFulfillmentState(event.target.value); if (!adminOrderActions(order, { fulfillmentState: event.target.value, paymentState }).payment.includes(paymentState)) setPaymentState(''); }}><option value="">Keep {stateLabel(order.merchandiseFulfillment || order.fulfillmentState)}</option>{choices.fulfillment.map(value => <option key={value} value={value}>{stateLabel(value)}</option>)}</Select></label>
              {order.accountingVersion !== 2 && choices.payment.length > 0 && <label className="commerce-field">Payment status<Select value={paymentState} onChange={event => { setPaymentState(event.target.value); if (!adminOrderActions(order, { fulfillmentState, paymentState: event.target.value }).fulfillment.includes(fulfillmentState)) setFulfillmentState(''); }}><option value="">Keep {stateLabel(order.paymentState)}</option>{choices.payment.includes('paid') && <option value="paid">{order.paymentMethod === 'instapay' ? 'Payment verified in receiving account' : 'COD collected'}</option>}{choices.payment.includes('rejected') && <option value="rejected">Payment proof rejected</option>}</Select></label>}
            </div>
            <details className="v11-status-notes"><summary>Optional notes</summary><label className="commerce-field">Customer-visible explanation<textarea name="publicReason" value={publicReason} maxLength={500} rows={2} onChange={event => setPublicReason(event.target.value)} required={paymentState === 'rejected' || ['cancelled', 'returned', 'delivery_failed'].includes(fulfillmentState)}/></label><label className="commerce-field">Private order note<textarea name="internalNote" value={internalNote} maxLength={500} rows={2} onChange={event => setInternalNote(event.target.value)}/></label></details>
            <button className="admin-button" disabled={mutation.isPending || !validSelection}>{mutation.isPending ? 'Saving…' : 'Save status'}</button>{mutation.isSuccess && <p role="status">Order status updated.</p>}
            {mutation.error && !hasAdminFieldErrors(mutation.error) && <p className="form-error" role="alert">{commerceError(mutation.error)}</p>}
            {mutation.error?.response?.data?.error?.code === 'ORDER_CHANGED' && <p className="admin-feedback" role="alert">This order changed in another session. <button type="button" className="admin-text-button" onClick={async () => { await query.refetch(); setFulfillmentState(''); setPaymentState(''); mutation.reset(); }}>Reload the latest status</button></p>}
          </fieldset></AdminForm>
        </section>
      </div><aside className="v11-order-sidebar"><section className="admin-panel v11-admin-panel" id="order-customer" aria-labelledby="order-customer-heading"><div className="v11-panel-heading"><div className="v11-panel-icon"><UserRound size={19}/></div><div><h2 id="order-customer-heading">Customer &amp; delivery</h2></div></div><Details customer={order.customer}/></section>
        <PaymentProofs order={order} id={id} loading={loadingFile} open={viewFile} error={fileError}/>
        <details className="admin-panel v11-admin-details" id="order-financials"><summary>Payment verification and financial records</summary><p className="commerce-muted">Only record a payment after confirming the actual receiving-account transaction. A screenshot alone is not confirmation.</p><AdminOrderAccounting key={id} order={order} refresh={() => invalidateAdminDependencies(queryClient, 'orders')}/></details>
        {(order.files || []).some(entry => entry.purpose !== 'payment_proof') && <details className="admin-panel v11-admin-details" id="order-files"><summary>Customer artwork and other private files</summary><div className="v11-private-file-list">{(order.files || []).filter(entry => entry.purpose !== 'payment_proof').map((entry,index) => <button key={entry._id || entry.id} className="admin-button admin-button-secondary" disabled={loadingFile} onClick={event => viewFile(`/orders/${id}/files/${entry._id || entry.id}`, `Customer artwork ${index+1}`, event.currentTarget)}>View private file {index+1}</button>)}</div></details>}
        {(order.history || order.statusHistory || []).length > 0 && <details className="admin-panel v11-admin-details" id="private-order-history"><summary>Private notes &amp; audit history</summary><ol className="commerce-history">{(order.history || order.statusHistory || []).map((entry, index) => <li key={index}><strong>{typeof entry.event === 'string' ? entry.event.replaceAll('_',' ') : 'Order update'}</strong>{entry.at && <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time>}{entry.publicReason && <p>{entry.publicReason}</p>}{entry.internalNote && <p>{entry.internalNote}</p>}</li>)}</ol></details>}
        {order.serviceRequestId && <Link className="admin-button admin-button-secondary" to={`/admin/orders/requests/${order.serviceRequestId}`}>Historical quotation details</Link>}
      </aside></div>
    </div>}{file && <PrivateFileDialog file={file} onClose={() => setFile(null)}/>}
  </AdminLayout>;
}
