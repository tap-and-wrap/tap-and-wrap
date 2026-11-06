import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { api, authGeneration } from '../services/api.js';
import { commerceGet, commercePost, commerceError, money, uploadPrivateFile } from '../commerce/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { LocalFileField } from '../commerce/ConfiguredFields.jsx';
import { useEngravingDraft } from '../engraving/EngravingDraftProvider.jsx';
import EngravingSummary from '../engraving/EngravingSummary.jsx';
import ServiceRequestPage from './ServiceRequestPage.jsx';
import PageMetadata from '../seo/PageMetadata.jsx';
import { APPEARANCES, PERSONAL_TYPES } from '../../../shared/engraving/definitions.mjs';
import '../engraving/engraving.css';
const photoField = (label, required) => ({ label, required, minFiles: required ? 1 : 0, maxFiles: 1, maxBytes: 8388608, acceptedMimeTypes: ['image/jpeg','image/png','image/webp'] });
const placeholder = '000000000000000000000001';
const steps = ['Choose your item','Make it personal','Review your engraving'];
function Preview({ file, label }) {
  const [url,setUrl] = useState('');
  useEffect(()=>{ if(!file) return; const next=URL.createObjectURL(file); setUrl(next); return ()=>URL.revokeObjectURL(next); },[file]);
  return url ? <figure className="engraving-photo"><img src={url} alt={label}/><figcaption>{label}</figcaption></figure> : null;
}
export default function EngravingBuilderPage() {
  const session = useSession(), cart = useCart();
  if (!session.ready || cart.loading) return <main className="commerce-page" role="status">Preparing your private engraving session...</main>;
  return <EngravingBuilder key={cart.checkoutOwnerKey || session.ownerKey}/>;
}
function EngravingBuilder() {
  const session=useSession(), state=useEngravingDraft(), cart=useCart(), [params,setParams]=useSearchParams();
  const {draft,setDraft,reset,attempt,cache,ownerKey,pending,setPending}=state;
  const [editLoading,setEditLoading]=useState(Boolean(params.get('edit'))),[editFailure,setEditFailure]=useState('');
  const [page,setPage]=useState(1), [error,setError]=useState(''),[progress,setProgress]=useState(''),[added,setAdded]=useState(false),[acceptedOrder,setAcceptedOrder]=useState(null),[recovering,setRecovering]=useState(false);
  const scope=`tw-engraving-add:${cart.checkoutOwnerKey || ownerKey}`;
  const [uncertain,setUncertain]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(scope))?.pending===true;}catch{return false;}});
  const options=useQuery({queryKey:privateQueryKey(session.ownerKey,'engraving-types',page),queryFn:({signal})=>commerceGet('/engraving/types',{page},signal),enabled:session.ready,retry:false,staleTime:0});
  const [knownTypes,setKnownTypes]=useState([]);
  useEffect(()=>{if(options.data?.enabled)setKnownTypes(previous=>[...new Map([...(page===1?[]:previous),...options.data.types].map(value=>[value.typeId,value])).values()]);},[options.data,page]);
  const type=knownTypes.find(value=>value.typeId===draft.typeId), editId=params.get('edit');
  const update=(patch)=>{setAdded(false);setError('');setDraft(previous=>({...previous,...patch}));};
  useEffect(()=>{
    if(!editId || draft.replaceLineId===editId || !session.ready || pending || uncertain)return;
    setEditLoading(true);setEditFailure('');
    const generation=authGeneration(),controller=new AbortController();
    async function load(){try{
      const saved=await commerceGet(`/engraving/cart/${editId}`,undefined,controller.signal),spec=saved.specification;
      const files={};
      for(const [role,id] of [['item_photo',spec.itemPhotoUploadId],['surface_photo',spec.surfacePhotoUploadId],['personal_artwork',spec.content.artworkUploadId]])if(id){
        try{const result=await api.get(`/commerce/uploads/${id}/content`,{responseType:'blob',signal:controller.signal});files[role]=new File([result.data],'private-image',{type:result.data.type});cache.current.set(files[role],{id,itemKey:spec.itemKey,role,ownerKey});}catch{if(controller.signal.aborted)return;}
      }
      if(generation!==authGeneration()||controller.signal.aborted)return;
      setDraft({...draft,...spec,...spec.content,mode:spec.content.mode,files,step:0,replaceLineId:editId,replaceFingerprint:saved.editFingerprint});
    }catch(caught){if(!controller.signal.aborted)setEditFailure(commerceError(caught));}finally{if(!controller.signal.aborted&&generation===authGeneration())setEditLoading(false);}}
    void load();return()=>controller.abort();
    // Load once for a deliberately chosen edit target; never overwrite an active draft on refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[editId,session.ready]);
  function specification(ids={}){
    return {contractVersion:'engraving-spec-v1',itemKey:draft.itemKey,typeId:draft.typeId,configurationVersion:type?.version||1,description:draft.description,placement:draft.placement,
      content:draft.mode==='text'?{mode:'text',text:draft.text,fontId:draft.fontId}:draft.mode==='icons'?{mode:'icons',iconId:draft.iconId}:{mode:'personal',subtype:draft.subtype,artworkUploadId:ids.personal_artwork||'000000000000000000000003'},
      requestedAppearance:draft.requestedAppearance,specialRequests:draft.specialRequests,itemPhotoUploadId:ids.item_photo||placeholder,...(draft.files.surface_photo?{surfacePhotoUploadId:ids.surface_photo||'000000000000000000000002'}:{})};
  }
  function validate(step){
    if(!type)return 'Choose an available item type.';
    if(!draft.files.item_photo)return 'Add one photograph of your physical item.';
    if(type.typeId==='other'&&!draft.description.trim())return 'Briefly describe your item.';
    if(step===0)return '';
    if(draft.placement.kind==='selected'&&!type.placements.some(value=>value.id===draft.placement.placementId&&value.status==='active'))return 'Choose an available placement or ask us to help.';
    if(draft.mode==='text'&&(!draft.text.trim()||!type.fontIds.includes(draft.fontId)||[...draft.text].length>type.maxCharacters||draft.text.split(/\r?\n/).length>type.maxLines||draft.text.split(/\r?\n/).some(line=>[...line].length>type.maxCharactersPerLine)))return 'Enter your text within the line limits and choose an approved font.';
    if(draft.mode==='text' && /\p{Script=Arabic}/u.test(draft.text) && options.data.fonts.find(value=>value.id===draft.fontId)?.language !== 'ar')return 'Choose an Arabic-supporting font for Arabic text.';
    if(draft.mode==='icons'&&!type.iconIds.includes(draft.iconId))return 'Choose an approved symbol.';
    if(draft.mode==='personal'&&!draft.files.personal_artwork)return 'Upload the personal artwork you want engraved.';
    return '';
  }
  function remember(value){try{sessionStorage.setItem(scope,JSON.stringify(value));}catch{/* Memory-only recovery still works. */}}
  async function check(){setRecovering(true);try{
    let key=attempt.current?.operationKey;try{key ||= JSON.parse(sessionStorage.getItem(scope))?.key;}catch{/* Optional storage. */}
    if(!key)throw Error('The previous attempt cannot be recovered here. Review the cart before starting another item.');
    const result=await commerceGet(`/cart/operations/${key}`);
    if(result.applied){setAcceptedOrder(result.alreadyOrdered||null);setUncertain(false);remember({key,pending:false});setAdded(true);attempt.current=null;await cart.refresh();}
    else setError('This add is not confirmed. Retry the same saved request, or check the cart again. A missing result does not prove an in-flight request failed.');
  }catch(caught){setError(commerceError(caught));}finally{setRecovering(false);}}
  async function add(){
    const invalid=validate(2);if(!attempt.current&&invalid){setError(invalid);return;}
    const generation=authGeneration();setPending(true);setError('');
    try{
      if(!attempt.current){
        const quote=await commercePost('/engraving/quote',{specification:specification()});
        const ids={};
        for(const role of ['item_photo','surface_photo',...(draft.mode==='personal'?['personal_artwork']:[])])if(draft.files[role]){
          const file=draft.files[role],cached=cache.current.get(file);
          let id=cached?.ownerKey===ownerKey&&cached.itemKey===draft.itemKey&&cached.role===role?cached.id:null;
          if(!id){id=await uploadPrivateFile(file,{purpose:'engraving_service',ownerContext:cart.checkoutOwnerKey,engravingItemKey:draft.itemKey,fieldKey:role,generation,onProgress:setProgress});cache.current.set(file,{id,itemKey:draft.itemKey,role,ownerKey});}ids[role]=id;
        }
        if(generation!==authGeneration())throw Error('Your shopping session changed. Start a new engraving.');
        attempt.current={kind:'engraving_service_v1',operationKey:crypto.randomUUID(),quantity:1,specification:specification(ids),reviewFingerprint:quote.reviewFingerprint,...(draft.replaceLineId?{replaceLineId:draft.replaceLineId,replaceFingerprint:draft.replaceFingerprint}:{})};
      }
      remember({key:attempt.current.operationKey,pending:true});setUncertain(true);
      const addedResult = await cart.add(attempt.current);
      setAcceptedOrder(addedResult.alreadyOrdered || null);
      if(generation!==authGeneration())return;
      remember({key:attempt.current.operationKey,pending:false});setUncertain(false);setAdded(true);attempt.current=null;
    }catch(caught){if(generation===authGeneration()){
      setError(commerceError(caught));
      if(caught.response?.data?.error?.code==='ENGRAVING_OWNER_CHANGED')void cart.refresh();
      if(caught.response&&caught.response.status<500){setUncertain(false);remember({pending:false});attempt.current=null;void options.refetch();}
    }}finally{if(generation===authGeneration()){setPending(false);setProgress('');}}
  }
  if(!session.ready||options.isPending)return <main className="commerce-page" role="status">Checking engraving availability…</main>;
  if(options.error)return <main className="commerce-page"><h1>Laser Engraving</h1><p role="alert">{commerceError(options.error)}</p><button className="button button-secondary" onClick={()=>options.refetch()}>Try again</button></main>;
  if(!options.data.enabled)return <ServiceRequestPage service="laser_engraving"/>;
  if(editLoading)return <main className="commerce-page" role="status">Loading your saved engraving and private images...</main>;
  if(editFailure)return <main className="commerce-page"><h1>Saved engraving unavailable</h1><p role="alert">{editFailure}</p><Link to="/cart">Return to cart</Link><button type="button" onClick={()=>{reset();setParams({});setEditFailure('');}}>Start a new engraving</button></main>;
  const summary=type?{...specification(),typeName:type.name,placementLabel:draft.placement.kind==='help'?'Help me choose the best placement':type.placements.find(value=>value.id===draft.placement.placementId)?.label}:null;
  return <main className="engraving-page"><PageMetadata title="Laser Engraving | Tap & Wrap" description="Personal engraving for an item you already own. Inspection and approval before payment." pathname="/customize/laser-engraving" indexable={false}/>
    <header className="engraving-heading"><p className="eyebrow">Your piece. Your story.</p><h1>A personal mark,<br/>on something yours.</h1><p>Engraving for an item you already own. One item, one location, carefully reviewed before payment.</p></header>
    <nav className="engraving-progress" aria-label="Engraving steps">{steps.map((label,index)=><button key={label} type="button" aria-current={draft.step===index?'step':undefined} disabled={pending||uncertain||index>draft.step} onClick={()=>update({step:index})}><span>{index+1}</span>{label}</button>)}</nav>
    {uncertain&&<section className="commerce-notice"><h2>Check your cart addition</h2><p>The previous add is unconfirmed. Check its status before starting another item.</p><button type="button" disabled={recovering||pending} onClick={check}>Check add status</button>{attempt.current&&<button type="button" disabled={pending} onClick={add}>Retry same add</button>}</section>}
    <div className="engraving-layout"><section className="engraving-panel"><h2>{steps[draft.step]}</h2><fieldset disabled={pending||uncertain||added} className="engraving-fields" aria-describedby={error && !error.includes('photograph') ? 'engraving-error' : undefined}>
      {draft.step===0&&<><p>Photograph the physical item you will send to us. Suitability is confirmed after inspection.</p><div className="engraving-type-grid">{knownTypes.map(option=><label className={`engraving-type ${draft.typeId===option.typeId?'selected':''}`} key={option.typeId}><input type="radio" name="engraving-type" value={option.typeId} checked={draft.typeId===option.typeId} onChange={()=>update({typeId:option.typeId,placement:{kind:'help'},fontId:'',iconId:''})}/><span>{option.name}</span><strong>{money(option.pricePiastres)}</strong></label>)}</div>{options.data.hasNext&&<button type="button" onClick={()=>setPage(value=>value+1)}>More item types</button>}{!knownTypes.length&&<p>No engraving types are currently approved. Please check back later.</p>}
        {type?.typeId==='office-set'&&<p className="commerce-notice">One Office Set line covers one selected physical piece, not every object in the set.</p>}
        {type?.typeId==='other'&&<label className="commerce-field">Describe your item<textarea maxLength={300} rows={2} value={draft.description} onChange={event=>update({description:event.target.value})}/></label>}
        <LocalFileField field={photoField('Photo of your item',true)} error={error.includes('photograph') ? error : undefined} value={draft.files.item_photo?[draft.files.item_photo]:[]} onChange={files=>update({files:{...draft.files,item_photo:files[0]}})}/>
        <LocalFileField field={photoField('Close-up of engraving surface (optional)',false)} value={draft.files.surface_photo?[draft.files.surface_photo]:[]} onChange={files=>update({files:{...draft.files,surface_photo:files[0]}})}/>
      </>}
      {draft.step===1&&<><fieldset><legend>Engraving location</legend><div className="engraving-choice-grid">{type?.placements.filter(value=>value.status==='active').map(value=><label key={value.id}><input type="radio" name="placement" checked={draft.placement.kind==='selected'&&draft.placement.placementId===value.id} onChange={()=>update({placement:{kind:'selected',placementId:value.id}})}/>{value.label}</label>)}<label><input type="radio" name="placement" checked={draft.placement.kind==='help'} onChange={()=>update({placement:{kind:'help'}})}/>Help me choose the best placement</label></div></fieldset>
        <fieldset><legend>What would you like engraved?</legend><div className="engraving-modes">{['text','icons','personal'].map(mode=><label key={mode}><input type="radio" name="mode" checked={draft.mode===mode} onChange={()=>update({mode})}/>{mode[0].toUpperCase()+mode.slice(1)}</label>)}</div></fieldset>
        {draft.mode==='text'&&<><label className="commerce-field">Your engraving text<textarea aria-invalid={Boolean(error && draft.mode==='text')} aria-describedby={error ? 'engraving-text-help engraving-error' : 'engraving-text-help'} dir="auto" rows={3} maxLength={type?.maxCharacters*2||160} value={draft.text} onChange={event=>update({text:event.target.value})}/><small id="engraving-text-help">Up to {type?.maxLines} lines, {type?.maxCharacters} characters total and {type?.maxCharactersPerLine} per line. Arabic and English welcome. These limits do not confirm physical suitability.</small></label><fieldset><legend>Choose a font</legend><div className="engraving-fonts">{options.data.fonts.filter(font=>type?.fontIds.includes(font.id)).map(font=><label key={font.id}><input type="radio" name="font" disabled={font.language!=='ar' && /\p{Script=Arabic}/u.test(draft.text)} checked={draft.fontId===font.id} onChange={()=>update({fontId:font.id})}/><span>{font.label} · {font.language==='ar'?'Arabic':'English'}</span><span className="engraving-sample" dir="auto" style={{fontFamily:font.family}}>{(font.language!=='ar' && /\p{Script=Arabic}/u.test(draft.text) ? 'A lasting memory' : draft.text)|| (font.language==='ar'?'ذكرى جميلة':'A lasting memory')}</span></label>)}</div></fieldset></>}
        {draft.mode==='icons'&&<fieldset><legend>Choose one symbol</legend><div className="engraving-icon-grid">{options.data.icons.filter(icon=>type?.iconIds.includes(icon.id)).map(icon=><label key={icon.id}><input type="radio" name="icon" checked={draft.iconId===icon.id} onChange={()=>update({iconId:icon.id})}/><img src={icon.asset} width="64" height="64" alt=""/><span>{icon.label}</span></label>)}</div></fieldset>}
        {draft.mode==='personal'&&<><fieldset><legend>Your personal artwork</legend><div className="engraving-choice-grid">{PERSONAL_TYPES.map(subtype=><label key={subtype}><input type="radio" name="personal-type" checked={draft.subtype===subtype} onChange={()=>update({subtype})}/>{subtype[0].toUpperCase()+subtype.slice(1)}</label>)}</div></fieldset><LocalFileField field={photoField(`${draft.subtype[0].toUpperCase()+draft.subtype.slice(1)} artwork`,true)} value={draft.files.personal_artwork?[draft.files.personal_artwork]:[]} onChange={files=>update({files:{...draft.files,personal_artwork:files[0]}})}/><p>This artwork is separate from the photo of your physical item. Fingerprint images are treated only as private artwork.</p></>}
        <fieldset><legend>Requested appearance</legend><div className="engraving-choice-grid">{APPEARANCES.map(color=><label key={color}><input type="radio" name="appearance" checked={draft.requestedAppearance===color} onChange={()=>update({requestedAppearance:color})}/><span className={`engraving-swatch ${color}`}/>{color[0].toUpperCase()+color.slice(1)}</label>)}</div><p>The final mark depends on your item, material and process. These preferences do not guarantee the physical mark color or change the price.</p></fieldset>
        <details className="engraving-requests"><summary>Any special requests?</summary><label className="commerce-field">Positioning, orientation, size or handling notes<textarea rows={4} maxLength={1000} value={draft.specialRequests} onChange={event=>update({specialRequests:event.target.value})}/></label></details>
      </>}
      {draft.step===2&&<><div className="engraving-review-images"><Preview file={draft.files.item_photo} label="Your physical item"/><Preview file={draft.files.surface_photo} label="Engraving surface"/>{draft.mode==='personal'&&<Preview file={draft.files.personal_artwork} label={`${draft.subtype} artwork`}/>}</div><EngravingSummary engraving={summary}/><button type="button" className="commerce-link-button" onClick={()=>update({step:0})}>Edit item and photos</button><button type="button" className="commerce-link-button" onClick={()=>update({step:1})}>Edit engraving choices</button><p className="commerce-notice">We inspect your physical item and confirm the final design with you before authorizing payment. Adding to cart does not approve suitability or start engraving.</p></>}
    </fieldset>{error&&!error.includes('photograph')&&<p id="engraving-error" className="form-error" role="alert">{error}</p>}{progress&&<p role="status">{progress}</p>}
    {added?<div role="status"><h3>{acceptedOrder ? 'Your engraving is already ordered' : 'Your engraving is in the cart'}</h3><Link className="button button-primary" to={acceptedOrder ? `/orders/${acceptedOrder}` : '/cart'}>{acceptedOrder ? 'View accepted order' : 'View cart'}</Link><button type="button" className="button button-secondary" onClick={()=>{reset();setParams({});setAdded(false);}}>Start a new engraving</button></div>:<div className="engraving-actions">{draft.step>0&&<button type="button" className="button button-secondary" disabled={pending||uncertain} onClick={()=>update({step:draft.step-1})}>Back</button>}{draft.step<2?<button type="button" className="button button-primary" disabled={pending||uncertain} onClick={()=>{const invalid=validate(draft.step);if(invalid)setError(invalid);else update({step:draft.step+1});}}>Continue</button>:<button type="button" className="button button-primary" disabled={pending||uncertain} onClick={add}>{pending?'Adding securely…':'Add Engraving to Cart'}</button>}</div>}</section>
    <aside className="engraving-aside"><p className="eyebrow">Made personal</p><h2>{type?.name||'Your own item'}</h2><strong className="engraving-price">{type?money(type.pricePiastres):'Choose an item'}</strong><p>Per physical item and one engraving location. No extra charge for fonts, symbols, placement or appearance.</p><hr/><p>Your item stays yours. We review its condition and suitability before payment.</p><p className="commerce-muted">Your draft stays in this browser tab as you explore. Refreshing clears the draft and local photos. Private files upload only when you add to cart.</p><button type="button" className="commerce-link-button" disabled={pending||uncertain} onClick={()=>{if(window.confirm('Clear this engraving draft and its local photos?')){reset();setParams({});setAdded(false);}}}>Start again</button></aside></div>
  </main>;
}
