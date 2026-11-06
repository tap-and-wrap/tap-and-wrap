import AdminForm from '../admin/AdminForm.jsx';
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminCommercePost, commercePost, commerceError } from '../commerce/api.js';
const labels={receive:'Receive physical item',inspect:'Begin inspection',clarify:'Request clarification',unsuitable:'Mark unsuitable',propose:'Propose inspected final design',accept:'Record customer acceptance',authorize_payment:'Authorize payment collection',start:'Start engraving',complete:'Complete engraving',arrange_return:'Arrange return',dispatch_return:'Dispatch return',return_to_customer:'Confirm returned to customer'};
function available(item,order){
  const stage=item.stage,closed=['cancelled','returned','delivery_failed'].includes(order.fulfillmentState);
  const actions=[];
  if(stage==='awaiting_customer_item')actions.push('receive');
  if(!closed){
    if(['item_received','needs_clarification'].includes(stage))actions.push('inspect');
    if(!order.engravingWorkflow.collectionAuthorized&&['inspection_pending','needs_clarification','final_design_proposed','final_design_confirmed'].includes(stage))actions.push('clarify','unsuitable','propose');
    if(stage==='final_design_proposed')actions.push('accept');
    if(stage==='final_design_confirmed'&&order.collectionAuthorized&&order.paymentState==='paid')actions.push('start');
    if(stage==='engraving_in_progress')actions.push('complete');
  }
  if(item.inCustody&&!['return_arranged','return_dispatched','returned_to_customer'].includes(stage)&&(closed||['engraving_completed','unsuitable','needs_clarification'].includes(stage)))actions.push('arrange_return');
  if(stage==='return_arranged')actions.push('dispatch_return','return_to_customer');
  if(stage==='return_dispatched')actions.push('return_to_customer');
  return actions;
}
export default function EngravingWorkflow({order,admin=false,refresh}){
  const [selected,setSelected]=useState(''),[action,setAction]=useState(''),[condition,setCondition]=useState(''),[accessories,setAccessories]=useState(''),[publicReason,setPublicReason]=useState(''),[internalNote,setInternalNote]=useState(''),[placementId,setPlacementId]=useState(''),[placementLabel,setPlacementLabel]=useState(''),[confirmed,setConfirmed]=useState(false);
  const operation=useRef(null),[uncertain,setUncertain]=useState(false);
  const workflow=order.engravingWorkflow,item=workflow?.items.find(value=>value.itemKey===(selected||workflow.items[0]?.itemKey)),line=order.lines.find(value=>value.engraving?.itemKey===item?.itemKey);
  const mutation=useMutation({mutationFn:async()=>{
    operation.current ||= {revision:order.revision,operationKey:crypto.randomUUID(),action:admin?action:'accept',itemKey:item.itemKey,...(admin?{condition,accessories,publicReason,internalNote,placementId,...(placementLabel?{placementLabel}:{})}:{}),customerConfirmed:confirmed,...(item.proposal?{proposalVersion:item.proposal.version}:{})};
    return admin?adminCommercePost(`/orders/${order.id}/engraving-actions`,operation.current):commercePost(`/orders/${order.id}/engraving/accept`,operation.current);
  },onSuccess:()=>{operation.current=null;setUncertain(false);setAction('');setConfirmed(false);void refresh();},onError:error=>{if(!error.response||error.response.status>=500)setUncertain(true);else{operation.current=null;setUncertain(false);}}});
  if(!workflow)return null;
  const choices=admin?available(item,order):[];
  const canAuthorize=!workflow.collectionAuthorized&&workflow.items.every(value=>value.stage==='final_design_confirmed'&&value.proposal?.acceptedAt);
  return <section className="commerce-editor"><h2>{admin?'Customer item custody & engraving':'Your item and engraving progress'}</h2><p>{workflow.collectionAuthorized?'Payment has been authorized after inspection and final design acceptance.':'Do not transfer payment yet. Physical inspection and final design acceptance come first.'}</p>
    {workflow.items.map(value=><article key={value.itemKey}><h3>{order.lines.find(entry=>entry.engraving?.itemKey===value.itemKey)?.name}</h3><p>{value.stage.replaceAll('_',' ')} · {value.inCustody?'Item held for work / return':'Not in merchant custody'}</p>{value.proposal&&<p>Final placement: {value.proposal.placementLabel} · {value.proposal.acceptedAt?'Accepted':'Awaiting your confirmation'} {value.proposal.publicDetails}</p>}{admin&&<p>Received condition: {value.condition||'Not recorded'} · Accessories: {value.accessories||'None recorded'}</p>}{value.history.map((entry,index)=><p key={index}>{entry.action.replaceAll('_',' ')}{entry.publicReason&&` · ${entry.publicReason}`}{admin&&entry.internalNote&&` · Private: ${entry.internalNote}`}</p>)}</article>)}
    <AdminForm error={mutation.error} onSubmit={event=>{event.preventDefault();mutation.mutate();}}><fieldset disabled={mutation.isPending||uncertain} className="admin-form-fields">
      <label className="commerce-field">Physical item<select value={item?.itemKey||''} onChange={event=>{setSelected(event.target.value);setAction('');setConfirmed(false);}}>{workflow.items.map(value=><option key={value.itemKey} value={value.itemKey}>{order.lines.find(entry=>entry.engraving?.itemKey===value.itemKey)?.name} · {value.itemKey.slice(-6)}</option>)}</select></label>
      {admin?<><label className="commerce-field">Engraving operation<select value={action} onChange={event=>{setAction(event.target.value);setConfirmed(false);}}><option value="">Choose the actual next action</option>{[...choices,...(canAuthorize?['authorize_payment']:[])].map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
      {action==='receive'&&<><label className="commerce-field">Condition on receipt<textarea name="condition" required maxLength={1000} value={condition} onChange={event=>setCondition(event.target.value)}/></label><label className="commerce-field">Supplied accessories<textarea maxLength={1000} value={accessories} onChange={event=>setAccessories(event.target.value)}/></label></>}
      {action==='propose'&&<><label className="commerce-field">Inspected final placement<select required={!placementLabel} value={placementId} onChange={event=>setPlacementId(event.target.value)}><option value="">Choose a placement</option>{line?.engraving.placements?.filter(value=>value.status==='active').map(value=><option key={value.id} value={value.id}>{value.label}</option>)}</select></label>{line?.engraving.placement?.kind==='help'&&<label className="commerce-field">Proposed placement description (for placement help)<input maxLength={120} value={placementLabel} onChange={event=>setPlacementLabel(event.target.value)}/></label>}</>}
      <label className="commerce-field">Customer-visible details<textarea name="publicReason" maxLength={1000} value={publicReason} onChange={event=>setPublicReason(event.target.value)}/></label><label className="commerce-field">Private operational / acceptance evidence<textarea name="internalNote" maxLength={1000} value={internalNote} onChange={event=>setInternalNote(event.target.value)}/></label></>:<p>Review the original engraving specification above and the final placement before confirming.</p>}
      {(action==='accept'||!admin&&item?.stage==='final_design_proposed')&&<label className="commerce-field"><span><input required type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{admin?'I have actual customer acceptance of this final specification.':'I accept this final placement and my submitted engraving specification.'}</span></label>}
      {(admin||item?.stage==='final_design_proposed')&&<button className="button button-primary" disabled={mutation.isPending||admin&&!action||!admin&&!confirmed}>{admin?'Save engraving operation':'Confirm final engraving design'}</button>}
    </fieldset></AdminForm>{uncertain&&<p role="alert">This operation is unconfirmed. <button disabled={mutation.isPending} onClick={()=>mutation.mutate()}>Retry the same operation</button></p>}{mutation.error&&<p role="alert">{commerceError(mutation.error)} Your entries are retained. <button type="button" onClick={()=>refresh()}>Reload latest order</button></p>}
  </section>;
}
