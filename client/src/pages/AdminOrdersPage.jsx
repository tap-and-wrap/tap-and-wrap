import CheckoutPaymentRecovery from '../admin/CheckoutPaymentRecovery.jsx';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../admin/AdminLayout.jsx';
import OrderTable from '../admin/OrderTable.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { adminCommerceGet, commerceError } from '../commerce/api.js';
import Select from '../components/form/Select.jsx';

const views = [['all', 'All'], ['requires_action', 'Requires action'], ['unpaid', 'Unpaid'], ['verification', 'Verify payment'], ['preparing', 'Preparing'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
export default function AdminOrdersPage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(params.get('q') || '');
  const page = Math.min(200, Math.max(1, Number(params.get('page')) || 1));
  const view = views.some(([value]) => value === params.get('view')) ? params.get('view') : 'all';
  const filters = Object.fromEntries(['q', 'sort', 'type', 'action', 'fulfillmentState', 'paymentState'].flatMap(key => params.get(key) ? [[key, params.get(key)]] : []));
  const query = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'owner-orders', page, view, filters), queryFn: ({ signal }) => adminCommerceGet('/orders', { ...filters, page, view, limit: 20 }, signal), retry: false, staleTime: 0 });
  function change(key, value) { const next = new URLSearchParams(params); next.delete('page'); if (value) next.set(key, value); else next.delete(key); setParams(next); }
  function selectView(next) { const search = new URLSearchParams(params); ['page', 'action', 'fulfillmentState', 'paymentState'].forEach(key => search.delete(key)); search.set('view', next); setParams(search); }
  const pages = Math.max(1, query.data?.pagination?.pages || 1);
  return <AdminLayout title="Orders" description="Every purchase, Gift Box and engraving job. One place to take the next step." actions={<Link className="admin-button admin-button-secondary" to="/admin/orders/requests">Quotation history</Link>} busy={query.isPending}>
    <CheckoutPaymentRecovery key={session.ownerKey}/><section className="owner-workspace">
      <nav className="owner-view-tabs" aria-label="Order views">{views.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => selectView(key)}>{label}</button>)}</nav>
      <div className="owner-filter-row"><form className="admin-search" onSubmit={event => { event.preventDefault(); change('q', draft.trim()); }}><label htmlFor="owner-order-search">Find an order</label><div className="admin-inline"><input id="owner-order-search" type="search" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} placeholder="Six-digit order number" value={draft} onChange={event => setDraft(event.target.value)}/><button className="admin-button admin-button-secondary">Search</button>{params.get('q') && <button type="button" className="admin-button admin-button-secondary" onClick={() => { setDraft(''); change('q', ''); }}>Clear</button>}</div></form>
        <label>Item type<Select value={params.get('type') || ''} onChange={event => change('type', event.target.value)}><option value="">All types</option><option value="product">Product</option><option value="gift_box">Gift Box</option><option value="engraving">Engraving</option><option value="mixed">Mixed</option></Select></label>
        <label>Sort<Select value={params.get('sort') || 'newest'} onChange={event => change('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></Select></label>
      </div>
      {Object.entries(filters).some(([key]) => ['action', 'fulfillmentState', 'paymentState'].includes(key)) && <p className="owner-filter-context">Filtered by {filters.action || filters.paymentState || filters.fulfillmentState}. <button type="button" className="admin-text-button" onClick={() => selectView('all')}>Show all orders</button></p>}
      {query.isPending ? <p className="admin-state" role="status">Loading orders…</p> : query.error ? <div className="admin-state" role="alert"><p>{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button></div> : <OrderTable orders={query.data?.orders || []}/>}
      <nav className="admin-pagination" aria-label="Order pages"><button className="admin-button admin-button-secondary" disabled={page <= 1 || query.isFetching} onClick={() => { const next = new URLSearchParams(params); next.set('page', page - 1); setParams(next); }}>Previous</button><span>Page {page} of {pages}{query.data && ` · ${query.data.pagination.total} orders`}</span><button className="admin-button admin-button-secondary" disabled={page >= pages || page >= 200 || query.isFetching} onClick={() => { const next = new URLSearchParams(params); next.set('page', page + 1); setParams(next); }}>Next</button></nav>
    </section>
  </AdminLayout>;
}
