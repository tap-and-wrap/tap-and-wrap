import { toast } from 'sonner';
import Select from '../components/form/Select.jsx';
import AdminImageGallery from '../admin/AdminImageGallery.jsx';
import AdminForm, { hasAdminFieldErrors } from '../admin/AdminForm.jsx';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { listAdminCategories } from '../services/catalog';
import { getWebsiteAdmin, saveWebsiteCategory } from '../services/website';
import { adminErrorMessage } from '../admin/catalog-form';
import EditConflict from '../admin/EditConflict';
import AdminLayout from '../admin/AdminLayout.jsx';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';
import { api } from '../services/api';
import '../admin.css';
import '../website-admin.css';

const sections = [['categories', 'Categories'], ['customers', 'Customers']];
const date = (value) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const errorMessage = (error) => error?.response?.data?.error?.details?.map((item) => item.message).join(' ') || adminErrorMessage(error);
const button = 'admin-button';
const secondary = 'admin-button admin-button-secondary';

function QueryState({ query }) {
  if (query.isPending) return <p className="admin-state" role="status">Loading…</p>;
  if (query.isError) return <div className="admin-state" role="alert"><p>{errorMessage(query.error)}</p><button type="button" className={secondary} onClick={() => query.refetch()}>Try again</button></div>;
  return null;
}
function SaveState({ mutation, fieldErrorsHandled = false }) {
  return <>{mutation.isError && (!fieldErrorsHandled || !hasAdminFieldErrors(mutation.error)) && <p className="admin-feedback admin-feedback-error" role="alert">{errorMessage(mutation.error)}</p>}</>;
}
function Pagination({ data, page, change }) {
  const pages = Math.max(1, data?.pagination?.pages || 0);
  return <nav className="admin-pagination" aria-label="Admin pagination"><button type="button" className={secondary} disabled={page <= 1} onClick={() => change(page - 1)}>Previous page</button><span>Page {page} of {pages} · {data?.pagination?.total ?? 0} records</span><button type="button" className={secondary} disabled={page >= pages || page >= 200} onClick={() => change(page + 1)}>Next page</button></nav>;
}
function useListFilters() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.min(200, Number(params.get('page')) || 1));
  const q = params.get('q') || '';
  const change = (name, value) => { const next = new URLSearchParams(params); if (value) next.set(name, String(value)); else next.delete(name); if (name !== 'page') next.delete('page'); setParams(next); };
  return { params, page, q, change };
}
function SearchForm({ q, label = 'Search', change }) {
  return <AdminForm className="admin-search" onSubmit={(event) => { event.preventDefault(); change('q', new FormData(event.currentTarget).get('q').trim()); }}><label>{label}<span className="admin-inline"><input name="q" type="search" key={q} defaultValue={q} maxLength={100} /><button className={secondary} type="submit">Search</button></span></label></AdminForm>;
}
function WebsiteCustomers() {
  const { page, q, change } = useListFilters();
  const query = useQuery({ queryKey: ['admin', 'website', 'customers', page, q], queryFn: ({ signal }) => getWebsiteAdmin('customers', { page, limit: 20, ...(q ? { q } : {}) }, signal), retry: false });
  return <><section className="admin-panel"><SearchForm q={q} change={change} label="Search by email or name" /><p>Search by exact email or the beginning of a name (case sensitive). Guest purchases stay in Orders.</p></section><QueryState query={query} />{query.data && <><div className="admin-table-scroll" tabIndex={0} aria-label="Customer accounts table"><table className="admin-products-table"><thead><tr><th>Name</th><th>Email</th><th>Account</th><th>Joined</th></tr></thead><tbody>{query.data.customers.map((customer) => <tr key={customer._id}><td>{customer.name}</td><td>{customer.email}</td><td>{customer.active ? 'Active' : 'Inactive'}</td><td>{date(customer.createdAt)}</td></tr>)}</tbody></table>{query.data.customers.length === 0 && <p className="admin-state">No matching customer accounts.</p>}</div><Pagination data={query.data} page={page} change={(value) => change('page', value)} /></>}</>;
}
function CategoryEditor({ initial, roots, done }) {
  const [mediaPending, setMediaPending] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', parentId: null, imageKey: null, active: true, featured: false, order: 0, ...initial });
  const mutation = useMutation({ mutationFn: () => saveWebsiteCategory(initial?._id, Object.fromEntries(['name', 'slug', 'parentId', 'imageKey', 'active', 'order', ...(!form.parentId ? ['featured'] : []), ...(initial ? ['expectedRevision'] : [])].map((key) => [key, key === 'expectedRevision' ? (form.revision ?? 0) : form[key]]))), onSuccess: async () => { toast.success('Category saved.', { id: 'admin-category-save' }); await done(); } });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <section className="admin-panel"><h2>{initial ? 'Edit category' : 'Add category'}</h2><AdminForm error={mutation.error} className="website-form" onSubmit={(event) => { event.preventDefault(); if (!mediaPending) mutation.mutate(); }}><fieldset disabled={mutation.isPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><label>Name<input name="name" required maxLength={160} value={form.name} onChange={(event) => update('name', event.target.value)} /></label><label>Unique slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={240} value={form.slug} onChange={(event) => update('slug', event.target.value)} /></label><label>Main category<Select name="parentId" value={form.parentId || ''} onChange={(event) => update('parentId', event.target.value || null)}><option value="">This is a main category</option>{roots.filter((root) => root._id !== initial?._id).map((root) => <option key={root._id} value={root._id}>{root.name}</option>)}</Select></label><AdminImageGallery key={form.revision ?? 0} label="Category image" max={1} keys={form.imageKey ? [form.imageKey] : []} onChange={keys => update('imageKey', keys[0] || null)} onBusyChange={setMediaPending} /><label>Display order<input name="order" type="number" min={0} required value={form.order} onChange={(event) => update('order', Number(event.target.value))} /></label><label className="admin-checkbox"><input name="active" type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} />Active</label><label className="admin-checkbox"><input name="featured" type="checkbox" checked={form.featured} disabled={Boolean(form.parentId)} onChange={(event) => update('featured', event.target.checked)} />Featured on homepage (main categories only)</label>{form.parentId && <p>Subcategories remain linked from their main category. Homepage selection applies to main categories; any existing subcategory feature metadata is preserved.</p>}<p>Catalog relationships and audited names are preserved unless explicitly edited. A category already used by products or subcategories cannot change its parent.</p><SaveState mutation={mutation} fieldErrorsHandled /><EditConflict error={mutation.error} onReload={async () => { const result = (await api.get(`/admin/categories/${initial._id}`)).data.data; setForm(result.category); mutation.reset(); }} /><div className="admin-inline"><button className={button} disabled={mutation.isPending || mediaPending}>Save category</button><button className={secondary} type="button" onClick={() => done(false)}>Close editor</button></div></fieldset></AdminForm></section>;
}
function WebsiteCategories() {
  const { page, params, change } = useListFilters();
  const parent = params.get('parent') || 'root';
  const active = params.get('active') || '';
  const [editor, setEditor] = useState(null);
  const client = useQueryClient();
  const roots = useQuery({ queryKey: ['admin', 'website', 'category-roots'], queryFn: ({ signal }) => listAdminCategories({ parent: 'root', page: 1, limit: 20 }, signal), retry: false });
  const query = useQuery({ queryKey: ['admin', 'website', 'categories', parent, active, page], queryFn: ({ signal }) => listAdminCategories({ parent, page, limit: 20, ...(active ? { active } : {}) }, signal), retry: false });
  const done = async (saved = true) => { setEditor(null); if (saved !== false) await invalidateAdminDependencies(client, 'categories'); };
  return <><section className="admin-panel"><div className="admin-inline"><label>Category group<Select value={parent} onChange={(event) => change('parent', event.target.value)}><option value="root">Main categories</option>{(roots.data?.categories || []).map((category) => <option key={category._id} value={category.slug}>{category.name} subcategories</option>)}</Select></label><label>Activity<Select value={active} onChange={(event) => change('active', event.target.value)}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></Select></label><button className={button} onClick={() => setEditor('new')}>Add category</button></div><QueryState query={roots} /></section>{editor && <CategoryEditor key={editor === 'new' ? 'new' : editor._id} initial={editor === 'new' ? null : editor} roots={roots.data?.categories || []} done={done} />}<QueryState query={query} />{query.data && <><div className="admin-table-scroll" tabIndex={0} aria-label="Category management table"><table className="admin-products-table"><thead><tr><th>Category</th><th>Products</th><th>Status</th><th>Homepage</th><th>Order</th><th>Actions</th></tr></thead><tbody>{query.data.categories.map((category) => <tr key={category._id}><td><strong>{category.name}</strong><span className="admin-cell-note">{category.slug}</span></td><td>{category.productCount}</td><td>{category.active ? 'Active' : 'Inactive'}</td><td>{category.featured ? 'Featured' : 'Not featured'}</td><td>{category.order}</td><td><button className={secondary} onClick={() => setEditor(category)}>Edit</button></td></tr>)}</tbody></table>{query.data.categories.length === 0 && <p className="admin-state">No categories in this group.</p>}</div><Pagination data={query.data} page={page} change={(value) => change('page', value)} /></>}</>;
}
export default function AdminWebsitePage({ section: selectedSection }) {
  const { section: routeSection } = useParams();
  const section = selectedSection || routeSection;
  const component = { customers: WebsiteCustomers, categories: WebsiteCategories }[section];
  const Component = component;
  const title = sections.find(([key]) => key === section)?.[1] || 'Page unavailable';
  return <AdminLayout title={title} className="website-admin">{Component ? <Component /> : <section className="admin-panel"><p>This administration section is not available.</p><Link to="/admin">Return to dashboard</Link></section>}</AdminLayout>;
}
