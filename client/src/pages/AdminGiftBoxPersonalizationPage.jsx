import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../admin/AdminLayout.jsx';
import EditConflict from '../admin/EditConflict.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { commerceError } from '../commerce/api.js';
import { getGiftBoxPersonalizationOptions, saveGiftBoxPersonalizationOption } from '../gift-box/api.js';
import { FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';
import { ENGRAVING_COLORS, LETTERING_STYLES } from '../../../shared/gift-box/lettering-styles.mjs';
import { giftBoxOptionDraft, giftBoxOptionEditorPayload, newGiftBoxOption } from '../gift-box/personalization-admin-form.mjs';
import '../gift-box/personalization-admin.css';

const boxes = FIXED_COMPONENTS.filter(item => item.category === 'box');
const kinds = { photo_print: 'Photo print', engraving_surface: 'Engraving surface' };
function MultiChoice({ legend, items, selected, onChange }) {
  return <fieldset className="gb-opt-choices"><legend>{legend}</legend><div className="gb-opt-choice-grid">{items.map(item => <label key={item.id}>
    <input type="checkbox" checked={selected.includes(item.id)} onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/>
    <span>{item.label}</span>
  </label>)}</div></fieldset>;
}
function Editor({ initial, onSaved }) {
  const [record,setRecord] = useState(initial);
  const [draft,setDraft] = useState(() => giftBoxOptionDraft(initial));
  const [localError,setLocalError] = useState('');
  const mutation = useMutation({mutationFn: body => saveGiftBoxPersonalizationOption(record.optionId, body),
    onSuccess: async next => { setRecord(next); setDraft(giftBoxOptionDraft(next)); setLocalError(''); await onSaved(); }});
  const change = (key,value) => { setDraft(current => ({ ...current,[key]:value, ...(key==='price' ? {confirmComplimentary:false}: {}) })); setLocalError(''); mutation.reset(); };
  function submit(event) {
    event.preventDefault(); setLocalError('');
    try { mutation.mutate(giftBoxOptionEditorPayload(record,draft)); }
    catch(error) { setLocalError(error.message || 'Review the option before saving.'); }
  }
  async function reload() {
    const result = await getGiftBoxPersonalizationOptions(undefined,true);
    const latest = result.options.find(option => option.optionId === record.optionId);
    if (!latest) throw new Error('The option was not found.');
    setRecord(latest); setDraft(giftBoxOptionDraft(latest)); setLocalError(''); mutation.reset();
  }
  return <form className="gb-opt-editor admin-panel" onSubmit={submit}>
    <header><h2>{record.displayName || record.optionId}</h2><p className="gb-opt-id">{record.optionId} · {kinds[record.kind]} · revision {record.revision}</p></header>
    <fieldset disabled={mutation.isPending}>
      <label>Customer-facing display name<input type="text" maxLength={120} required value={draft.displayName} onChange={event=>change('displayName',event.target.value)} /></label>
      <label>Price (EGP)<input type="text" inputMode="decimal" placeholder="Pending / unpriced" value={draft.price} onChange={event=>change('price',event.target.value)} /></label>
      <p className="gb-opt-note">Blank means unpriced. Positive prices are approved on save; a zero amount requires explicit complimentary approval. Changing other fields never silently reapproves the existing price.</p>
      {/^0+(?:\.0{1,2})?$/.test(draft.price) && record.configuredPricePiastres !== 0 &&
        <label className="gb-opt-check"><input type="checkbox" checked={draft.confirmComplimentary} onChange={event=>change('confirmComplimentary',event.target.checked)}/>Explicitly approve this option as complimentary</label>}
      <MultiChoice legend="Boxes where this option is permitted" items={boxes.map(box=>({id:box.id,label:`Box ${box.sourceNumber}`}))} selected={draft.boxIds} onChange={value=>change('boxIds',value)}/>
      {record.kind === 'engraving_surface' && <>
        <MultiChoice legend="Approved lettering styles" items={LETTERING_STYLES.map(style=>({id:style.id,label:style.customerLabel}))} selected={draft.approvedStyleIds} onChange={value=>change('approvedStyleIds',value)}/>
        <MultiChoice legend="Approved engraving colors" items={ENGRAVING_COLORS.map(color=>({id:color.id,label:color.label}))} selected={draft.approvedColorIds} onChange={value=>change('approvedColorIds',value)}/>
        <label className="gb-opt-check"><input type="checkbox" checked={draft.fontLicensesConfirmed} onChange={event=>change('fontLicensesConfirmed',event.target.checked)}/>
          I have independently confirmed permission to use every selected lettering style for customer orders</label>
        <p className="gb-opt-note">Style IDs are previews, not evidence of font licensing. Only confirm after checking actual commercial usage rights.</p>
      </>}
      <div className="gb-opt-choice-grid"><label className="gb-opt-check"><input type="checkbox" checked={draft.enabled} onChange={event=>change('enabled',event.target.checked)}/>Enabled</label>
        <label className="gb-opt-check"><input type="checkbox" checked={draft.available} onChange={event=>change('available',event.target.checked)}/>Available</label></div>
      <p className="gb-opt-note">An option requires approved pricing, at least one box and (for engraving) licensed styles and colors before it can be both enabled and available. These settings do not enable Gift Box checkout.</p>
      <div className="gb-opt-actions"><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : record.isDraftNew ? 'Create pending option' : 'Save option'}</button>
        <button type="button" className="button button-secondary" disabled={mutation.isPending} onClick={()=>{setDraft(giftBoxOptionDraft(record));setLocalError('');mutation.reset();}}>Discard unsaved edits</button></div>
    </fieldset>
    {localError && <p className="form-error" role="alert">{localError}</p>}
    {mutation.error && <p className="form-error" role="alert">{commerceError(mutation.error)}</p>}
    {mutation.isSuccess && <p role="status">Option saved. Customer availability is still controlled by the server.</p>}
    <EditConflict error={mutation.error} onReload={reload}/>
  </form>;
}
function Creator({ existing, onCreate }) {
  const [id,setId]=useState(''); const [kind,setKind]=useState('photo_print'); const [error,setError]=useState('');
  function start(event) {
    event.preventDefault();setError('');
    try {
      if (existing.some(item=>item.optionId===id)) throw new Error('This option already exists. Edit its saved record below.');
      onCreate(newGiftBoxOption(id,kind));
    } catch(problem) { setError(problem.message); }
  }
  return <form className="admin-panel gb-opt-create" onSubmit={start}><h2>Prepare a new option</h2>
    <p>Choose a permanent option ID. New options begin disabled and unavailable. No default price or license approval is inferred.</p>
    <label>Option ID<input type="text" maxLength={80} pattern="[a-z][a-z0-9-]*" required value={id} placeholder="small-photo-print" onChange={event=>setId(event.target.value)}/></label>
    <label>Type<select value={kind} onChange={event=>setKind(event.target.value)}><option value="photo_print">Photo print</option><option value="engraving_surface">Engraving surface</option></select></label>
    <button type="submit" className="button button-secondary">Prepare new option</button>
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}
export default function AdminGiftBoxPersonalizationPage() {
  const session = useSession(), cache = useQueryClient();
  const key=['private',session.ownerKey,'gift-box-personalization-options-admin'];
  const query=useQuery({queryKey:key,queryFn:({signal})=>getGiftBoxPersonalizationOptions(signal,true),retry:false,staleTime:0});
  const [newRecord,setNewRecord]=useState(null);
  async function saved() {setNewRecord(null);await Promise.all([
    cache.invalidateQueries({queryKey:key}),
    cache.invalidateQueries({queryKey:['private',session.ownerKey,'gift-box-personalization-options']})
  ]);}
  const records=query.data?.options || [];
  return <AdminLayout title="Gift Box Personalization" description="Manage reviewed photo-print prices, engraving surfaces, eligible boxes and lettering permissions. This editor does not authorize physical packing or checkout." busy={query.isPending}>
    {query.isPending ? <p role="status">Loading personalization options…</p> : query.error ? <section className="admin-panel"><p role="alert">The personalization registry is unavailable. The backend feature and guarded MongoDB schema must be ready before this editor works. {commerceError(query.error)}</p><button className="button button-secondary" type="button" onClick={()=>query.refetch()}>Retry options</button></section> : <>
      <section className="admin-panel"><h2>Availability and approval</h2><p>{records.length} configured option{records.length===1?'':'s'}. Public choices include only enabled, available, correctly priced and approved options. This screen does not turn on customer checkout.</p><p>Font permission and box compatibility require real merchant review. Do not enable a surface using only the visual preview as proof of a license or physical fit.</p></section>
      {!newRecord ? <Creator existing={records} onCreate={setNewRecord}/> : <section><div className="gb-opt-actions"><button className="button button-secondary" type="button" onClick={()=>setNewRecord(null)}>Cancel new option</button></div><Editor key={'new:'+newRecord.optionId} initial={newRecord} onSaved={saved}/></section>}
      {!records.length ? <p className="admin-panel">No personalization options saved yet. Create one as a pending configuration above.</p> : <div className="gb-opt-list">{records.map(record=><Editor key={`${record.optionId}:${record.revision}`} initial={record} onSaved={saved}/>)}</div>}
    </>}
  </AdminLayout>;
}
