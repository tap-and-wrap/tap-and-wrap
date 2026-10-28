import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../admin/AdminLayout.jsx';
import AdminForm from '../admin/AdminForm.jsx';
import EditConflict from '../admin/EditConflict.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { commerceError } from '../commerce/api.js';
import { approveFulfillmentPolicy, getFulfillmentPolicies, getFulfillmentPolicy, saveFulfillmentDraft, withdrawFulfillmentPolicy } from '../gift-box/api.js';
import '../gift-box/policies.css';

const categoryNames = { flower: 'Flowers', plush: 'Plush toys', chocolate: 'Chocolates', ribbon: 'Ribbons', gift_card: 'Gift card' };
const mixedSets = [
  { categories: ['flower', 'plush'], label: 'flowers + plush' },
  { categories: ['flower', 'chocolate'], label: 'flowers + chocolates' },
  { categories: ['plush', 'chocolate'], label: 'plush + chocolates' },
  { categories: ['flower', 'plush', 'chocolate'], label: 'flowers + plush + chocolates' },
];
const notes = [
  ['clearanceNotes', 'Lid and clearance instructions'],
  ['transportNotes', 'Safe packing and transport instructions'],
  ['plushHandlingNotes', 'Plush handling instructions'],
  ['compartmentNotes', 'Box 11 compartment instructions'],
];
const statuses = { pending: 'Pending packing review', draft: 'Draft', approved: 'Approved', superseded: 'Superseded', withdrawn: 'Withdrawn' };
const emptyRules = () => ({ regions: [], compartments: [], componentRules: [], limits: { maxUnits: '', maxByCategory: { flower: '', plush: '', chocolate: '' }, mixedContentLimits: [] } });
const emptyPacking = () => ({ lidMode: '', clearanceNotes: '', transportNotes: '', plushHandlingNotes: '', compartmentNotes: '' });
function rulesFromPolicy(policy) {
  if (!policy) return null;
  return { regions: policy.regions, compartments: policy.compartments, componentRules: policy.componentRules, limits: policy.limits };
}
function editValues(record) {
  return { rules: structuredClone(record.draft?.rules || rulesFromPolicy(record.activePublication?.policy) || emptyRules()),
    packing: structuredClone(record.draft?.packing || record.activePublication?.packing || emptyPacking()) };
}
function issue(field, message) { const error = new Error(message); error.details = [{ field, message }]; throw error; }
function quantity(value, field, maximum, minimum = 0) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) issue(field, `Enter a whole quantity from ${minimum} to ${maximum}.`);
  return Number(value);
}
function draftBody(revision, rules, packing) {
  const suppliedRules = rules.regions.length || rules.compartments.length || rules.componentRules.length
    || rules.limits.maxUnits !== '' || Object.values(rules.limits.maxByCategory).some(value => value !== '') || rules.limits.mixedContentLimits.length;
  const savedRules = suppliedRules ? { regions: rules.regions.map(region => ({ ...region, compartmentId: region.compartmentId || null })),
    compartments: rules.compartments.map((compartment, index) => ({ id: compartment.id, maxUnits: quantity(compartment.maxUnits, `rules.compartments.${index}.maxUnits`, 200) })),
    componentRules: rules.componentRules.map((rule, index) => ({ ...rule, maxQuantity: quantity(rule.maxQuantity, `rules.componentRules.${index}.maxQuantity`, 100, 1) })),
    limits: { maxUnits: quantity(rules.limits.maxUnits, 'rules.limits.maxUnits', 200),
      maxByCategory: Object.fromEntries(Object.entries(rules.limits.maxByCategory).map(([category, value]) => [category, quantity(value, `rules.limits.maxByCategory.${category}`, 200)])),
      mixedContentLimits: rules.limits.mixedContentLimits.map((rule, index) => ({ categories: rule.categories, maxUnits: quantity(rule.maxUnits, `rules.limits.mixedContentLimits.${index}.maxUnits`, 200) })) } } : null;
  const suppliedPacking = Object.values(packing).some(Boolean);
  if (suppliedPacking && !packing.lidMode) issue('packing.lidMode', 'Choose the tested lid requirement, or leave the entire packing section blank.');
  for (const [key] of notes) if (Array.from(packing[key]).length > 1000) issue(`packing.${key}`, 'Use at most 1,000 Unicode characters.');
  return { expectedRevision: revision, rules: savedRules, packing: suppliedPacking ? packing : null };
}
function when(value) {
  const date = value && new Date(value);
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(date) : 'Time unavailable';
}
function NumberField({ label, name, value, onChange, minimum = 0, maximum = 200 }) {
  return <label>{label}<input type="number" name={name} min={minimum} max={maximum} step="1" inputMode="numeric" value={value} onChange={event => onChange(event.target.value)}/></label>;
}
function PolicyHistory({ record, name }) {
  const [publications, setPublications] = useState(record.history || []);
  const [page, setPage] = useState(record.historyPage || 1), [hasMore, setHasMore] = useState(record.historyHasMore === true);
  const [loading, setLoading] = useState(false), [error, setError] = useState(null);
  async function loadEarlier() {
    setLoading(true); setError(null);
    try {
      const next = await getFulfillmentPolicy(record.boxId, undefined, page + 1);
      setPublications(current => [...current, ...next.history.filter(publication => !current.some(saved => saved.version === publication.version))]);
      setPage(next.historyPage); setHasMore(next.historyHasMore === true);
    } catch (failure) { setError(failure); }
    finally { setLoading(false); }
  }
  return <section className="gb-policy-history" aria-labelledby="policy-history-title">
    <h2 id="policy-history-title">Published version history</h2>
    {!publications.length ? <p>No policy has been approved for this box.</p> : publications.map(publication => <details key={publication.version}>
      <summary>Version {publication.version} · {statuses[publication.status] || publication.status}</summary>
      <dl><dt>Policy reference</dt><dd>{publication.policy.policyId} · {publication.policy.policyVersion}</dd><dt>Approved by</dt><dd>{publication.approvedBy}</dd><dt>Approved at (Cairo)</dt><dd>{when(publication.approvedAt)}</dd><dt>Policy fingerprint</dt><dd><code>{publication.policyHash}</code></dd><dt>Reviewed content fingerprint</dt><dd><code>{publication.contentHash}</code></dd></dl>
      <h3>Packing trial evidence</h3><p className="gb-policy-literal">{publication.evidence}</p>
      <h3>Reviewed packing instructions</h3><dl><dt>Lid requirement</dt><dd>{publication.packing.lidMode.replaceAll('_', ' ')}</dd>{notes.map(([key, label]) => <div key={key}><dt>{label}</dt><dd className="gb-policy-literal">{publication.packing[key] || 'Not applicable / no instruction recorded'}</dd></div>)}</dl>
      <h3>Approved content rules</h3><p>Overall maximum: {publication.policy.limits.maxUnits}. Flowers: {publication.policy.limits.maxByCategory.flower}; plush: {publication.policy.limits.maxByCategory.plush}; chocolates: {publication.policy.limits.maxByCategory.chocolate}.</p>
      <p className="gb-policy-help">Each mixed limit applies when at least two listed categories are present. The three-category limit also caps every pair; zero there prohibits all mixed contents.</p>
      <ul>{publication.policy.limits.mixedContentLimits.map(rule => <li key={rule.categories.join('-')}>{rule.categories.map(category => categoryNames[category]).join(' + ')}: {rule.maxUnits} combined units{rule.maxUnits === 0 ? ' (combination prohibited)' : ''}</li>)}</ul>
      <ul>{publication.policy.regions.map(region => <li key={region.regionId}>Region {region.regionId}: {region.zone}{region.compartmentId ? `, compartment ${region.compartmentId}` : ''}</li>)}</ul>
      <ul>{publication.policy.compartments.map(compartment => <li key={compartment.id}>Compartment {compartment.id}: maximum {compartment.maxUnits}</li>)}</ul>
      <ul>{publication.policy.componentRules.map(rule => <li key={rule.componentId}>{name(rule.componentId)} ({rule.componentId}): maximum {rule.maxQuantity}{rule.allowedRegionIds.length ? `; regions ${rule.allowedRegionIds.join(', ')}` : ''}{rule.oversizedPlush ? `; oversized plush, ${rule.allowOversizedInside ? 'inside permitted' : 'beside only'}` : ''}</li>)}</ul>
      {publication.withdrawnAt && <p>Withdrawn {when(publication.withdrawnAt)}: <span className="gb-policy-literal">{publication.withdrawalReason}</span></p>}
      <p className="gb-policy-help">This is an immutable owner attestation. It does not certify dimensions or change historical orders.</p>
    </details>)}
    {hasMore && <button type="button" disabled={loading} onClick={loadEarlier}>{loading ? 'Loading earlier versions…' : 'Load earlier policy versions'}</button>}
    {error && <p role="alert">{commerceError(error)}</p>}
  </section>;
}
function PolicyEditor({ initial, components, onSaved }) {
  const [record, setRecord] = useState(initial);
  const [values, setValues] = useState(() => editValues(initial));
  const [dirty, setDirty] = useState(false), [category, setCategory] = useState('flower'), [selectedComponent, setSelectedComponent] = useState('');
  const [validation, setValidation] = useState(null), [notice, setNotice] = useState('');
  const [evidence, setEvidence] = useState(''), [packingTested, setPackingTested] = useState(false), [transportTested, setTransportTested] = useState(false), [lidTested, setLidTested] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const name = id => components.find(component => component.componentId === id)?.displayName || id;
  const { rules, packing } = values;
  function replaceRecord(next, message = '') { setRecord(next); setValues(editValues(next)); setDirty(false); setValidation(null); setEvidence(''); setPackingTested(false); setTransportTested(false); setLidTested(false); setWithdrawReason(''); setNotice(message); }
  const mutation = useMutation({ mutationFn: ({ action, body }) => (action === 'save' ? saveFulfillmentDraft : action === 'approve' ? approveFulfillmentPolicy : withdrawFulfillmentPolicy)(record.boxId, body),
    onSuccess: async (next, { action }) => { replaceRecord(next, action === 'save' ? 'Policy draft saved. It has not been approved.' : action === 'approve' ? 'Reviewed policy version published. Public gift purchasing remains disabled.' : 'Active policy withdrawn. New gift commerce eligibility is blocked.'); await onSaved(); } });
  function changeRules(next) { setValues(current => ({ ...current, rules: next })); setDirty(true); setValidation(null); setNotice(''); }
  function changePacking(key, value) { setValues(current => ({ ...current, packing: { ...current.packing, [key]: value } })); setDirty(true); setValidation(null); setNotice(''); }
  function updateArray(key, index, patch) { changeRules({ ...rules, [key]: rules[key].map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }); }
  function removeArray(key, index) {
    const removed = rules[key][index];
    let next = { ...rules, [key]: rules[key].filter((_, rowIndex) => rowIndex !== index) };
    if (key === 'regions') next = { ...next, componentRules: next.componentRules.map(rule => ({ ...rule, allowedRegionIds: rule.allowedRegionIds.filter(id => id !== removed.regionId) })) };
    if (key === 'compartments') next = { ...next, regions: next.regions.map(region => region.compartmentId === removed.id ? { ...region, compartmentId: null } : region) };
    changeRules(next);
  }
  function save(event) { event.preventDefault(); try { const body = draftBody(record.revision, rules, packing); setValidation(null); mutation.mutate({ action: 'save', body }); } catch (error) { setValidation(error); } }
  function approve(event) {
    event.preventDefault();
    if (Array.from(evidence).length > 2000) { setValidation({ message: 'Use at most 2,000 Unicode characters for packing evidence.', details: [{ field: 'evidence', message: 'Use at most 2,000 Unicode characters.' }] }); return; }
    setValidation(null); mutation.mutate({ action: 'approve', body: { expectedRevision: record.revision, evidence, confirmPackingTested: packingTested, confirmSafeTransport: transportTested, confirmLidChecked: lidTested } });
  }
  function withdraw(event) { event.preventDefault(); if (Array.from(withdrawReason).length > 1000) { setValidation({ message: 'Use at most 1,000 Unicode characters for withdrawal.', details: [{ field: 'reason', message: 'Use at most 1,000 Unicode characters.' }] }); return; } setValidation(null); mutation.mutate({ action: 'withdraw', body: { expectedRevision: record.revision, reason: withdrawReason } }); }
  const editableComponents = components.filter(component => component.category === category && !rules.componentRules.some(rule => rule.componentId === component.componentId));
  const error = validation || mutation.error;
  return <article className="gb-policy-editor" aria-label={`Packing policy ${record.boxId}`}>
    <header><h2>{name(record.boxId)}</h2><p><strong>{statuses[record.status] || record.status}</strong> · {record.boxId} · revision {record.revision}</p>
      {record.activePublication && <p>Active approved policy: version {record.activePublication.version}. {record.draft ? 'A separate draft is saved; the active version remains in force until superseded or withdrawn.' : 'Save a separate draft below before approving any change.'}</p>}
      {record.activePublication?.compatibleWithCurrentContract === false && <p className="gb-policy-warning" role="alert">Review required: this approved version uses older catalog, media or geometry references. New configurations remain blocked until a new policy version is reviewed and approved. You can withdraw the existing approval below.</p>}
      {!record.activePublication && <p>This box has no active approved physical policy.</p>}
      {dirty && <p role="status">Unsaved policy changes. Approval uses only the saved draft.</p>}
    </header>
    {notice && <p className="admin-feedback" role="status">{notice}</p>}
    {mutation.error && <p role="alert">{commerceError(mutation.error)}</p>}
    <EditConflict error={mutation.error} onReload={async () => { replaceRecord(await getFulfillmentPolicy(record.boxId)); mutation.reset(); }}/>
    <AdminForm className="gb-policy-form" onSubmit={save} error={mutation.variables?.action === 'save' || validation ? error : null}>
      <h3>Draft packing rules</h3><p className="gb-policy-help">Enter reviewed counts, not estimated image capacities. Leave the rule section entirely blank to save a pending draft. Components without a compatibility rule are prohibited. Changing a draft never rewrites an approved version.</p>
      <fieldset disabled={mutation.isPending}>
        <legend>Placement regions and compartments</legend><p className="gb-policy-help">Region IDs describe allowed placement associations. They do not approve photo boundaries or prove that an item fits.</p>
        {record.boxId === 'box-11' && <p className="gb-policy-warning">BOX-11 requires two separately reviewed compartments. Every inside region must belong to exactly one compartment; bridging between compartments is prohibited.</p>}
        <div className="gb-policy-rows" data-validation-field="rules.compartments" tabIndex={-1}>{rules.compartments.map((compartment, index) => <div className="gb-policy-row" key={index}>
          <label>Compartment ID {index + 1}<input name={`rules.compartments.${index}.id`} value={compartment.id} pattern="[a-z][a-z0-9-]{0,79}" maxLength={80} required onChange={event => {
            const nextId = event.target.value; changeRules({ ...rules, compartments: rules.compartments.map((row, rowIndex) => rowIndex === index ? { ...row, id: nextId } : row), regions: rules.regions.map(region => region.compartmentId === compartment.id && compartment.id ? { ...region, compartmentId: nextId } : region) });
          }}/></label>
          <NumberField label={`Compartment maximum ${index + 1}`} name={`rules.compartments.${index}.maxUnits`} value={compartment.maxUnits} onChange={value => updateArray('compartments', index, { maxUnits: value })}/>
          <button type="button" onClick={() => removeArray('compartments', index)} aria-label={`Remove compartment ${index + 1}`}>Remove compartment</button>
        </div>)}</div>
        <button type="button" disabled={rules.compartments.length >= 8} onClick={() => changeRules({ ...rules, compartments: [...rules.compartments, { id: '', maxUnits: '' }] })}>Add compartment</button>
        <div className="gb-policy-rows" data-validation-field="rules.regions" tabIndex={-1}>{rules.regions.map((region, index) => <div className="gb-policy-row" key={index}>
          <label>Region ID {index + 1}<input name={`rules.regions.${index}.regionId`} value={region.regionId} pattern="[a-z][a-z0-9-]{0,79}" maxLength={80} required onChange={event => {
            const nextId = event.target.value; changeRules({ ...rules, regions: rules.regions.map((row, rowIndex) => rowIndex === index ? { ...row, regionId: nextId } : row), componentRules: rules.componentRules.map(rule => ({ ...rule, allowedRegionIds: rule.allowedRegionIds.map(id => id === region.regionId && region.regionId ? nextId : id) })) });
          }}/></label>
          <label>Region zone {index + 1}<select name={`rules.regions.${index}.zone`} value={region.zone} onChange={event => updateArray('regions', index, { zone: event.target.value, compartmentId: null })}><option value="inside">Inside</option><option value="beside">Beside (plush only)</option></select></label>
          <label>Region compartment {index + 1}<select name={`rules.regions.${index}.compartmentId`} value={region.compartmentId || ''} disabled={region.zone === 'beside'} onChange={event => updateArray('regions', index, { compartmentId: event.target.value || null })}><option value="">No compartment</option>{rules.compartments.filter(item => item.id).map(item => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
          <button type="button" onClick={() => removeArray('regions', index)} aria-label={`Remove region ${index + 1}`}>Remove region</button>
        </div>)}</div>
        <button type="button" disabled={rules.regions.length >= 32} onClick={() => changeRules({ ...rules, regions: [...rules.regions, { regionId: '', zone: 'inside', compartmentId: null }] })}>Add placement region</button>
      </fieldset>
      <fieldset disabled={mutation.isPending}>
        <legend>Compatible components</legend><div className="gb-policy-row"><label>Component category<select value={category} onChange={event => { setCategory(event.target.value); setSelectedComponent(''); }}>{Object.entries(categoryNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Compatible component<select value={selectedComponent} onChange={event => setSelectedComponent(event.target.value)}><option value="">Choose a fixed component</option>{editableComponents.map(component => <option key={component.componentId} value={component.componentId}>{component.displayName} ({component.componentId})</option>)}</select></label>
          <button type="button" disabled={!selectedComponent} onClick={() => { changeRules({ ...rules, componentRules: [...rules.componentRules, { componentId: selectedComponent, maxQuantity: ['ribbon', 'gift_card'].includes(category) ? 1 : '', allowedRegionIds: [], oversizedPlush: false, allowOversizedInside: false }] }); setSelectedComponent(''); }}>Add compatible component</button>
        </div>
        <div data-validation-field="rules.componentRules" tabIndex={-1}>{rules.componentRules.map((rule, index) => {
          const component = components.find(item => item.componentId === rule.componentId), placed = ['flower', 'plush', 'chocolate'].includes(component?.category);
          const allowedRegions = rules.regions.filter(region => region.regionId && (component?.category === 'plush' || region.zone === 'inside'));
          return <section className="gb-policy-component" aria-label={`Compatibility ${rule.componentId}`} key={rule.componentId}><h4>{name(rule.componentId)}</h4><p className="gb-policy-help">{rule.componentId}</p>
            {placed ? <NumberField label={`Maximum quantity: ${name(rule.componentId)}`} name={`rules.componentRules.${index}.maxQuantity`} value={rule.maxQuantity} minimum={1} maximum={100} onChange={value => updateArray('componentRules', index, { maxQuantity: value })}/> : <p>One finishing component per completed box. No placement region applies.</p>}
            {placed && <fieldset><legend>Allowed regions for {name(rule.componentId)}</legend>{allowedRegions.length ? allowedRegions.map(region => <label className="gb-policy-check" key={region.regionId}><input type="checkbox" name={`rules.componentRules.${index}.allowedRegionIds`} checked={rule.allowedRegionIds.includes(region.regionId)} onChange={event => updateArray('componentRules', index, { allowedRegionIds: event.target.checked ? [...rule.allowedRegionIds, region.regionId] : rule.allowedRegionIds.filter(id => id !== region.regionId) })}/>Allow {region.regionId} ({region.zone}) for {name(rule.componentId)}</label>) : <p>Add a named inside region first{component?.category === 'plush' ? ', or an explicitly reviewed beside region' : ''}.</p>}</fieldset>}
            {component?.category === 'plush' && <><label className="gb-policy-check"><input type="checkbox" name={`rules.componentRules.${index}.oversizedPlush`} checked={rule.oversizedPlush} onChange={event => updateArray('componentRules', index, { oversizedPlush: event.target.checked, allowOversizedInside: false })}/>Treat {name(rule.componentId)} as oversized</label><label className="gb-policy-check"><input type="checkbox" name={`rules.componentRules.${index}.allowOversizedInside`} checked={rule.allowOversizedInside} disabled={!rule.oversizedPlush} onChange={event => updateArray('componentRules', index, { allowOversizedInside: event.target.checked })}/>Explicitly allow oversized {name(rule.componentId)} inside</label></>}
            <button type="button" onClick={() => removeArray('componentRules', index)} aria-label={`Remove compatibility ${rule.componentId}`}>Remove component rule</button>
          </section>;
        })}</div>
      </fieldset>
      <fieldset disabled={mutation.isPending}>
        <legend>Conservative content limits</legend><p className="gb-policy-help">Counts cover roses, toys and complete chocolate retail units, including allowed beside plush. Box, ribbon and card are excluded. Enter zero to prohibit a category or mixed combination. Approval requires all four mixed limits explicitly recorded.</p>
        <p className="gb-policy-help">Each mixed limit applies when at least two listed categories are present. The three-category limit also caps every pair; zero there prohibits all mixed contents.</p>
        <div className="gb-policy-grid"><NumberField label="Overall maximum units" name="rules.limits.maxUnits" value={rules.limits.maxUnits} onChange={value => changeRules({ ...rules, limits: { ...rules.limits, maxUnits: value } })}/>{Object.keys(rules.limits.maxByCategory).map(key => <NumberField key={key} label={`Maximum ${key} units`} name={`rules.limits.maxByCategory.${key}`} value={rules.limits.maxByCategory[key]} onChange={value => changeRules({ ...rules, limits: { ...rules.limits, maxByCategory: { ...rules.limits.maxByCategory, [key]: value } } })}/>)}</div>
        <div className="gb-policy-grid">{mixedSets.map(({ categories, label }) => {
          const key = [...categories].sort().join(','), index = rules.limits.mixedContentLimits.findIndex(rule => [...rule.categories].sort().join(',') === key), saved = rules.limits.mixedContentLimits[index];
          return <NumberField key={key} label={`Mixed ${label} limit`} name={index >= 0 ? `rules.limits.mixedContentLimits.${index}.maxUnits` : `mixed-${key}`} value={saved?.maxUnits ?? ''} onChange={value => {
            const next = rules.limits.mixedContentLimits.filter((_, ruleIndex) => ruleIndex !== index);
            if (value !== '') next.push({ categories, maxUnits: value });
            changeRules({ ...rules, limits: { ...rules.limits, mixedContentLimits: next } });
          }}/>;
        })}</div>
      </fieldset>
      <fieldset disabled={mutation.isPending}>
        <legend>Packing and handling instructions</legend><label>Lid requirement<select name="packing.lidMode" value={packing.lidMode} onChange={event => changePacking('lidMode', event.target.value)}><option value="">Not reviewed</option><option value="must_close">Lid must close</option><option value="open_presentation">Open presentation</option><option value="not_applicable">No lid applies</option></select></label>
        {notes.map(([key, label]) => <label key={key}>{label}<textarea name={`packing.${key}`} aria-label={label} aria-describedby={`packing-${key}-count`} rows={3} maxLength={2000} value={packing[key]} onChange={event => changePacking(key, event.target.value)}/><span id={`packing-${key}-count`} className="gb-policy-help">{Array.from(packing[key]).length}/1,000 Unicode characters</span></label>)}
        <p className="gb-policy-help">Approval requires clear lid/clearance and transport instructions, plus plush handling when plush is compatible and compartment instructions for BOX-11. Actual measurements and trials remain the owner&apos;s responsibility.</p>
      </fieldset>
      <button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending && mutation.variables?.action === 'save' ? 'Saving draft…' : 'Save policy draft'}</button>
    </AdminForm>
    <AdminForm className="gb-policy-approval" onSubmit={approve} error={mutation.variables?.action === 'approve' || validation?.details?.[0]?.field === 'evidence' ? error : null}>
      <h3>Review and approve the saved draft</h3><p>Approval publishes a new immutable version and supersedes any active version. It records your real-world attestation; the computer does not verify physical accuracy. Artwork and geometry need separate approval. Public Add to Cart and gift checkout remain disabled.</p>
      <fieldset disabled={mutation.isPending || dirty || !record.draft}>
        <label>Packing trial evidence<textarea name="evidence" aria-label="Packing trial evidence" aria-describedby="packing-evidence-count" minLength={20} maxLength={4000} rows={4} required value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Describe the actual tested contents, lid clearance, transport check and any measured restrictions."/><span id="packing-evidence-count" className="gb-policy-help">{Array.from(evidence).length}/2,000 Unicode characters; minimum 20</span></label>
        <label className="gb-policy-check"><input name="confirmPackingTested" type="checkbox" required checked={packingTested} onChange={event => setPackingTested(event.target.checked)}/>I performed real-world packing and fit checks</label>
        <label className="gb-policy-check"><input name="confirmSafeTransport" type="checkbox" required checked={transportTested} onChange={event => setTransportTested(event.target.checked)}/>I checked safe packing and transport</label>
        <label className="gb-policy-check"><input name="confirmLidChecked" type="checkbox" required checked={lidTested} onChange={event => setLidTested(event.target.checked)}/>I checked lid and clearance requirements</label>
        <button className="button button-primary" type="submit">Approve saved policy</button>
      </fieldset>
      {!record.draft && <p>Save a draft before review and approval.</p>}{dirty && <p>Save your changes before approving the saved draft.</p>}
    </AdminForm>
    {record.activePublication && <AdminForm className="gb-policy-withdraw" onSubmit={withdraw} error={mutation.variables?.action === 'withdraw' || validation?.details?.[0]?.field === 'reason' ? error : null}>
      <h3>Withdraw the active policy</h3><p>Withdrawal blocks new eligibility immediately. Existing order-time policy references remain unchanged.</p><fieldset disabled={mutation.isPending}>
        <label>Withdrawal reason<textarea name="reason" minLength={10} maxLength={2000} required rows={3} value={withdrawReason} onChange={event => setWithdrawReason(event.target.value)}/></label>
        <button className="button button-secondary" type="submit">Withdraw active policy</button>
      </fieldset>
    </AdminForm>}
    <PolicyHistory key={record.revision} record={record} name={name}/>
    {!!record.audit?.length && <details className="gb-policy-audit"><summary>Policy audit history</summary><ul>{record.audit.map((event, index) => <li key={event.id || index}>{when(event.at || event.createdAt)} · {event.action} · {event.actor || event.actorId || 'Administrator'}{event.reason ? ` · ${event.reason}` : ''}</li>)}</ul></details>}
  </article>;
}
export default function AdminGiftBoxPoliciesPage() {
  const session = useSession(), cache = useQueryClient();
  const [boxId, setBoxId] = useState('box-1');
  const key = ['private', session.ownerKey, 'gift-box-fulfillment-policies'];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getFulfillmentPolicies(signal), enabled: session.ready && session.user?.role === 'admin', retry: false, staleTime: 0 });
  const detailKey = [...key, boxId];
  const detail = useQuery({ queryKey: detailKey, queryFn: ({ signal }) => getFulfillmentPolicy(boxId, signal), enabled: !!query.data && session.ready && session.user?.role === 'admin', retry: false, staleTime: 0 });
  const policies = query.data?.policies || [], record = detail.data;
  const components = query.data?.components || [];
  async function saved() { await Promise.all([cache.invalidateQueries({ queryKey: key }), cache.invalidateQueries({ queryKey: ['private', session.ownerKey, 'cart'] })]); }
  return <AdminLayout title="Gift Box Packing Policies" description="Define owner-tested physical rules for the twelve fixed boxes. Every approval remains separate from commerce launch, geometry and artwork approval." busy={query.isPending} className="gb-policies-page">
    <aside className="gb-policy-warning"><strong>Public gift purchasing is closed.</strong><p>These records describe owner-tested compatibility. A visually plausible photo arrangement is not proof of physical fit. Unknown capacities or packing trials must remain pending.</p></aside>
    {query.isPending ? <p role="status">Loading packing policies…</p> : query.error ? <div className="admin-state"><p role="alert">{commerceError(query.error)}</p><button type="button" onClick={() => query.refetch()}>Retry packing policies</button></div> : <>
      <label className="gb-policy-box-select">Box<select value={boxId} onChange={event => setBoxId(event.target.value)}>{policies.map(policy => <option key={policy.boxId} value={policy.boxId}>{components.find(component => component.componentId === policy.boxId)?.displayName || policy.boxId} · {statuses[policy.status] || policy.status}{policy.draft && policy.status === 'approved' ? ' + saved draft' : ''}</option>)}</select></label>
      {detail.isPending ? <p role="status">Loading selected box policy…</p> : detail.error ? <div><p role="alert">{commerceError(detail.error)}</p><button type="button" onClick={() => detail.refetch()}>Retry selected box policy</button></div> : record ? <PolicyEditor key={boxId} initial={record} components={components} onSaved={saved}/> : <p role="alert">The selected box policy is unavailable. Retry the list without creating a substitute policy.</p>}
    </>}
  </AdminLayout>;
}
