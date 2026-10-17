import { notificationTitle } from '../admin/notification-labels.js';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import AdminLayout from '../admin/AdminLayout.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { adminCommerceGet, adminCommercePost, commerceError } from '../commerce/api.js';
import '../commerce/operations.css';

const labels = { initial: 'Initial WhatsApp contact', overdue: 'Overdue initial contact', shipping: 'Delivery confirmation', quote_preparation: 'Quotation to prepare', quote_sharing: 'Quotation prepared, not shared', acceptance: 'Waiting for quotation acceptance', payment_review: 'Payment / refund needs review', payment_pending: 'Payment pending', response: 'Customer response needed' };
const messageLabels = { initial: 'Initial contact', shipping: 'Delivery confirmation', quotation: 'Saved quotation', payment: 'Payment instructions', follow_up: 'Payment follow-up', coordination: 'Preparation / delivery coordination' };
const date = value => value ? new Date(value).toLocaleString() : 'Not recorded';
function timingLabel(timing) {
  if (timing.contactedAt) return `Contact recorded ${date(timing.contactedAt)}`;
  if (timing.overdue) return 'Overdue — contact the customer now';
  const minutes = Math.ceil(timing.remainingMs / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining for initial contact`;
}
function ContactPanel({ row, onSaved }) {
  const session = useSession(), [note, setNote] = useState(''), [message, setMessage] = useState('initial'), [uncertain, setUncertain] = useState(false);
  const operation = useRef(null);
  const detail = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'attention-detail', row.kind, row.id), queryFn: ({ signal }) => adminCommerceGet(`/attention/${row.kind}/${row.id}`, undefined, signal), retry: false, refetchInterval: 30000, staleTime: 0 });
  const mutation = useMutation({ mutationFn: action => {
    operation.current ||= { revision: detail.data.revision, operationKey: crypto.randomUUID(), action, note: note.trim() };
    return adminCommercePost(`/attention/${row.kind}/${row.id}/contact`, operation.current);
  }, onSuccess: () => { operation.current = null; setUncertain(false); void detail.refetch(); onSaved(); }, onError: error => { if (!error.response || error.response.status >= 500) setUncertain(true); else { operation.current = null; setUncertain(false); } } });
  if (!detail.data) return <p role={detail.error ? 'alert' : 'status'}>{detail.error ? commerceError(detail.error) : 'Loading contact record…'}</p>;
  const selected = detail.data.messages.find(item => item.key === message);
  return <section className="admin-panel attention-contact"><h2>Contact record: {row.reference}</h2><p>{timingLabel(detail.data.timing)}. Original submission: {date(detail.data.timing.submittedAt)}. Deadline: {date(detail.data.timing.dueAt)}.</p>
    <label className="commerce-field">WhatsApp message<select value={message} onChange={event => setMessage(event.target.value)}>{detail.data.messages.map(item => <option key={item.key} value={item.key}>{messageLabels[item.key]}</option>)}</select></label>
    {selected && <><textarea className="attention-message" aria-label="Saved WhatsApp message" value={selected.text} readOnly />{selected.url && <a className="button button-secondary" target="_blank" rel="noopener noreferrer" href={selected.url}>Open WhatsApp manually</a>}</>}
    <p>Opening WhatsApp records nothing. Send manually, then record actual contact. Quotation sharing and acceptance remain separate actions in the saved order/request workflow.</p>
    <label className="commerce-field">Private contact / response note<textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></label>
    <fieldset disabled={mutation.isPending || uncertain || note.trim().length < 2} className="attention-actions">
      <button className="button button-primary" type="button" onClick={() => mutation.mutate('contact')}>Mark as Contacted</button>
      {detail.data.canRecordQuotationShared && <button className="button button-secondary" type="button" onClick={() => mutation.mutate('quote_shared')}>Record delivery quotation actually shared</button>}
      <button className="button button-secondary" type="button" onClick={() => mutation.mutate('requires_action')}>Customer needs a response</button>
      <button className="button button-secondary" type="button" onClick={() => mutation.mutate('waiting_customer')}>Waiting for customer</button>
      <button className="button button-secondary" type="button" onClick={() => mutation.mutate('clear')}>No response outstanding</button>
    </fieldset>
    {mutation.error && <p role="alert">{commerceError(mutation.error)} {uncertain ? <button type="button" onClick={() => mutation.mutate()}>Retry same contact action</button> : <button type="button" onClick={() => { mutation.reset(); void detail.refetch(); }}>Reload latest record; keep note</button>}</p>}
    {mutation.isSuccess && <p role="status">Contact record saved. Payment and acceptance are unchanged.</p>}
    <details><summary>Contact history</summary>{detail.data.contactHistory.map((entry, index) => <p key={index}>{date(entry.at)} · {entry.action === 'contact' ? 'Actual contact recorded' : entry.action.replaceAll('_', ' ')} · {entry.note}</p>)}</details><Link to={row.href}>Open full {row.kind} record</Link>
  </section>;
}
const deliveryLabels = { queued: 'Queued for delivery', failed: 'Temporary failure; retry scheduled', uncertain: 'Delivery uncertain; verify provider records before closing', dead: 'Delivery stopped; operator review required', suppressed: 'Suppressed / reviewed', sent: 'Accepted by provider' };
function Diagnostics({ data, refresh }) {
  const [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false);
  const review = useMutation({ mutationFn: ({ id, disposition }) => adminCommercePost(`/operations/notifications/${id}/review`, { disposition, note, confirmed }), onSuccess: refresh });
  const ready = data.readiness;
  return <section className="admin-panel"><h2>Communication and job readiness</h2><p>Email provider: {ready.provider}. {ready.deliveryReady ? 'Configured for the authorized recipient scope.' : 'Delivery is held until provider, recipient scope and activation cutoff are configured.'} Configuration checks do not prove provider delivery.</p><p>Owner alerts: {ready.ownerAlertsConfigured ? 'Separately configured recipient confirmed' : 'Not configured — dashboard attention remains available'}. Queued messages held by activation cutoff: {data.historicalHeld}.</p><p>Last job: {data.lastRun ? `${date(data.lastRun.startedAt)} · ${data.lastRun.state.replaceAll('_', ' ')}` : 'No job execution recorded'}. {data.lastRun && new Date(data.serverNow) - new Date(data.lastRun.startedAt) > 10 * 60000 ? 'Worker heartbeat is late. Ask the operator to check the authorized schedule.' : ''}</p>
    <p>Queued / scheduled: {data.counts?.queued || 0}. Retry scheduled: {data.counts?.failed || 0}. Delivery review: {(data.counts?.uncertain || 0) + (data.counts?.dead || 0)}.</p>
    <p>Undelivered messages never cancel accepted orders. Temporary failures retry with bounded backoff. Uncertain delivery is never automatically replayed; check actual provider records first. This screen cannot send emails or enable providers.</p>
    {data.failedRuns.length > 0 && <p role="status">Recent failed/interrupted job history: {data.failedRuns.length}. Check the latest run and current provider health.</p>}
    <label className="commerce-field">Private notification review note<textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></label><label className="admin-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I checked the provider&apos;s actual delivery record. These actions never resend.</label>
    {data.events.map(event => <article key={event._id} className="attention-delivery"><p>{notificationTitle(event.event)} · {date(event.createdAt)} · {deliveryLabels[event.state]}</p><p>{event.href && <Link to={event.href}>Open related record {event.reference || ''}</Link>}</p><p>Attempts: {event.attempts}{event.state === 'failed' ? `; next retry ${date(event.nextAttemptAt)}` : ''}</p>{['uncertain', 'dead'].includes(event.state) && <div className="attention-actions"><button type="button" disabled={!confirmed || note.trim().length < 5 || review.isPending} onClick={() => review.mutate({ id: event._id, disposition: 'confirmed_delivered' })}>Record confirmed email delivery</button><button type="button" disabled={!confirmed || note.trim().length < 5 || review.isPending} onClick={() => review.mutate({ id: event._id, disposition: 'closed_no_resend' })}>Close without resending</button></div>}</article>)}
    {review.error && <p role="alert">{commerceError(review.error)} Reload diagnostics before another review action.</p>}
  </section>;
}
export default function AdminAttentionPage() {
  const session = useSession(), [params, setParams] = useSearchParams(), [selected, setSelected] = useState(null);
  const page = Number(params.get('page') || 1), view = params.get('view') || 'all';
  const queue = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'attention', page, view), queryFn: ({ signal }) => adminCommerceGet('/attention', { page, view }, signal), retry: false, refetchInterval: 30000, staleTime: 0 });
  const diagnostics = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'operations'), queryFn: ({ signal }) => adminCommerceGet('/operations', undefined, signal), retry: false, refetchInterval: 60000, staleTime: 0 });
  const change = (key, value) => { params.set(key, String(value)); if (key === 'view') params.delete('page'); setParams(params); };
  return <AdminLayout title="Owner attention" description="WhatsApp first. One immediate owner email, one reminder at 9 hours if uncontacted, and dashboard-only overdue at 12 hours." busy={queue.isPending}>
    <label className="commerce-field">Attention filter<select value={view} onChange={event => change('view', event.target.value)}><option value="all">All active orders and requests</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {queue.error && <p role="alert">{commerceError(queue.error)}</p>}{queue.isPending && <p role="status">Loading attention queue…</p>}
    <div className="attention-grid">{queue.data?.records.map(row => <article className="admin-panel attention-card" key={`${row.kind}:${row.id}`}><h2>{row.reference}</h2><p>{row.customer.name} · {row.kind === 'request' ? 'Custom request' : 'Order'}</p><p>Submitted {date(row.createdAt)}<br />Initial contact due {date(row.timing.dueAt)}</p><p className={row.timing.overdue ? 'attention-overdue' : ''}>{timingLabel(row.timing)}</p><p>{row.responseState === 'waiting_customer' ? 'Waiting for customer' : row.responseState === 'clear' ? 'No response outstanding' : 'Requires action'}{row.paymentState ? ` · ${row.paymentState === 'awaiting_verification' ? 'Payment under verification' : row.paymentState.replaceAll('_', ' ')}` : ''}{row.fulfillmentState ? ` · ${row.fulfillmentState.replaceAll('_', ' ')}` : ''}</p><ul>{row.flags.map(flag => <li key={flag}>{labels[flag]}</li>)}</ul><button className="button button-secondary" type="button" onClick={() => setSelected(row)}>Contact and actions for {row.reference}</button><Link to={row.href}>Open full record</Link></article>)}</div>
    {queue.data?.records.length === 0 && <p>No matching active work. Completed and cancelled records remain in their order/request history.</p>}
    <nav className="commerce-pagination"><button disabled={page <= 1} onClick={() => change('page', page - 1)}>Previous attention page</button><span>Page {page}</span><button disabled={!queue.data || page >= queue.data.pagination.pages} onClick={() => change('page', page + 1)}>Next attention page</button></nav>
    {selected && <ContactPanel key={`${session.ownerKey}:${selected.kind}:${selected.id}`} row={selected} onSaved={() => { void queue.refetch(); }} />}
    {diagnostics.data && <Diagnostics key={session.ownerKey} data={diagnostics.data} refresh={() => { void diagnostics.refetch(); }} />}{diagnostics.error && <p role="alert">Diagnostics could not load: {commerceError(diagnostics.error)}</p>}
  </AdminLayout>;
}
