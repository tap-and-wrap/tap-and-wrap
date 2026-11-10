import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { api, authGeneration, assertAuthGeneration } from '../services/api.js';
import { commerceGet, adminCommerceGet, commerceError } from '../commerce/api.js';
import SavedVisualPreview from './visual/SavedVisualPreview.jsx';
import CatalogDialog from '../components/CatalogDialog.jsx';
function ImageDialog({ blob, title, onClose, returnFocus }) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const value=URL.createObjectURL(blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[blob]);
  return <CatalogDialog title={title} onClose={onClose} returnFocus={returnFocus}><img src={url} alt={title} style={{width:'100%',maxHeight:'70vh',objectFit:'contain'}}/></CatalogDialog>;
}
export default function EngravingOrderFiles({ orderId, engraving, admin = false }) {
  const session=useSession(),cart=useCart(),ownerScope=`${session.ownerKey}:${cart.checkoutOwnerKey}`;
  const pending=useRef(null),currentScope=useRef(ownerScope);currentScope.current=ownerScope;
  useEffect(()=>()=>pending.current?.abort(),[ownerScope]);
  const [file,setFile]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function view(role,returnFocus){
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    const generation=authGeneration();setLoading(true);setError('');
    try{
      const metadata=await (admin ? adminCommerceGet : commerceGet)(`/orders/${orderId}/engraving-files`,undefined,controller.signal),item=metadata.items.find(value=>value.itemKey===engraving.itemKey);
      const id=item?.files?.find(file=>file.key===role)?.id || item?.[role];if(!id)throw Error('This private image is unavailable. Contact the store about this order.');
      assertAuthGeneration(generation);
      const result=await api.get(admin?`/admin/commerce/orders/${orderId}/files/${id}`:`/commerce/uploads/${id}/content`,{responseType:'blob',timeout:15000,signal:controller.signal});
      if(!controller.signal.aborted&&currentScope.current===ownerScope&&generation===authGeneration())setFile({ownerScope,returnFocus,blob:result.data,title:role==='itemPhotoUploadId'||role.startsWith('itemPhoto-')?'Your physical item':role==='surfacePhotoUploadId'?'Engraving surface':'Your private engraving artwork'});
    }catch(caught){if(!controller.signal.aborted&&currentScope.current===ownerScope&&generation===authGeneration())setError(commerceError(caught));}
    finally{if(!controller.signal.aborted&&currentScope.current===ownerScope&&generation===authGeneration())setLoading(false);}
  }
  return <div>{engraving.layers && <SavedVisualPreview key={`${orderId}:${engraving.itemKey}`} orderId={orderId} itemKey={engraving.itemKey} admin={admin}/>}<div className="button-group">{(engraving.fileRoles||['itemPhotoUploadId']).map(role=><button className="button button-secondary" type="button" key={role} disabled={loading} onClick={event=>view(role,event.currentTarget)}>View {role==='itemPhotoUploadId'?'item photo':role==='surfacePhotoUploadId'?'surface photo':role.startsWith('itemPhoto-')?`item photo ${Number(role.split('-')[1])+1}`:role.startsWith('artwork-')?`artwork ${Number(role.split('-')[1])+1}`:'engraving artwork'}</button>)}</div>{error&&<p role="alert">{error}</p>}{file?.ownerScope===ownerScope&&<ImageDialog {...file} onClose={()=>setFile(null)}/>}</div>;
}
