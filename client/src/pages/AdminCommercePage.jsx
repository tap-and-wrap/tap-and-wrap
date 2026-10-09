import AdminForm, { hasAdminFieldErrors } from '../admin/AdminForm.jsx';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCommerceGet, adminCommercePatch, adminCommercePost, commerceError, money } from '../commerce/api';
import { BundleEditor, CheckField, ComponentEditor, DiscountEditor, MoneyField, TemplateEditor } from '../commerce/AdminEditors';
import CategoryRestrictions from '../commerce/CategoryRestrictions';
import EditConflict from '../admin/EditConflict';
import AdminLayout from '../admin/AdminLayout.jsx';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';
import { validatePromotionSchedule } from '../admin/cairo-time.js';

const sections = ['orders', 'templates', 'components', 'bundles', 'discounts', 'shipping'];
const singular = { templates: 'template', components: 'component', bundles: 'bundle', discounts: 'discount' };
const editableKeys = {
  templates: ['key', 'name', 'kind', 'status', 'active', 'pricingMode', 'baseAdjustmentPiastres', 'groups', 'fields', 'engraving'],
  components: ['name', 'description', 'pricePiastres', 'compareAtPiastres', 'priceApproved', 'inventory', 'enabledForCustomization', 'configurationApproved', 'reviewRequired', 'merchantReviewNotes'],
  bundles: ['name', 'description', 'active', 'published', 'items', 'discountKind', 'discountValue', 'maxApplications', 'priority', 'startsAt', 'endsAt'],
  discounts: ['code', 'name', 'active', 'kind', 'value', 'minimumSubtotalPiastres', 'maximumDiscountPiastres', 'productIds', 'categoryIds', 'authenticatedOnly', 'stackWithBundles', 'startsAt', 'endsAt', 'usageLimit', 'perCustomerLimit'],
};
const defaults = {
  templates: { key: '', name: '', kind: 'generic', status: 'draft', active: false, pricingMode: 'additive', baseAdjustmentPiastres: 0, groups: [], fields: [], engraving: { materials: [], fonts: [], placements: [], maxChars: 120, textRequired: true, allowedTextLines: 1, maxCharsPerLine: 120, baseAdjustmentPiastres: 0, artworkAllowed: false, artworkRequired: false, artworkMaxFiles: 1, artworkMaxBytes: 8 * 1024 * 1024, artworkAcceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] } },
  bundles: { name: '', description: '', active: false, published: false, items: [], discountKind: 'fixed', discountValue: 0, maxApplications: 1, priority: 0, startsAt: null, endsAt: null },
  components: { name: '', slug: '', description: '', sku: '', categoryId: '', subcategoryId: null, mainImageKey: '', galleryKeys: [], pricePiastres: null, compareAtPiastres: null, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true }, enabledForCustomization: false, configurationApproved: false, reviewRequired: true, merchantReviewNotes: '' },
  discounts: { code: '', name: '', active: false, kind: 'fixed', value: 0, minimumSubtotalPiastres: 0, maximumDiscountPiastres: null, productIds: [], categoryIds: [], authenticatedOnly: false, stackWithBundles: false, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null },
};

function PromotionEditor({ value, onChange }) {
  return <><DiscountEditor value={value} onChange={onChange} /><CategoryRestrictions values={value.categoryIds || []} onChange={(categoryIds) => onChange({ ...value, categoryIds })} /></>;
}

function ShippingEditor() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(null);
  const query = useQuery({ queryKey: ['admin', 'commerce', 'shipping'], queryFn: ({ signal }) => adminCommerceGet('/shipping', undefined, signal), retry: false, staleTime: 0 });
  const configuration = value || query.data?.configuration;
  const save = useMutation({ mutationFn: () => adminCommercePatch('/shipping', { expectedRevision: configuration.revision ?? 0, cairoGizaPiastres: configuration.cairoGizaPiastres, otherGovernoratesPiastres: configuration.otherGovernoratesPiastres, approved: configuration.approved }), onSuccess: async (result) => { setValue(result.configuration); await invalidateAdminDependencies(queryClient, 'shipping'); } });
  const set = (key, next) => setValue({ ...configuration, [key]: next, ...(['cairoGizaPiastres', 'otherGovernoratesPiastres'].includes(key) && configuration[key] !== next ? { approved: false } : {}) });
  return query.isPending ? <p role="status">Loading shipping settings…</p> : query.error ? <p role="alert">{commerceError(query.error)}</p> : configuration && <AdminForm error={save.error} className="commerce-editor" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><fieldset disabled={save.isPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><h2>Egyptian Shipping Zones</h2><p>Domestic delivery only. Cairo and Giza share one rate; all other Egyptian governorates share the second rate.</p><MoneyField name="cairoGizaPiastres" label="Cairo and Giza shipping" value={configuration.cairoGizaPiastres} onChange={(next) => set('cairoGizaPiastres', next)} required /><MoneyField name="otherGovernoratesPiastres" label="Other governorates shipping" value={configuration.otherGovernoratesPiastres} onChange={(next) => set('otherGovernoratesPiastres', next)} required /><CheckField name="approved" label="Shipping rates approved" value={configuration.approved} onChange={(next) => set('approved', next)} /><p>{(query.data.governorates || []).map((governorate) => governorate.name).join(' · ')}</p><button className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save shipping settings'}</button>{save.isSuccess && <p role="status">Shipping settings saved.</p>}{save.error && !hasAdminFieldErrors(save.error) && <p className="form-error" role="alert">{commerceError(save.error)}</p>}<EditConflict error={save.error} onReload={async () => { const result = await adminCommerceGet('/shipping'); setValue(result.configuration); queryClient.setQueryData(['admin', 'commerce', 'shipping'], result); save.reset(); }} /></fieldset></AdminForm>;
}

