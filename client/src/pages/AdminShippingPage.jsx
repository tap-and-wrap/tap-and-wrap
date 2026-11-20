import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../admin/AdminLayout.jsx';
import { adminCommerceGet, adminCommercePatch, commerceError } from '../commerce/api.js';
import { parseDecimalPiastres, decimalInput } from '../commerce/money-input.js';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';

// Merchant activation is explicit: stored defaults are never approved silently.
export default function AdminShippingPage() {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'shipping-config'], queryFn: ({ signal }) => adminCommerceGet('/shipping', undefined, signal), retry: false, staleTime: 0 });
  const [draft, setDraft] = useState(null);
  const [activated, setActivated] = useState(false);
  useEffect(() => {
    if (!query.data?.configuration || draft) return;
    const config = query.data.configuration;
    setDraft({ cairo: decimalInput(config.cairoGizaPiastres), other: decimalInput(config.otherGovernoratesPiastres),
      approved: config.approved === true, revision: config.revision });
  }, [query.data, draft]);
  const mutation = useMutation({ mutationFn: async () => {
    const cairoGizaPiastres = parseDecimalPiastres(draft.cairo, { maximum: 100000000 });
    const otherGovernoratesPiastres = parseDecimalPiastres(draft.other, { maximum: 100000000 });
    if (cairoGizaPiastres === null || otherGovernoratesPiastres === null) throw new Error('Enter both delivery prices in EGP.');
    if (draft.approved && !activated) throw new Error('Confirm activation before saving live delivery charges.');
    return adminCommercePatch('/shipping', { expectedRevision: draft.revision,
      cairoGizaPiastres, otherGovernoratesPiastres, approved: draft.approved, confirmActivate: draft.approved && activated });
  }, onSuccess: async result => {
    const config = result.configuration;
    setDraft({ cairo: decimalInput(config.cairoGizaPiastres), other: decimalInput(config.otherGovernoratesPiastres), approved: config.approved === true, revision: config.revision });
    setActivated(false);
    await cache.invalidateQueries({ queryKey: ['admin', 'shipping-config'] });
    await invalidateAdminDependencies(cache, 'orders');
  } });
  const save = event => { event.preventDefault(); if (draft && !mutation.isPending) mutation.mutate(); };
  const change = (key, value) => { setActivated(false); mutation.reset(); setDraft(current => ({ ...current, [key]: value })); };
  return <AdminLayout title="Delivery rates" description="Choose what customers pay at checkout. Historical orders keep their original delivery terms." actions={<Link className="admin-button admin-button-secondary" to="/admin/orders">Back to orders</Link>}>
    {query.isPending ? <p className="admin-state" role="status">Loading delivery settings…</p> : query.error ? <section className="admin-panel" role="alert">{commerceError(query.error)} <button type="button" className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Retry</button></section> : draft && <form onSubmit={save} className="admin-panel v11-delivery-editor" aria-label="Delivery rate settings">
      <h2>Checkout delivery prices</h2>
      <p>One price for Cairo and Giza, and another for the other supported Egyptian governorates. All amounts include the delivery fee exactly once.</p>
      <div className="admin-form-grid">
        <label>Cairo &amp; Giza · EGP<input type="text" inputMode="decimal" value={draft.cairo} onChange={event => change('cairo', event.target.value)} required maxLength={12}/></label>
        <label>Other governorates · EGP<input type="text" inputMode="decimal" value={draft.other} onChange={event => change('other', event.target.value)} required maxLength={12}/></label>
      </div>
      <label className="v11-delivery-toggle"><input type="checkbox" checked={draft.approved} onChange={event => change('approved', event.target.checked)}/>Activate these rates for new customer checkouts</label>
      {draft.approved && <label className="v11-delivery-toggle"><input type="checkbox" checked={activated} onChange={event => setActivated(event.target.checked)}/>I approve the entered rates for future orders and InstaPay amounts</label>}
      <p className="commerce-muted">{draft.approved ? 'New orders will include delivery in the order total. Existing payment instructions and historical orders are not rewritten.' : 'These rates are inactive. Existing pending-delivery checkout behavior remains until you explicitly activate them.'}</p>
      {mutation.isSuccess && <p role="status">Delivery settings saved. {draft.approved ? 'Rates are active.' : 'Rates are inactive.'}</p>}
      {mutation.error && <p role="alert" className="form-error">{commerceError(mutation.error)}</p>}
      <div className="v11-form-footer"><button type="submit" className="admin-button" disabled={mutation.isPending || draft.approved && !activated}>{mutation.isPending ? 'Saving…' : 'Save delivery rates'}</button>
        <button type="button" className="admin-button admin-button-secondary" onClick={() => { const config = query.data.configuration; setDraft({ cairo: decimalInput(config.cairoGizaPiastres), other: decimalInput(config.otherGovernoratesPiastres), approved: config.approved === true, revision: config.revision }); setActivated(false); mutation.reset(); }}>Discard edits</button></div>
    </form>}
    <section className="admin-panel v11-delivery-info"><h2>Existing orders</h2><p>Any order accepted before activation keeps its original amount, payment reference, and separate delivery-charge history. No past order is changed by this setting.</p></section>
  </AdminLayout>;
}
