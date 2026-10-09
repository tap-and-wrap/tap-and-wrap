import AdminForm, { hasAdminFieldErrors } from '../admin/AdminForm.jsx';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { adminCommerceGet, adminCommercePatch, commerceError } from '../commerce/api';
import { CheckField, FieldDefinitions } from '../commerce/AdminEditors';
import EditConflict from '../admin/EditConflict';
import AdminLayout from '../admin/AdminLayout.jsx';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';

function ConfigurationForm({ product }) {
  const queryClient = useQueryClient();
  const [personalization, setPersonalization] = useState(() => structuredClone(product.personalization || { fields: [] }));
  const [revision, setRevision] = useState(product.revision ?? 0);
  const [customization, setCustomization] = useState(() => structuredClone(product.customization || { enabled: false, templateId: null, serviceKind: null, serviceEntryEligible: false }));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const templates = useQuery({ queryKey: ['admin', 'commerce', 'assignment-templates', page, search], queryFn: ({ signal }) => adminCommerceGet('/templates', { page, limit: 20, status: 'approved', ...(search ? { search } : {}) }, signal), retry: false, staleTime: 30_000 });
  const list = templates.data?.templates || [];
  const templateId = customization.templateId?._id || customization.templateId || '';
  const save = useMutation({ mutationFn: () => adminCommercePatch(`/products/${product._id || product.id}/configuration`, { expectedRevision: revision, personalization, customization }), onSuccess: async (result) => {
    setRevision(result.product.revision);
    await invalidateAdminDependencies(queryClient, 'products');
  } });
  return <AdminForm error={save.error} className="commerce-editor" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><fieldset disabled={save.isPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><h2>Standard Purchase Personalization</h2><p>Photo, name and message requirements belong to the normal purchase. They remain independent of optional customization services. Leave the field list empty when no personalization is required.</p><FieldDefinitions product fields={personalization.fields || []} onChange={(fields) => setPersonalization({ ...personalization, fields })} />
    <fieldset className="commerce-option-group"><legend>Optional Product Customization</legend><CheckField name="customization.enabled" label="Enable Customize This" value={customization.enabled} onChange={(enabled) => setCustomization({ ...customization, enabled })} /><div className="commerce-inline-form"><label className="commerce-field">Find approved template<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><button className="button button-secondary" type="button" onClick={() => { setSearch(searchInput.trim()); setPage(1); }}>Find templates</button></div><label className="commerce-field">Approved customization template<select name="customization.templateId" value={templateId} required={customization.enabled} onChange={(event) => {
      const template = list.find((entry) => (entry._id || entry.id) === event.target.value);
      setCustomization({ ...customization, templateId: event.target.value || null, serviceKind: template?.kind || null });
    }}><option value="">No template assigned</option>{templateId && !list.some((entry) => (entry._id || entry.id) === templateId) && <option value={templateId}>Current assigned template</option>}{list.map((template) => <option value={template._id || template.id} key={template._id || template.id}>{template.name} · {template.kind.replaceAll('_', ' ')} · v{template.version}</option>)}</select></label><nav className="commerce-pagination" aria-label="Template pages"><button type="button" disabled={page <= 1 || templates.isFetching} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={templates.isFetching || page >= (templates.data?.pagination?.pages || templates.data?.pagination?.totalPages || 1)} onClick={() => setPage(page + 1)}>Next</button></nav><CheckField name="customization.serviceEntryEligible" label="Show in the configured gift box / laser service product selector" value={customization.serviceEntryEligible} onChange={(serviceEntryEligible) => setCustomization({ ...customization, serviceEntryEligible })} /><p className="commerce-muted">Trays use product-level customization. Enabling a service requires a matching, approved template and an eligible approved product.</p>{templates.error && <p className="form-error" role="alert">{commerceError(templates.error)}</p>}</fieldset>
    <button className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save purchase configuration'}</button>{save.isSuccess && <p role="status">Product configuration saved.</p>}{save.error && !hasAdminFieldErrors(save.error) && <p className="form-error" role="alert">{commerceError(save.error)}</p>}
    <EditConflict error={save.error} onReload={async () => {
      const result = (await api.get(`/admin/products/${product._id || product.id}`)).data.data;
      setPersonalization(structuredClone(result.product.personalization || { fields: [] }));
      setCustomization(structuredClone(result.product.customization)); setRevision(result.product.revision); save.reset();
      queryClient.setQueryData(['admin', 'product-configuration', product._id || product.id], result);
    }} /></fieldset>
  </AdminForm>;
}

export default function AdminProductConfigurationPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['admin', 'product-configuration', id], queryFn: async ({ signal }) => (await api.get(`/admin/products/${id}`, { signal })).data.data, retry: false, staleTime: 0, gcTime: 0 });
  return <AdminLayout title="Purchase Configuration" busy={query.isPending} actions={<Link className="admin-button admin-button-secondary" to={`/admin/products/${id}/edit`}>Product editor</Link>}>{query.isPending ? <p className="admin-state" role="status">Loading product…</p> : query.error ? <div className="admin-state"><p role="alert">{commerceError(query.error)}</p><button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button></div> : query.data?.product && <><h2>{query.data.product.name}</h2><ConfigurationForm key={id} product={query.data.product} /></>}</AdminLayout>;
}