function CommerceCollection({ section }) {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState(params.get(section === 'orders' ? 'q' : 'search') || '');
  const [editor, setEditor] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [editError, setEditError] = useState('');
  const page = Math.max(1, Number(params.get('page') || 1));
  const filters = Object.fromEntries(params);
  const query = useQuery({ queryKey: ['admin', 'commerce', section, filters], queryFn: ({ signal }) => adminCommerceGet(`/${section}`, { ...filters, page, limit: 20 }, signal), retry: false, staleTime: 0 });
  const entries = query.data?.[section] || [];
  const pagination = query.data?.pagination;
  const save = useMutation({ mutationFn: async () => {
    if (['bundles', 'discounts'].includes(section)) validatePromotionSchedule(editor.value);
    const keys = section === 'components' && !editor.id ? [...editableKeys.components, 'slug', 'sku', 'categoryId', 'subcategoryId', 'mainImageKey', 'galleryKeys'] : editableKeys[section];
    const payload = Object.fromEntries(keys.filter((key) => editor.value[key] !== undefined).map((key) => [key, editor.value[key]]));
    if (editor.id) payload.expectedRevision = editor.value.revision ?? 0;
    return editor.id ? adminCommercePatch(`/${section}/${editor.id}`, payload) : adminCommercePost(`/${section}`, payload);
  }, onSuccess: async (result) => {
    const record = result[singular[section]];
    setFeedback(result.revisionCreated ? 'A new draft revision was created. Review and approve this revision before assigning it to products.' : 'Configuration saved.');
    if (record) setEditor({ id: record._id || record.id, value: structuredClone(record) });
    await invalidateAdminDependencies(queryClient, section);
  } });
  const revision = useMutation({ mutationFn: () => adminCommercePost(`/templates/${editor.id}/revisions`, { expectedRevision: editor.value.revision ?? 0 }), onSuccess: async (result) => { setEditor({ id: result.template._id || result.template.id, value: structuredClone(result.template) }); setFeedback('New draft revision created.'); await invalidateAdminDependencies(queryClient, 'templates'); } });
  function filter(key, value) { const next = new URLSearchParams(params); next.delete('page'); if (value) next.set(key, value); else next.delete(key); setParams(next); }
  async function edit(entry) {
    setFeedback(''); setEditError('');
    try {
      const result = await adminCommerceGet(`/${section}/${entry._id || entry.id}`);
      setEditor({ id: entry._id || entry.id, value: structuredClone(result[singular[section]] || entry) });
      save.reset(); revision.reset();
    } catch (error) { setEditError(commerceError(error)); }
  }
  const Editor = section === 'templates' ? TemplateEditor : section === 'components' ? ComponentEditor : section === 'bundles' ? BundleEditor : PromotionEditor;
  return <><div className="commerce-heading"><AdminForm className="commerce-inline-form" onSubmit={(event) => { event.preventDefault(); filter(section === 'orders' ? 'q' : 'search', searchInput.trim()); }}><label className="commerce-field">{section === 'orders' ? 'Search by order number' : `Search ${section}`}<input value={searchInput} inputMode={section === 'orders' ? 'numeric' : undefined} maxLength={section === 'orders' ? 6 : 200} pattern={section === 'orders' ? '[0-9]{6}' : undefined} onChange={(event) => setSearchInput(event.target.value)} /></label><button className="button button-secondary">Search</button></AdminForm>{defaults[section] && <button className="button button-primary" disabled={save.isPending || revision.isPending} onClick={() => { setEditor({ id: null, value: structuredClone(defaults[section]) }); setFeedback(''); }}>Add {singular[section]}</button>}</div>
    {section === 'orders' && <label className="commerce-field">Order sorting<select value={params.get('sort') || 'newest'} onChange={(event) => filter('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>}
    <div className="commerce-editor-grid">{section === 'orders' ? <><label className="commerce-field">Fulfillment status<select value={params.get('fulfillmentState') || ''} onChange={(event) => filter('fulfillmentState', event.target.value)}><option value="">All</option>{['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'].map((state) => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}</select></label><label className="commerce-field">Payment status<select value={params.get('paymentState') || ''} onChange={(event) => filter('paymentState', event.target.value)}><option value="">All</option>{['unpaid', 'awaiting_verification', 'paid', 'rejected'].map((state) => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}</select></label></> : section === 'templates' ? <><label className="commerce-field">Template type<select value={params.get('kind') || ''} onChange={(event) => filter('kind', event.target.value)}><option value="">All</option><option value="gift_box">Gift box</option><option value="laser_engraving">Laser engraving</option><option value="generic">Product-level customization</option><option value="tray">Tray</option></select></label><label className="commerce-field">Approval<select value={params.get('status') || ''} onChange={(event) => filter('status', event.target.value)}><option value="">All</option><option value="draft">Draft</option><option value="approved">Approved</option></select></label></> : section === 'components' ? <><label className="commerce-field">Enabled<select value={params.get('enabled') || ''} onChange={(event) => filter('enabled', event.target.value)}><option value="">All</option><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label className="commerce-field">Approval<select value={params.get('approved') || ''} onChange={(event) => filter('approved', event.target.value)}><option value="">All</option><option value="true">Approved</option><option value="false">Unapproved</option></select></label></> : null}</div>
    {query.isPending ? <p className="admin-state" role="status">Loading {section}…</p> : query.error ? <div className="admin-state"><p role="alert">{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button></div> : !entries.length ? <p className="admin-state">No {section} found.</p> : <div className="commerce-admin-table-wrap" tabIndex={0} role="region" aria-label={`${section} table, scroll horizontally on small screens`}><table className="commerce-admin-table"><thead><tr><th scope="col">{section === 'orders' ? 'Order' : 'Name'}</th><th scope="col">Status</th><th scope="col">{section === 'orders' ? 'Payment / Total' : 'Price / Type'}</th><th scope="col">Actions</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry._id || entry.id}><td>{section === 'orders' ? `#${entry.orderNumber}` : entry.name || entry.code}</td><td>{section === 'orders' ? entry.fulfillmentState.replaceAll('_', ' ') : section === 'templates' ? `${entry.status} · v${entry.version}` : section === 'components' ? entry.configurationApproved && entry.priceApproved && entry.inventory?.approved ? 'Approved' : 'Needs approval' : entry.active ? 'Active' : 'Inactive'}</td><td>{section === 'orders' ? <>{entry.paymentState.replaceAll('_', ' ')}<br />{money(entry.totalPiastres ?? entry.totals?.totalPiastres)}</> : section === 'components' ? money(entry.pricePiastres) : entry.kind || entry.discountKind}</td><td>{section === 'orders' ? <Link to={`/admin/commerce/orders/${entry.id || entry._id}`}>View order</Link> : <button type="button" className="commerce-link-button" disabled={save.isPending || revision.isPending} onClick={() => edit(entry)}>Edit {entry.name || entry.code}</button>}</td></tr>)}</tbody></table></div>}
    <nav className="commerce-pagination" aria-label={`${section} pages`}><button disabled={page <= 1 || query.isFetching} onClick={() => { params.set('page', String(page - 1)); setParams(params); }}>Previous</button><span>Page {page}{pagination && ` of ${pagination.pages || pagination.totalPages || 1}`}</span><button disabled={query.isFetching || (pagination ? page >= (pagination.pages || pagination.totalPages || 1) : entries.length < 20)} onClick={() => { params.set('page', String(page + 1)); setParams(params); }}>Next</button></nav>
    {editError && <p className="form-error" role="alert">{editError}</p>}{editor && <AdminForm error={save.error || revision.error} className="commerce-editor" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><fieldset disabled={save.isPending || revision.isPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="commerce-heading"><h2>{editor.id ? 'Edit' : 'Add'} {singular[section]}</h2><button type="button" className="commerce-link-button" onClick={() => setEditor(null)}>Close editor</button></div>{section === 'templates' && editor.value.status === 'approved' && <p className="commerce-notice">Rule changes create a new draft revision. Existing order configurations remain unchanged.</p>}<Editor value={editor.value} onChange={(value) => setEditor((previous) => ({ ...previous, value }))} /><div className="commerce-editor-actions"><button className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save configuration'}</button>{section === 'templates' && editor.id && <button className="button button-secondary" type="button" disabled={revision.isPending} onClick={() => revision.mutate()}>Create draft revision</button>}</div>{feedback && <p role="status">{feedback}</p>}{(save.error || revision.error) && !hasAdminFieldErrors(save.error || revision.error) && <p className="form-error" role="alert">{commerceError(save.error || revision.error)}</p>}<EditConflict error={save.error || revision.error} onReload={async () => { const result = await adminCommerceGet(`/${section}/${editor.id}`); setEditor({ id: editor.id, value: structuredClone(result[singular[section]]) }); save.reset(); revision.reset(); }} /></fieldset></AdminForm>}
  </>;
}

export default function AdminCommercePage() {
  const { section = 'orders' } = useParams();
  if (!sections.includes(section)) return <AdminLayout title="Commerce Management"><p className="admin-state">Choose a valid management section.</p><Link to="/admin/commerce/orders">Orders</Link></AdminLayout>;
  return <AdminLayout title={section === 'templates' ? 'Customization' : section[0].toUpperCase() + section.slice(1)}>{section === 'shipping' ? <ShippingEditor /> : <CommerceCollection key={section} section={section} />}</AdminLayout>;
}
