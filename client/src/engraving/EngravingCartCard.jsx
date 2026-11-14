import { useEffect, useState } from 'react';
import './engraving.css';
import { useSession } from '../auth/SessionProvider.jsx';
import { authGeneration } from '../services/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { loadPrivateVisualAsset } from './visual/private-assets.js';
import { commerceGet } from '../commerce/api.js';
import CartLine from '../commerce/CartLine.jsx';
import { DesignPreview } from './StudioControls.jsx';
import { ICON_REGISTRY } from '../../../shared/engraving/definitions.mjs';
import EngravingSummary from './EngravingSummary.jsx';
import SavedVisualPreview from './visual/SavedVisualPreview.jsx';

export function PrivateImage({item,owner,role,label}) {
  const cart = useCart(), scope = `${owner}:${cart.checkoutOwnerKey}`;
  const { id: lineId, valid } = item;
  const attachmentVersion = item.attachments?.expiresAt;
  const [state,setState]=useState(null);
  useEffect(()=>{
    const controller=new AbortController(),generation=authGeneration(),urls=[];
    let timer;
    if(!valid) return ()=>controller.abort();
    async function load() {
      for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const {specification}=await commerceGet(`/engraving/cart/${lineId}`,undefined,controller.signal);
        const id=role==='item' ? (specification.itemPhotoUploadId || specification.itemPhotoUploadIds?.[0] || specification.surfacePhotoUploadId) : role==='surface' ? specification.surfacePhotoUploadId : specification.content?.artworkUploadId;
        if(!id) throw new Error('Private image unavailable');
        const asset = await loadPrivateVisualAsset({ uploadId:id, ownerScope:scope, sessionOwnerKey:owner, signal:controller.signal });
        if(controller.signal.aborted || generation!==authGeneration()) return;
        const url=URL.createObjectURL(asset.blob);urls.push(url);setState({url,scope,lineId});
        return;
      } catch (error) {
        if(controller.signal.aborted || generation!==authGeneration()) return;
        const status = error.response?.status;
        const retryable = [408,502,503,504].includes(status) || !status && ['ERR_NETWORK','ECONNABORTED','ETIMEDOUT'].includes(error.code);
        if (!retryable || attempt === 2) { setState({error:true,scope,lineId}); return; }
        await new Promise(resolve => { timer=setTimeout(resolve, 500 * 2 ** attempt); controller.signal.addEventListener('abort',resolve,{once:true}); });
      }
      }
    }
    void load();
    return ()=>{controller.abort();clearTimeout(timer);urls.forEach(url=>URL.revokeObjectURL(url));};
  },[lineId,valid,attachmentVersion,owner,scope,role]);
  const current=valid&&state?.scope===scope&&state.lineId===lineId?state:null;
  return current?.url && !current.error ? <img src={current.url} alt={label} onError={()=>setState(value=>value?.url===current.url?{...value,error:true}:value)}/> : <span role="status">{!valid||current?.error?'Private image unavailable':label}</span>;
}

export default function EngravingCartCard({item,pending,remove}) {
  const session=useSession(), engraving=item.engraving;
  const name=(item.name||'Item engraving').replace(/\bengraving\b/gi,'Engraving');
  if (item.kind === 'engraving_service_v2') return <CartLine item={item} name={name} pending={pending} remove={remove} fixed image={<PrivateImage key={`${session.ownerKey}:${item.id}`} item={item} owner={session.ownerKey} role="surface" label="Your engraving surface"/>}>{open => <><EngravingSummary engraving={engraving} preview={false}/>{open && item.valid && <SavedVisualPreview cartLineId={item.id}/>}{item.attachments?.replacementRequired && <p className="commerce-muted">A private image has expired. Replace this engraving before ordering.</p>}</>}</CartLine>;
  const icon=ICON_REGISTRY.find(value=>value.id===engraving?.content?.iconId);
  return <CartLine item={item} name={name} pending={pending} remove={remove} fixed image={<PrivateImage key={`${session.ownerKey}:${item.id}`} item={item} owner={session.ownerKey} role="item" label="Your private item reference"/>}

   >
    {open=><>
      {engraving?<dl>
        {engraving.description && engraving.description.trim().toLowerCase() !== engraving.typeName?.trim().toLowerCase() && <div><dt>Item</dt><dd>{engraving.description}</dd></div>}
        <div><dt>Type</dt><dd>{engraving.typeName}</dd></div>
        <div><dt>Design</dt><dd>{engraving.content?.mode==='text'?<><bdi>{engraving.content.text}</bdi></>:engraving.content?.mode==='icons'?icon?.label||'Saved symbol':`${engraving.content?.subtype||'Personal'} artwork`}</dd></div>
        <div><dt>Appearance</dt><dd>{engraving.requestedAppearance} · preference, subject to inspection</dd></div>
        {engraving.specialRequests&&<div><dt>Requests</dt><dd>{engraving.specialRequests}</dd></div>}
      </dl>:<p>Edit this engraving to review its saved design and images.</p>}
      {open&&<><DesignPreview content={engraving?.content} appearance={engraving?.requestedAppearance} compact/><div className="cart-v2-private-previews">
        {engraving?.files?.surface&&<PrivateImage item={item} owner={session.ownerKey} role="surface" label="Requested engraving surface"/>}
        {engraving?.files?.artwork&&<PrivateImage item={item} owner={session.ownerKey} role="artwork" label="Your private design artwork"/>}
      </div></>}
      <p className="commerce-muted">{item.attachments?.expiresAt&&<> Replace or order before <time dateTime={item.attachments.expiresAt}>{new Date(item.attachments.expiresAt).toLocaleString()}</time>.</>}</p>
    </>}
  </CartLine>;
}
