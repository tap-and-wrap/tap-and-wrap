import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import AdminForm, { hasAdminFieldErrors } from '../admin/AdminForm.jsx';
import AdminLayout from '../admin/AdminLayout.jsx';
import EditConflict from '../admin/EditConflict.jsx';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';
import { validatePromotionSchedule } from '../admin/cairo-time.js';
import { DiscountEditor } from '../commerce/AdminEditors.jsx';
import CategoryRestrictions from '../commerce/CategoryRestrictions.jsx';
import { adminCommerceGet, adminCommercePost, adminCommercePatch, commerceError } from '../commerce/api.js';

const fields = ['code', 'name', 'active', 'kind', 'value', 'minimumSubtotalPiastres', 'maximumDiscountPiastres', 'productIds', 'categoryIds', 'authenticatedOnly', 'startsAt', 'endsAt', 'usageLimit', 'perCustomerLimit'];
const empty = { code: '', name: '', active: false, kind: 'fixed', value: 0, minimumSubtotalPiastres: 0, maximumDiscountPiastres: null, productIds: [], categoryIds: [], authenticatedOnly: false, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null };
export default function AdminCommercePage() {
  const [params, setParams] = useSearchParams();
  const cache = useQueryClient();
  const page = Math.min(200, Math.max(1, Number(params.get('page')) || 1));
  const [draftSearch, setDraftSearch] = useState(params.get('search') || '');
  const [editor, setEditor] = useState(null), [loadError, setLoadError] = useState('');
  const query = useQuery({ queryKey: ['admin', 'commerce', 'discounts', page, params.get('search') || ''], queryFn: ({ signal }) => adminCommerceGet('/discounts', { page, limit: 20, ...(params.get('search') ? { search: params.get('search') } : {}) }, signal), retry: false, staleTime: 0 });
  const save = useMutation({ onMutate: () => toast.dismiss('admin-discount-save'), mutationFn: () => {
    validatePromotionSchedule(editor.value);
    const payload = Object.fromEntries(fields.filter(key => editor.value[key] !== undefined).map(key => [key, editor.value[key]]));
    if (editor.id) payload.expectedRevision = editor.value.revision;
    return editor.id ? adminCommercePatch(`/discounts/${editor.id}`, payload) : adminCommercePost('/discounts', payload);
  }, onSuccess: async result => {
    setEditor({ id: result.discount._id || result.discount.id, value: structuredClone(result.discount) });
    toast.success('Discount saved.', { id: 'admin-discount-save' });
    await invalidateAdminDependencies(cache, 'discounts');
  } });
  async function edit(entry) {
    setLoadError('');
    try { const result = await adminCommerceGet(`/discounts/${entry._id || entry.id}`); setEditor({ id: entry._id || entry.id, value: structuredClone(result.discount) }); save.reset(); }
    catch (error) { setLoadError(commerceError(error)); }
  }
  const pages = Math.max(1, query.data?.pagination.pages || 1);
  return <AdminLayout title="Discounts" description="Create a code, choose its value and decide when customers can use it." actions={<button className="admin-button" disabled={save.isPending} onClick={() => { setEditor({ id: null, value: structuredClone(empty) }); save.reset(); }}>Add discount</button>}>
    <section className="owner-workspace"><form className="owner-filter-row" onSubmit={event => { event.preventDefault(); setParams(draftSearch.trim() ? { search: draftSearch.trim() } : {}); }}><label>Find a discount<input type="search" maxLength={100} value={draftSearch} onChange={event => setDraftSearch(event.target.value)}/></label><button className="admin-button admin-button-secondary">Search</button></form>
      {query.isPending ? <p className="admin-state" role="status">Loading discounts...</p> : query.error ? <div className="admin-state" role="alert"><p>{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button></div> : query.data?.discounts.length ? <div className="admin-table-scroll" role="region" aria-label="Discount codes" tabIndex={0}><table className="admin-products-table"><thead><tr><th>Name / Code</th><th>Status</th><th>Usage</th><th>Action</th></tr></thead><tbody>{query.data.discounts.map(entry => <tr key={entry._id || entry.id}><td><strong>{entry.name}</strong><span className="admin-cell-note">{entry.code}</span></td><td><span className="owner-type">{entry.active ? entry.endsAt && new Date(entry.endsAt) <= new Date() ? 'Expired' : entry.startsAt && new Date(entry.startsAt) > new Date() ? 'Scheduled' : 'Active' : 'Inactive'}</span></td><td>{entry.usedCount || 0}{entry.usageLimit ? ` / ${entry.usageLimit}` : ''}</td><td><button className="admin-button admin-button-secondary" disabled={save.isPending} onClick={() => edit(entry)}>Edit {entry.name || entry.code}</button></td></tr>)}</tbody></table></div> : <div className="admin-empty"><h3>Your next promotion starts here</h3><p>Create a discount code when you’re ready to offer one.</p></div>}
      <nav className="admin-pagination" aria-label="Discount pages"><button className="admin-button admin-button-secondary" disabled={page <= 1 || query.isFetching} onClick={() => { const next = new URLSearchParams(params); next.set('page', page - 1); setParams(next); }}>Previous</button><span>Page {page} of {pages}</span><button className="admin-button admin-button-secondary" disabled={page >= pages || page >= 200 || query.isFetching} onClick={() => { const next = new URLSearchParams(params); next.set('page', page + 1); setParams(next); }}>Next</button></nav>
    </section>{loadError && <p role="alert">{loadError}</p>}
    {editor && <section className="admin-panel"><AdminForm error={save.error} className="commerce-editor" onSubmit={event => { event.preventDefault(); save.mutate(); }}><fieldset className="admin-form-fields" disabled={save.isPending}><div className="commerce-heading"><h2>{editor.id ? 'Edit discount' : 'New discount'}</h2><button className="admin-button admin-button-secondary" type="button" onClick={() => setEditor(null)}>Close editor</button></div><DiscountEditor key={editor.id || 'new'} value={editor.value} onChange={value => setEditor(previous => ({ ...previous, value }))}/><CategoryRestrictions values={editor.value.categoryIds || []} onChange={categoryIds => setEditor(previous => ({ ...previous, value: { ...previous.value, categoryIds } }))}/><EditConflict error={save.error} onReload={async () => { const result = await adminCommerceGet(`/discounts/${editor.id}`); setEditor({ id: editor.id, value: structuredClone(result.discount) }); save.reset(); }}/>{save.error && !hasAdminFieldErrors(save.error) && <p role="alert">{commerceError(save.error)}</p>}<button className="admin-button" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save discount'}</button></fieldset></AdminForm></section>}
  </AdminLayout>;
}
