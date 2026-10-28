import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../admin/AdminLayout.jsx';
import AdminForm from '../admin/AdminForm.jsx';
import EditConflict from '../admin/EditConflict.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { commerceError } from '../commerce/api.js';
import { decimalInput, parseDecimalPiastres } from '../commerce/money-input.js';
import { getCatalog, getSetting, reorderCategory, updateSetting } from '../gift-box/api.js';
import { componentLabel } from '../gift-box/state.mjs';
import '../gift-box/gift-box.css';

const categoryNames = { box: 'Boxes', flower: 'Flowers', plush: 'Plush toys', chocolate: 'Chocolates', ribbon: 'Ribbons', gift_card: 'Gift card' };
function SettingEditor({ component, onSaved }) {
  const [loaded, setLoaded] = useState(component);
  const [name, setName] = useState(component.displayName || '');
  const [price, setPrice] = useState(decimalInput(component.pricePiastres));
  const [order, setOrder] = useState(String(component.displayOrder));
  const [enabled, setEnabled] = useState(component.enabled), [complimentary, setComplimentary] = useState(false);
  const [available, setAvailable] = useState(component.available === true);
  const [inventoryMode, setInventoryMode] = useState(component.inventoryMode || '');
  const [quantity, setQuantity] = useState(component.inventoryQuantity === null ? '' : String(component.inventoryQuantity));
  const [confirmQuantity, setConfirmQuantity] = useState(false), [validationError, setValidationError] = useState(null);
  const ribbon = loaded.category === 'ribbon';
  const switchingToTracked = inventoryMode === 'tracked' && loaded.inventoryMode !== 'tracked';
  const mutation = useMutation({ mutationFn: body => updateSetting(component.componentId, body), onSuccess: async result => { setLoaded(result); setPrice(decimalInput(result.pricePiastres)); setComplimentary(false); setConfirmQuantity(false); await onSaved(); } });
  function reset(record) {
    setLoaded(record); setName(record.displayName || ''); setPrice(decimalInput(record.pricePiastres)); setOrder(String(record.displayOrder)); setEnabled(record.enabled); setAvailable(record.available === true); setInventoryMode(record.inventoryMode || ''); setQuantity(record.inventoryQuantity === null ? '' : String(record.inventoryQuantity)); setComplimentary(false); setConfirmQuantity(false); setValidationError(null); mutation.reset();
  }
  function submit(event) {
    event.preventDefault();
    const body = { expectedRevision: loaded.revision, displayOrder: Number(order), enabled, available };
    if (name !== (loaded.displayName || '')) body.displayName = name;
    let amount;
    try { amount = parseDecimalPiastres(price); }
    catch (error) { setValidationError({ message: error.message, details: [{ field: 'pricePiastres', message: error.message }] }); return; }
    if (amount !== loaded.pricePiastres) {
      body.pricePiastres = amount;
      if (amount === 0 && complimentary) body.confirmComplimentary = true;
    }
    if (!ribbon) {
      if (inventoryMode && inventoryMode !== loaded.inventoryMode) body.inventoryMode = inventoryMode;
      if (inventoryMode === 'tracked') {
        if (!/^\d+$/.test(quantity) || BigInt(quantity) > BigInt(Number.MAX_SAFE_INTEGER)) {
          setValidationError({ message: 'Enter a whole stock quantity from zero to the maximum safe integer.', details: [{ field: 'inventoryQuantity', message: 'Enter a valid whole stock quantity.' }] }); return;
        }
        if (switchingToTracked || Number(quantity) !== loaded.inventoryQuantity) body.inventoryQuantity = Number(quantity);
        if (switchingToTracked && confirmQuantity) body.confirmInventoryQuantity = true;
      }
    }
    setValidationError(null);
    mutation.mutate(body);
  }
  return <AdminForm className="gb-setting-editor" error={validationError || mutation.error} onSubmit={submit}>
    <h3>{componentLabel(loaded)}</h3><p className="gb-help">{loaded.componentId} · {loaded.category} · revision {loaded.revision}</p>
    {loaded.category === 'chocolate' && <p className="gb-help">One unit is the complete pictured retail product. Confirm its identity and unit before approving its name, price, and availability.</p>}
    <fieldset disabled={mutation.isPending}>
      <label>Display name<input name="displayName" maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label>
      <label>Display order<input name="displayOrder" type="number" min="0" max="1000000" step="1" required value={order} onChange={event => setOrder(event.target.value)}/></label>
      <label>Approved price (EGP)<input name="pricePiastres" type="text" inputMode="decimal" pattern="[0-9]+(?:[.][0-9]{1,2})?" value={price} onChange={event => { setPrice(event.target.value); setComplimentary(false); setValidationError(null); }}/></label>
      <p className="gb-help">Leave blank for unpriced. Enter EGP with at most two decimal places; saving a positive amount approves that price.</p>
      {/^0+(?:\.0{1,2})?$/.test(price) && loaded.pricePiastres !== 0 && <label className="gb-check"><input name="confirmComplimentary" type="checkbox" required checked={complimentary} onChange={event => setComplimentary(event.target.checked)}/>Explicitly approve this component as complimentary</label>}
      <label className="gb-check"><input name="enabled" type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>Enabled</label>
      <label className="gb-check"><input name="available" type="checkbox" checked={available} onChange={event => setAvailable(event.target.checked)}/>{ribbon ? 'In stock' : 'Available'}</label>
      {ribbon ? <p className="gb-help">Ribbon availability uses the In stock toggle. Ribbons have no numeric stock.</p> : <>
        <label>Inventory mode<select name="inventoryMode" value={inventoryMode} onChange={event => { setInventoryMode(event.target.value); setConfirmQuantity(false); }}><option value="" disabled>Not configured</option><option value="tracked">Tracked stock</option><option value="made_to_order">Made to order</option></select></label>
        {inventoryMode === 'tracked' && <label>Stock quantity<input name="inventoryQuantity" type="text" inputMode="numeric" pattern="[0-9]+" required value={quantity} onChange={event => { setQuantity(event.target.value); setConfirmQuantity(false); setValidationError(null); }}/></label>}
        {switchingToTracked && <label className="gb-check"><input name="confirmInventoryQuantity" type="checkbox" required checked={confirmQuantity} onChange={event => setConfirmQuantity(event.target.checked)}/>Confirm this tracked stock quantity</label>}
        {inventoryMode === 'made_to_order' && <p className="gb-help">Made to order uses availability without a numeric stock limit. Any saved stock quantity is preserved.</p>}
      </>}
      <button className="button button-primary" type="submit">{mutation.isPending ? 'Saving…' : 'Save component settings'}</button>
    </fieldset>
    {mutation.error && <p role="alert">{commerceError(mutation.error)}</p>}{mutation.isSuccess && <p role="status">Component settings saved.</p>}
    <EditConflict error={mutation.error} onReload={async () => reset(await getSetting(component.componentId))}/>
  </AdminForm>;
}
function CategoryOrder({ category, components, onSaved }) {
  const [ordered, setOrdered] = useState(components);
  const mutation = useMutation({ mutationFn: () => reorderCategory({ category, items: ordered.map(item => ({ componentId: item.componentId, expectedRevision: item.revision })) }), onSuccess: async result => { setOrdered(result.components); await onSaved(); } });
  function move(index, delta) { const next = [...ordered]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; setOrdered(next); mutation.reset(); }
  return <details className="gb-order"><summary>Reorder {categoryNames[category].toLowerCase()}</summary><p>Move options, then save the complete category. Saved revisions protect every row.</p><ol>{ordered.map((item, index) => <li key={item.componentId}><span>{componentLabel(item)}</span><button type="button" disabled={index === 0 || mutation.isPending} aria-label={`Move ${item.componentId} up`} onClick={() => move(index, -1)}>Up</button><button type="button" disabled={index === ordered.length - 1 || mutation.isPending} aria-label={`Move ${item.componentId} down`} onClick={() => move(index, 1)}>Down</button></li>)}</ol><button className="button button-secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Save category order</button>{mutation.isSuccess && <p role="status">Category order saved.</p>}{mutation.error && <p role="alert">{commerceError(mutation.error)}</p>}<EditConflict error={mutation.error} onReload={async () => { const latest = await getCatalog(undefined, true); setOrdered(latest.components.filter(item => item.category === category)); mutation.reset(); }}/></details>;
}
export default function AdminGiftBoxComponentsPage() {
  const session = useSession(), cache = useQueryClient();
  const [category, setCategory] = useState('box');
  const key = ['private', session.ownerKey, 'gift-box-components'];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getCatalog(signal, true), retry: false, staleTime: 0 });
  const components = (query.data?.components || []).filter(item => item.category === category);
  async function saved() { await Promise.all([cache.invalidateQueries({ queryKey: key }), cache.invalidateQueries({ queryKey: ['gift-box', 'catalog'] }), cache.invalidateQueries({ queryKey: ['private', session.ownerKey, 'gift-box-estimate'] })]); }
  return <AdminLayout title="Gift Box Components" description="Edit names, order, approved prices and availability for the fixed builder catalog. Identities, artwork, colors and placement rules are code-owned." busy={query.isPending}>
    {query.isPending ? <p role="status">Loading fixed components…</p> : query.error ? <div className="admin-state"><p role="alert">{commerceError(query.error)}</p><button onClick={() => query.refetch()}>Retry components</button></div> : <>
      <label className="gb-category-label">Component category<select value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(categoryNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {!components.length ? <p className="gb-empty">No approved fixed definitions exist in this category yet.</p> : <><CategoryOrder key={category} category={category} components={components} onSaved={saved}/><div className="gb-settings">{components.map(item => <SettingEditor key={item.componentId} component={item} onSaved={saved}/>)}</div></>}
    </>}
  </AdminLayout>;
}
