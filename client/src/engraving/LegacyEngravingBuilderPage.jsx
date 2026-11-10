import ConfirmationDialog from '../components/ConfirmationDialog.jsx';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { api, authGeneration } from '../services/api.js';
import { commerceGet, commercePost, commerceError, money, uploadPrivateFile } from '../commerce/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { StudioUpload, FontGallery, IconGallery, DesignPreview, HandwritingPad, LocalPhoto } from './StudioControls.jsx';
import { useEngravingDraft } from './EngravingDraftProvider.jsx';
import EngravingSummary from './EngravingSummary.jsx';
import ServiceRequestPage from '../pages/ServiceRequestPage.jsx';
import PageMetadata from '../seo/PageMetadata.jsx';
import { APPEARANCES, NEW_PERSONAL_TYPES } from '../../../shared/engraving/definitions.mjs';
import './engraving.css';
const placeholder = '000000000000000000000001';
const steps = ['Choose your item','Make it personal','Review your engraving'];
export default function EngravingBuilderPage() {
  const session = useSession(), cart = useCart();
  if (!session.ready || cart.loading) return <main className="commerce-page" role="status">Preparing your private engraving session...</main>;
  if (cart.error) return <main className="commerce-page"><h1>Laser Engraving</h1><p role="alert">{commerceError(cart.error)}</p><button type="button" className="button button-secondary" onClick={()=>cart.refresh()}>Retry private shopping session</button></main>;
  return <EngravingBuilder key={cart.checkoutOwnerKey || session.ownerKey}/>;
}
function EngravingBuilder() {
  const session=useSession(), state=useEngravingDraft(), cart=useCart(), [params,setParams]=useSearchParams();
  const {draft,setDraft,reset,attempt,cache,ownerKey,pending,setPending}=state;
  const [resetTarget,setResetTarget]=useState(null);
  const [editLoading,setEditLoading]=useState(Boolean(params.get('edit'))),[editFailure,setEditFailure]=useState('');
  const [page,setPage]=useState(1), [error,setError]=useState(''),[progress,setProgress]=useState(''),[added,setAdded]=useState(false),[acceptedOrder,setAcceptedOrder]=useState(null),[recovering,setRecovering]=useState(false);
  const scope=`tw-engraving-add:${cart.checkoutOwnerKey || ownerKey}`;
  const [uncertain,setUncertain]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(scope))?.pending===true;}catch{return false;}});
  const options=useQuery({queryKey:privateQueryKey(session.ownerKey,'engraving-types',page),queryFn:({signal})=>commerceGet('/engraving/types',{page},signal),enabled:session.ready,retry:false,staleTime:0});
  const [knownTypes,setKnownTypes]=useState([]), [visibleTypes,setVisibleTypes]=useState(6);
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
      setDraft({...draft,...spec,...spec.content,mode:spec.content.mode,handwritingStrokes:[],files,step:0,replaceLineId:editId,replaceFingerprint:saved.editFingerprint});
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
    if(!cart.checkoutOwnerKey){setError('Reload your cart to verify your private shopping session before uploading.');return;}
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
    <header className="engraving-heading"><div><p className="eyebrow">The engraving studio</p><h1>A little mark.<br/><em>A lasting meaning.</em></h1><p>Turn something you own into something only yours.</p></div><span className="studio-signature" aria-hidden="true">Made<br/>personal.</span></header>
    <nav className="engraving-progress" aria-label="Engraving steps">{steps.map((label,index)=><button key={label} type="button" aria-current={draft.step===index?'step':undefined} disabled={pending||uncertain||index>draft.step} onClick={()=>update({step:index})}><span>{index+1}</span>{label}</button>)}</nav>
    {uncertain&&<section className="commerce-notice"><h2>Check your cart addition</h2><p>The previous add is unconfirmed. Check its status before starting another item.</p><button type="button" disabled={recovering||pending} onClick={check}>Check add status</button>{attempt.current&&<button type="button" disabled={pending} onClick={add}>Retry same add</button>}</section>}
    <div className="engraving-layout"><section className="engraving-panel"><h2>{steps[draft.step]}</h2><fieldset disabled={pending||uncertain||added} className="engraving-fields" aria-describedby={error && !error.includes('photograph') ? 'engraving-error' : undefined}>
      {draft.step===0&&<><p className="studio-intro">What would you like to make personal?</p><div className="engraving-type-grid">{knownTypes.slice(0,Math.max(visibleTypes,knownTypes.findIndex(value=>value.typeId===draft.typeId)+1)).map(option=><label className={`engraving-type ${draft.typeId===option.typeId?'selected':''}`} key={option.typeId}><input type="radio" name="engraving-type" value={option.typeId} checked={draft.typeId===option.typeId} onChange={()=>update({typeId:option.typeId,placement:{kind:'help'},fontId:'',iconId:''})}/><img src={`/assets/engraving/v2/${['perfume','necklace','bracelet','watch','lip-gloss','makeup','bag','office-set','other'].includes(option.typeId)?option.typeId:'other'}-item.svg`} width="240" height="240" alt=""/><span>{option.name}</span><strong>{money(option.pricePiastres)}</strong></label>)}</div>
        {(knownTypes.length>visibleTypes||options.data.hasNext)&&<button type="button" className="studio-load-more" onClick={()=>{setVisibleTypes(value=>value+6);if(knownTypes.length<=visibleTypes+6&&options.data.hasNext)setPage(value=>value+1);}}>Load More <span aria-hidden="true">+</span></button>}
        <p className="studio-microcopy">Illustrations are inspiration. Your photo is our actual item reference.</p>
        {type&&<div className="studio-photo-section"><h3>Let us meet your {type.name.toLowerCase()}</h3><p>One clear photo helps us understand your piece.</p>
          {type.typeId==='office-set'&&<p className="commerce-notice">One selected piece from your set, one engraving location.</p>}
          {type.typeId==='other'&&<label className="commerce-field">Describe your item<textarea maxLength={300} rows={2} value={draft.description} onChange={event=>update({description:event.target.value})}/></label>}
          <StudioUpload label="Photo of your item" required file={draft.files.item_photo} error={error.includes('photograph')?error:undefined} onChange={file=>update({files:{...draft.files,item_photo:file}})}/>
          <details className="studio-surface-upload" open={Boolean(draft.files.surface_photo)||undefined}><summary>Add a close-up of the engraving surface (optional)</summary><StudioUpload label="Close-up of engraving surface (optional)" file={draft.files.surface_photo} onChange={file=>update({files:{...draft.files,surface_photo:file}})}/></details>
        </div>}
      </>}
      {draft.step===1&&<><fieldset><legend>Where should your story go?</legend><div className="engraving-choice-grid studio-placements">{type?.placements.filter(value=>value.status==='active').map(value=><label key={value.id}><input type="radio" name="placement" checked={draft.placement.kind==='selected'&&draft.placement.placementId===value.id} onChange={()=>update({placement:{kind:'selected',placementId:value.id}})}/>{value.label}</label>)}<label><input type="radio" name="placement" checked={draft.placement.kind==='help'} onChange={()=>update({placement:{kind:'help'}})}/>Help me choose the best placement</label></div><small>Choose a preferred surface. We confirm suitability after inspection.</small></fieldset>
        <fieldset><legend>What would you like engraved?</legend><div className="engraving-modes">{[['text','Aa','Text'],['icons','\u2661','Icons'],['personal','\u270e','Personal']].map(([mode,symbol,label])=><label key={mode}><input type="radio" name="mode" checked={draft.mode===mode} onChange={()=>update({mode})}/><span aria-hidden="true">{symbol}</span>{label}</label>)}</div></fieldset>
        <div className="studio-inline-preview"><div className="studio-preview-top"><span>{type?.name}</span><strong>{type?money(type.pricePiastres):''}</strong></div><DesignPreview content={specification().content} appearance={draft.requestedAppearance} artwork={draft.files.personal_artwork}/></div>
        {draft.mode==='text'&&<><label className="commerce-field">Your engraving text<textarea aria-invalid={Boolean(error)} aria-describedby={error?'engraving-text-help engraving-error':'engraving-text-help'} dir="auto" rows={3} maxLength={type?.maxCharacters*2||160} placeholder="A name, a date, a few words to keep" value={draft.text} onChange={event=>update({text:event.target.value,fontId:/\p{Script=Arabic}/u.test(event.target.value)&&options.data.fonts.find(font=>font.id===draft.fontId)?.language!=='ar'?'':draft.fontId})}/><small id="engraving-text-help">{[...draft.text].length}/{type?.maxCharacters} characters / {type?.maxLines} lines / {type?.maxCharactersPerLine} per line</small></label><fieldset><legend>Find your handwriting in a font</legend><FontGallery ids={type?.fontIds||[]} selected={draft.fontId} text={draft.text} onSelect={fontId=>update({fontId})}/><small>Delicate styles are subject to material review.</small></fieldset></>}
        {draft.mode==='icons'&&<fieldset><legend>Choose one symbol</legend><IconGallery ids={type?.iconIds||[]} selected={draft.iconId} onSelect={iconId=>update({iconId})}/></fieldset>}
        {draft.mode==='personal'&&<><fieldset><legend>A little piece of you</legend><div className="engraving-choice-grid">{NEW_PERSONAL_TYPES.map(subtype=><label key={subtype}><input type="radio" name="personal-type" checked={draft.subtype===subtype} onChange={()=>update({subtype})}/>{subtype[0].toUpperCase()+subtype.slice(1)}</label>)}</div></fieldset>
          {draft.subtype==='drawing'&&<p className="commerce-notice">Your saved Drawing artwork is preserved. Choose a new option only if you want to replace it.</p>}
          {draft.subtype==='handwriting'&&<HandwritingPad key={draft.itemKey} strokes={draft.handwritingStrokes||[]} existingFile={draft.files.personal_artwork} onStrokes={handwritingStrokes=>update({handwritingStrokes,files:{...draft.files,personal_artwork:undefined}})} onExport={file=>update({files:{...draft.files,personal_artwork:file}})}/>}
          <StudioUpload label={`${draft.subtype[0].toUpperCase()+draft.subtype.slice(1)} artwork`} required file={draft.files.personal_artwork} onChange={file=>update({handwritingStrokes:[],files:{...draft.files,personal_artwork:file}})}/><small>Private artwork, separate from your item photo. Fingerprints are artwork only.</small>
        </>}
        <fieldset><legend>Your preferred finish</legend><div className="engraving-choice-grid studio-appearances">{APPEARANCES.map(color=><label key={color}><input type="radio" name="appearance" checked={draft.requestedAppearance===color} onChange={()=>update({requestedAppearance:color})}/><span className={`engraving-swatch ${color}`}/>{color[0].toUpperCase()+color.slice(1)}</label>)}</div><small>A visual preference, not a guaranteed laser-mark colour.</small></fieldset>
        <details className="engraving-requests"><summary>Any special requests?</summary><label className="commerce-field">Positioning, orientation, size or handling notes<textarea rows={3} maxLength={1000} placeholder="Anything you would like us to know?" value={draft.specialRequests} onChange={event=>update({specialRequests:event.target.value})}/></label></details>
      </>}
      {draft.step===2&&<><div className="studio-review-heading"><div><p className="eyebrow">A piece of your story</p><h3>{type?.name}, made personal</h3></div><strong className="engraving-price">{money(type?.pricePiastres)}</strong></div><div className="studio-review-item"><LocalPhoto file={draft.files.item_photo} alt="Your physical item"/>{draft.files.surface_photo&&<LocalPhoto file={draft.files.surface_photo} alt="Engraving surface"/>}<div><span>Your actual item</span><p>{draft.description||'One physical item, one engraving location'}</p></div></div><DesignPreview content={specification().content} appearance={draft.requestedAppearance} artwork={draft.files.personal_artwork}/><EngravingSummary engraving={summary} preview={false}/><div className="studio-edit-actions"><button type="button" className="commerce-link-button" onClick={()=>update({step:0})}>Edit item and photos</button><button type="button" className="commerce-link-button" onClick={()=>update({step:1})}>Edit engraving choices</button></div><p className="commerce-notice">We inspect your item and confirm the design with you before payment. This request does not approve suitability or start engraving.</p></>}
    </fieldset>{draft.step===0&&<details className="studio-private-details"><summary>Photos, privacy &amp; your draft</summary><p>Your draft stays in this tab while you browse. Refreshing clears it. Photos upload privately only when you add to cart.</p></details>}{error&&!error.includes('photograph')&&<p id="engraving-error" className="form-error" role="alert">{error}</p>}{progress&&<p role="status">{progress}</p>}
    {added?<div role="status"><h3>{acceptedOrder ? 'Your engraving is already ordered' : 'Your engraving is in the cart'}</h3><Link className="button button-primary" to={acceptedOrder ? `/orders/${acceptedOrder}` : '/cart'}>{acceptedOrder ? 'View accepted order' : 'View cart'}</Link><button type="button" className="button button-secondary" onClick={()=>{reset();setParams({});setAdded(false);}}>Start a new engraving</button></div>:<div className="engraving-actions">{draft.step>0&&<button type="button" className="button button-secondary" disabled={pending||uncertain} onClick={()=>update({step:draft.step-1})}>Back</button>}{draft.step<2?<button type="button" className="button button-primary" disabled={pending||uncertain} onClick={()=>{const invalid=validate(draft.step);if(invalid)setError(invalid);else update({step:draft.step+1});}}>Continue</button>:<button type="button" className="button button-primary" disabled={pending||uncertain} onClick={add}>{pending?'Adding securely…':'Add Engraving to Cart'}</button>}</div>}</section>
    <aside className="engraving-aside">{draft.step===1?<DesignPreview content={specification().content} appearance={draft.requestedAppearance} artwork={draft.files.personal_artwork}/>:<img className="studio-aside-illustration" src={`/assets/engraving/v2/${['perfume','necklace','bracelet','watch','lip-gloss','makeup','bag','office-set','other'].includes(type?.typeId)?type.typeId:'perfume'}-item.svg`} width="240" height="240" alt="Illustrative item"/>}<p className="eyebrow">{type?.name||'Something only yours'}</p><strong className="engraving-price">{type?money(type.pricePiastres):'Choose your piece'}</strong><p>One item. One location. No option surcharges.</p><details><summary>Your item, thoughtfully handled</summary><p>Inspection and design acceptance come before payment. The final finish depends on your material.</p><p>Your draft and photos stay in this tab while you explore. Refreshing clears them. Files upload privately only at Add to Cart.</p></details><button type="button" className="commerce-link-button" disabled={pending||uncertain} onClick={event=>setResetTarget(event.currentTarget)}>Start again</button></aside></div>
  {resetTarget&&<ConfirmationDialog title="Clear this engraving draft?" description="Your current engraving choices and local photos will be removed from this tab." returnFocus={resetTarget} onCancel={()=>setResetTarget(null)} onConfirm={()=>{reset();setParams({});setAdded(false);setResetTarget(null);}} cancelLabel="Keep editing" confirmLabel="Clear draft"/>}</main>;
}
