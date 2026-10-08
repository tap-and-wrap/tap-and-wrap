import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { adminCommerceGet, adminCommercePatch, commerceError } from '../commerce/api';
import { CheckField, FieldDefinitions } from '../commerce/AdminEditors';

function ConfigurationForm({ product }) {
  const queryClient = useQueryClient();
  const [personalization, setPersonalization] = useState(() => structuredClone(product.personalization || { fields: [] }));
  const [customization, setCustomization] = useState(() => structuredClone(product.customization || { enabled: false, templateId: null, serviceKind: null, serviceEntryEligible: false }));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const templates = useQuery({ queryKey: ['admin', 'commerce', 'assignment-templates', page, search], queryFn: ({ signal }) => adminCommerceGet('/templates', { page, limit: 20, status: 'approved', ...(search ? { search } : {}) }, signal), retry: false, staleTime: 30_000 });
  const list = templates.data?.templates || [];
  const templateId = customization.templateId?._id || customization.templateId || '';
  const save = useMutation({ mutationFn: () => adminCommercePatch(`/products/${product._id || product.id}/configuration`, { personalization, customization }), onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'product', product._id || product.id] });
  } });
  return <form className="commerce-editor" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><h2>Standard Purchase Personalization</h2><p>Photo, name and message requirements belong to the normal purchase. They remain independent of optional customization services. Leave the field list empty when no personalization is required.</p><FieldDefinitions product fields={personalization.fields || []} onChange={(fields) => setPersonalization({ ...personalization, fields })} />
    <fieldset className="commerce-option-group"><legend>Optional Product Customization</legend><CheckField label="Enable Customize This" value={customization.enabled} onChange={(enabled) => setCustomization({ ...customization, enabled })} /><div className="commerce-inline-form"><label className="commerce-field">Find approved template<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><button className="button button-secondary" type="button" onClick={() => { setSearch(searchInput.trim()); setPage(1); }}>Find templates</button></div><label className="commerce-field">Approved customization template<select value={templateId} required={customization.enabled} onChange={(event) => {
      const template = list.find((entry) => (entry._id || entry.id) === event.target.value);
      setCustomization({ ...customization, templateId: event.target.value || null, serviceKind: template?.kind || null });
    }}><option value="">No template assigned</option>{templateId && !list.some((entry) => (entry._id || entry.id) === templateId) && <option value={templateId}>Current assigned template</option>}{list.map((template) => <option value={template._id || template.id} key={template._id || template.id}>{template.name} · {template.kind.replaceAll('_', ' ')} · v{template.version}</option>)}</select></label><nav className="commerce-pagination" aria-label="Template pages"><button type="button" disabled={page <= 1 || templates.isFetching} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={templates.isFetching || page >= (templates.data?.pagination?.pages || templates.data?.pagination?.totalPages || 1)} onClick={() => setPage(page + 1)}>Next</button></nav><CheckField label="Show in the configured gift box / laser service product selector" value={customization.serviceEntryEligible} onChange={(serviceEntryEligible) => setCustomization({ ...customization, serviceEntryEligible })} /><p className="commerce-muted">Trays use product-level customization. Enabling a service requires a matching, approved template and an eligible approved product.</p>{templates.error && <p className="form-error" role="alert">{commerceError(templates.error)}</p>}</fieldset>
    <button className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save purchase configuration'}</button>{save.isSuccess && <p role="status">Product configuration saved.</p>}{save.error && <p className="form-error" role="alert">{commerceError(save.error)}</p>}
  </form>;
}

export default function AdminProductConfigurationPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['admin', 'product-configuration', id], queryFn: async ({ signal }) => (await api.get(`/admin/products/${id}`, { signal })).data.data, retry: false, staleTime: 0, gcTime: 0 });
  return <main className="commerce-page"><Link to={`/admin/products/${id}/edit`}>← Product editor</Link><h1>Purchase Configuration</h1>{query.isPending ? <p role="status">Loading product…</p> : query.error ? <p role="alert">{commerceError(query.error)}</p> : query.data?.product && <><h2>{query.data.product.name}</h2><ConfigurationForm key={id} product={query.data.product} /></>}</main>;
}
