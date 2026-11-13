import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import { adminCommerceGet, commerceError, money, getPrivateAdminFile } from '../commerce/api.js';
import { PrivateFileDialog } from '../pages/AdminOrderPage.jsx';

export default function CheckoutPaymentRecovery() {
  const session = useSession(), mounted = useRef(true);
  const [open, setOpen] = useState(false), [reference, setReference] = useState(''), [search, setSearch] = useState(''), [file, setFile] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const query = useQuery({ queryKey: privateQueryKey(session.ownerKey,'checkout-recovery',search), queryFn:({signal})=>adminCommerceGet('/checkout-payments', search ? {reference:search} : undefined,signal), enabled:open,retry:false,gcTime:0 });
  async function view(payment, returnFocus) {
    const generation = authGeneration(); setLoading(true); setError('');
    try { const result = await getPrivateAdminFile(`/checkout-payments/${payment.reference}/proof`); if(mounted.current && generation===authGeneration()) setFile({...result,owner:session.ownerKey,label:'Checkout transfer evidence',returnFocus}); }
    catch(error) {if(mounted.current && generation===authGeneration())setError(commerceError(error));}
    finally{if(mounted.current && generation===authGeneration())setLoading(false);}
  }
  return <section className="admin-panel"><h2><button className="admin-text-button" type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Checkout payment recovery</button></h2>{open && <>
    <p>Unaccepted payment references require manual receiving-account reconciliation. Do not request another transfer or record a collection against an unrelated order.</p>
    <form onSubmit={event=>{event.preventDefault();setSearch(reference.trim());}}><label>Payment reference<input value={reference} maxLength={36} onChange={event=>setReference(event.target.value)}/></label><button className="admin-button admin-button-secondary">Find reference</button></form>
    {query.isPending ? <p role="status">Loading payment references...</p> : query.error ? <p role="alert">{commerceError(query.error)}</p> : <ul>{query.data?.payments.map(payment=><li key={payment.reference}><bdi>{payment.reference}</bdi> — {money(payment.amountPiastres)} — {payment.senderName || 'No sender supplied'} — {payment.proofReceived ? 'Evidence awaiting reconciliation' : 'Transfer may be outstanding'} {payment.proofId && <button className="admin-button admin-button-secondary" type="button" disabled={loading} onClick={event=>view(payment,event.currentTarget)}>View proof</button>}</li>)}</ul>}
    <p>Latest 20 references shown. Use the exact reference to find older records.</p>{error && <p role="alert">{error}</p>}
  </>}{file?.owner===session.ownerKey && <PrivateFileDialog file={file} onClose={()=>setFile(null)}/>}</section>;
}
