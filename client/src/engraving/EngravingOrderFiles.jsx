import { useEffect, useState } from 'react';
import { api, authGeneration, assertAuthGeneration } from '../services/api.js';
import { commerceGet, commerceError } from '../commerce/api.js';
import CatalogDialog from '../components/CatalogDialog.jsx';
function ImageDialog({ blob, title, onClose }) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const value=URL.createObjectURL(blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[blob]);
  return <CatalogDialog title={title} onClose={onClose}><img src={url} alt={title} style={{width:'100%',maxHeight:'70vh',objectFit:'contain'}}/></CatalogDialog>;
}
export default function EngravingOrderFiles({ orderId, engraving }) {
  const [file,setFile]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function view(role){
    const generation=authGeneration();setLoading(true);setError('');
    try{
      const metadata=await commerceGet(`/orders/${orderId}/engraving-files`),item=metadata.items.find(value=>value.itemKey===engraving.itemKey);
      const id=item?.[role];if(!id)throw Error('This private image is unavailable. Contact the store about this order.');
      assertAuthGeneration(generation);
      const result=await api.get(`/commerce/uploads/${id}/content`,{responseType:'blob',timeout:15000});
      if(generation===authGeneration())setFile({blob:result.data,title:role==='itemPhotoUploadId'?'Your physical item':role==='surfacePhotoUploadId'?'Engraving surface':'Your private engraving artwork'});
    }catch(caught){if(generation===authGeneration())setError(commerceError(caught));}
    finally{if(generation===authGeneration())setLoading(false);}
  }
  return <div><div className="button-group">{(engraving.fileRoles||['itemPhotoUploadId']).map(role=><button className="button button-secondary" type="button" key={role} disabled={loading} onClick={()=>view(role)}>View {role==='itemPhotoUploadId'?'item photo':role==='surfacePhotoUploadId'?'surface photo':'engraving artwork'}</button>)}</div>{error&&<p role="alert">{error}</p>}{file&&<ImageDialog {...file} onClose={()=>setFile(null)}/>}</div>;
}
