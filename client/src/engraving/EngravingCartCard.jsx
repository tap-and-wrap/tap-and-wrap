import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './engraving.css';
import { useSession } from '../auth/SessionProvider.jsx';
import { api, authGeneration } from '../services/api.js';
import { commerceGet } from '../commerce/api.js';
import CartLine from '../commerce/CartLine.jsx';
import { DesignPreview } from './StudioControls.jsx';
import { FONT_REGISTRY, ICON_REGISTRY } from '../../../shared/engraving/definitions.mjs';

function PrivateImage({item,owner,role,label}) {
  const [state,setState]=useState(null);
  useEffect(()=>{
    const controller=new AbortController(),generation=authGeneration(),urls=[];
    if(!item.valid) return ()=>controller.abort();
    async function load() {
      try {
        const {specification}=await commerceGet(`/engraving/cart/${item.id}`,undefined,controller.signal);
        const id=role==='item'?specification.itemPhotoUploadId:role==='surface'?specification.surfacePhotoUploadId:specification.content.artworkUploadId;
        if(!id) return;
        const response=await api.get(`/commerce/uploads/${id}/content`,{responseType:'blob',signal:controller.signal});
        if(controller.signal.aborted || generation!==authGeneration()) return;
        const url=URL.createObjectURL(response.data);urls.push(url);setState({url,owner,item});
      } catch { if(!controller.signal.aborted&&generation===authGeneration()) setState({error:true,owner,item}); }
    }
    void load();
    return ()=>{controller.abort();urls.forEach(url=>URL.revokeObjectURL(url));};
  },[item,owner,role]);
  const current=item.valid&&state?.owner===owner&&state.item===item?state:null;
  return current?.url?<img src={current.url} alt={label}/>:<span>{!item.valid||current?.error?'Private image unavailable — edit to replace':label}</span>;
}

export default function EngravingCartCard({item,pending,remove}) {
  const session=useSession(), engraving=item.engraving;
  const name=(item.name||'Item engraving').replace(/\bengraving\b/gi,'Engraving');
  const font=FONT_REGISTRY.find(value=>value.id===engraving?.content?.fontId),icon=ICON_REGISTRY.find(value=>value.id===engraving?.content?.iconId);
  return <CartLine item={item} name={name} pending={pending} remove={remove} fixed image={<PrivateImage key={`${session.ownerKey}:${item.id}`} item={item} owner={session.ownerKey} role="item" label="Your private item reference"/>}
    status="Inspection and design acceptance before payment."
    edit={<Link to={`/customize/laser-engraving?edit=${item.id}`}>Edit engraving</Link>}>
    {open=><>
      {engraving?<dl>
        <div><dt>Item</dt><dd>{engraving.description||engraving.typeName||name}</dd></div>
        <div><dt>Placement</dt><dd>{engraving.placementLabel||'Help me choose the best placement'}</dd></div>
        <div><dt>Design</dt><dd>{engraving.content?.mode==='text'?<><bdi>{engraving.content.text}</bdi> · {font?.label||'Saved font'}</>:engraving.content?.mode==='icons'?icon?.label||'Saved symbol':`${engraving.content?.subtype||'Personal'} artwork`}</dd></div>
        <div><dt>Appearance</dt><dd>{engraving.requestedAppearance} · preference, subject to inspection</dd></div>
        {engraving.specialRequests&&<div><dt>Requests</dt><dd>{engraving.specialRequests}</dd></div>}
      </dl>:<p>Edit this engraving to review its saved design and images.</p>}
      {open&&<><DesignPreview content={engraving?.content} appearance={engraving?.requestedAppearance} compact/><div className="cart-v2-private-previews">
        {engraving?.files?.surface&&<PrivateImage item={item} owner={session.ownerKey} role="surface" label="Requested engraving surface"/>}
        {engraving?.files?.artwork&&<PrivateImage item={item} owner={session.ownerKey} role="artwork" label="Your private design artwork"/>}
      </div></>}
      <p className="commerce-muted">Your images are private. Adding to cart does not extend their lifetime.{item.attachments?.expiresAt&&<> Replace or order before <time dateTime={item.attachments.expiresAt}>{new Date(item.attachments.expiresAt).toLocaleString()}</time>.</>}</p>
    </>}
  </CartLine>;
}
