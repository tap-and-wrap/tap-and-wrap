import Select from '../components/form/Select.jsx';
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
export function ContactPanel({ row, onSaved }) {
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
    <label className="commerce-field">WhatsApp message<Select value={message} onChange={event => setMessage(event.target.value)}>{detail.data.messages.map(item => <option key={item.key} value={item.key}>{messageLabels[item.key]}</option>)}</Select></label>
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
export default function AdminAttentionPage() {
  const session = useSession(), [params, setParams] = useSearchParams(), [selected, setSelected] = useState(null);
  const page = Number(params.get('page') || 1), view = params.get('view') || 'all';
  const queue = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'attention', page, view), queryFn: ({ signal }) => adminCommerceGet('/attention', { page, view }, signal), retry: false, refetchInterval: 30000, staleTime: 0 });
  const change = (key, value) => { params.set(key, String(value)); if (key === 'view') params.delete('page'); setParams(params); };
  return <AdminLayout title="Contacts & quotations" description="Follow up with customers and keep each order moving." actions={<Link className="admin-button admin-button-secondary" to="/admin/orders">Back to Orders</Link>} busy={queue.isPending}>
    <label className="commerce-field">Attention filter<Select value={view} onChange={event => change('view', event.target.value)}><option value="all">All active orders and requests</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
    {queue.error && <p role="alert">{commerceError(queue.error)}</p>}{queue.isPending && <p role="status">Loading attention queue…</p>}
    <div className="attention-grid">{queue.data?.records.map(row => <article className="admin-panel attention-card" key={`${row.kind}:${row.id}`}><h2>{row.reference}</h2><p>{row.customer.name} · {row.kind === 'request' ? 'Custom request' : 'Order'}</p><p>Submitted {date(row.createdAt)}<br />Initial contact due {date(row.timing.dueAt)}</p><p className={row.timing.overdue ? 'attention-overdue' : ''}>{timingLabel(row.timing)}</p><p>{row.responseState === 'waiting_customer' ? 'Waiting for customer' : row.responseState === 'clear' ? 'No response outstanding' : 'Requires action'}{row.paymentState ? ` · ${row.paymentState === 'awaiting_verification' ? 'Payment under verification' : row.paymentState.replaceAll('_', ' ')}` : ''}{row.fulfillmentState ? ` · ${row.fulfillmentState.replaceAll('_', ' ')}` : ''}</p><ul>{row.flags.map(flag => <li key={flag}>{labels[flag]}</li>)}</ul><button className="button button-secondary" type="button" onClick={() => setSelected(row)}>Contact and actions for {row.reference}</button><Link to={row.href}>Open full record</Link></article>)}</div>
    {queue.data?.records.length === 0 && <p>No matching active work. Completed and cancelled records remain in their order/request history.</p>}
    <nav className="commerce-pagination"><button disabled={page <= 1} onClick={() => change('page', page - 1)}>Previous attention page</button><span>Page {page}</span><button disabled={!queue.data || page >= queue.data.pagination.pages} onClick={() => change('page', page + 1)}>Next attention page</button></nav>
    {selected && <ContactPanel key={`${session.ownerKey}:${selected.kind}:${selected.id}`} row={selected} onSaved={() => { void queue.refetch(); }} />}
  </AdminLayout>;
}
