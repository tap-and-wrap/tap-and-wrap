import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { privateQueryKey } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import ImageSourceChooser from '../components/ImageSourceChooser.jsx';
import { prepareSelectedImages } from '../components/selected-images.mjs';
import { commerceGet, commercePost, commerceError, uploadPrivateFile, money } from './api.js';
import { persistCheckoutSession } from './checkout-session.js';
import { Copy, Check } from 'lucide-react';

export default function CheckoutInstaPay({ owner, checkoutOwner, checkoutKey, governorate, discountCode, quote, onChange, disabled }) {
  const [files, setFiles] = useState([]), [preview, setPreview] = useState(''), [senderName, setSenderName] = useState(''), [fileError, setFileError] = useState(''), [expired, setExpired] = useState(false);
  const uploaded = useRef(null), pending = useRef(null), mounted = useRef(true), generation = useRef(authGeneration());
  const status = useQuery({ queryKey: privateQueryKey(owner, 'checkout-payment', checkoutKey), queryFn: ({signal}) => commerceGet(`/checkout/payments/${checkoutKey}`, undefined, signal), retry: false, staleTime: 0, gcTime: 0 });
  const zeroDue = !quote.error && !quote.isFetching && quote.data?.totals?.totalPiastres === 0;
  const prepared = useQuery({ queryKey: privateQueryKey(owner, 'checkout-payment-prepare', checkoutKey, quote.data?.fingerprint),
    queryFn: ({signal}) => commercePost('/checkout/payments', { checkoutKey, ...(governorate ? {governorate} : {}), paymentMethod: 'instapay', ...(discountCode ? {discountCode} : {}) }, {signal}),
    enabled: !disabled && !zeroDue && Boolean(quote.data?.fingerprint) && !quote.error && !quote.isFetching, retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false });
  const [saved, setSaved] = useState(null);
  useEffect(() => { if (prepared.data?.payment) setSaved(prepared.data.payment); }, [prepared.data]);
  const payment = saved || prepared.data?.payment || status.data?.payment;
  const fingerprintMatches = Boolean(quote.data?.fingerprint) && !quote.error && !quote.isFetching && prepared.isSuccess && !prepared.isFetching && !prepared.error;
  const actionable = payment && !expired && fingerprintMatches && ['prepared','proof_received'].includes(payment.state);
  useEffect(() => {
    if (!payment) return;
    const remaining = new Date(payment.expiresAt).getTime() - Date.now();
    setExpired(remaining <= 0);
    const timer = setTimeout(() => setExpired(true), Math.max(0, Math.min(remaining, 2147483647)));
    return () => clearTimeout(timer);
  }, [payment]);
  useEffect(() => {
    if (!files[0]) { setPreview(''); return; }
    const url = URL.createObjectURL(files[0]); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);
  const save = useMutation({ mutationFn: async () => {
    if (!files[0] || senderName.trim().length < 2 || !actionable) throw Error('Enter the sender name and choose one transaction screenshot. Do not transfer again.');
    const generation = authGeneration(), controller = new AbortController(); pending.current = controller;
    if (uploaded.current?.file !== files[0]) uploaded.current = { file: files[0], id: await uploadPrivateFile(files[0], { purpose:'payment_proof', checkoutKey, generation, signal:controller.signal }) };
    try { return await commercePost(`/checkout/payments/${checkoutKey}/proof`, { uploadId:uploaded.current.id, senderName:senderName.trim() }, {signal:controller.signal}); }
    catch (error) {
      // Resolve a lost acknowledgement using this exact owner-bound reference.
      const recovered = await commerceGet(`/checkout/payments/${checkoutKey}`, undefined, controller.signal);
      if (recovered.payment?.proofReceived) return recovered;
      throw error;
    }
  }, onSuccess: result => { if (mounted.current && generation.current === authGeneration()) { setSaved({...payment,...result.payment}); setFiles([]); uploaded.current=null; } },
    onError: async () => {
      if (!mounted.current || generation.current !== authGeneration()) return;
      // An acknowledgement may have been lost after the server retained proof.
      // Recover that record before offering any further upload or submission.
      const result = await status.refetch();
      if (mounted.current && generation.current === authGeneration() && result.data?.payment?.proofReceived) { setSaved({...payment,...result.data.payment}); setFiles([]); uploaded.current=null; }
    } });
  useEffect(() => {
    onChange(payment ? { ...payment, ready: Boolean(actionable && (payment.proofReceived || files.length && senderName.trim().length >= 2) && !save.isPending), ensureProof: payment.proofReceived ? undefined : save.mutateAsync, busy: prepared.isFetching || save.isPending } : zeroDue ? {ready:true,noTransferDue:true} : prepared.isFetching ? {busy:true} : null);
    if (payment) persistCheckoutSession(checkoutOwner);
  }, [payment, actionable, save.isPending, prepared.isFetching, onChange, checkoutOwner, zeroDue, files.length, senderName, save.mutateAsync]);
  async function drop(event) {
    event.preventDefault(); if (disabled || save.isPending || payment?.proofReceived) return;
    const generation = authGeneration();
    try { const selected = await prepareSelectedImages([...event.dataTransfer.files], {maxFiles:1,maxBytes:5*1024*1024}); if (generation === authGeneration()) {setFiles(selected);setFileError('');} }
    catch(error) { if (generation === authGeneration()) setFileError(error.message); }
  }
  return <section className="checkout-instapay" aria-label="InstaPay transfer details">
    {zeroDue && <p>No transfer is due for this order.</p>}
    {(prepared.isFetching || status.isPending) && <p role="status">Preparing your secure payment reference...</p>}
    {(prepared.error || quote.error) && <p role="alert">{commerceError(prepared.error || quote.error)} Do not transfer again. <Link to="/contact">Contact the store</Link>.</p>}
    {payment && <><p className="checkout-transfer-instructions">Transfer the exact merchandise and services total below, then choose your screenshot. Delivery is confirmed separately.</p>
      {!actionable ? quote.isFetching || prepared.isFetching ? <p role="status">Checking the current transfer details. Please wait before transferring.</p> : <p role="alert">This payment reference requires review. Keep it for support; do not transfer again or start a replacement order. <Link to="/contact">Contact the store</Link>.</p> : <>
        {!payment.proofReceived && payment.destination && <div className="checkout-transfer-card"><span>TRANSFER TO</span><div><strong><bdi>{payment.destination}</bdi></strong><CopyValue value={payment.destination} label="Copy transfer destination" text="Copy"/></div><div className="checkout-transfer-amount"><span>Exact amount to transfer</span><CopyValue value={(payment.amountPiastres / 100).toFixed(2)} label="Copy transfer amount" text={money(payment.amountPiastres)} preserveText/></div></div>}

        {payment.proofReceived ? <p role="status">Your payment evidence is saved. Place your order below. Payment remains subject to owner verification; do not transfer again.</p> : <fieldset disabled={disabled || save.isPending}>
          <label className="commerce-field">Transfer sender name<input value={senderName} minLength={2} maxLength={100} onChange={event=>setSenderName(event.target.value)} autoComplete="name"/></label>
          <p className="checkout-proof-label">Transaction Screenshot</p><div className="checkout-proof-drop" onDragOver={event=>event.preventDefault()} onDrop={drop}><ImageSourceChooser uploadArea label={files.length ? 'Replace transaction screenshot' : 'Choose screenshot'} inputLabel="Transaction screenshot" context="InstaPay" maxFiles={1} maxBytes={5*1024*1024} onSelect={selected => {setFiles(selected);setFileError('');}} onError={setFileError} helperText="Upload a clear screenshot of the successful transfer. JPEG, PNG or WebP, up to 5 MB. You can also drag and drop it here."/>
          {preview && <div className="checkout-proof-preview"><img src={preview} alt="Selected transaction screenshot"/><button className="commerce-link-button" type="button" onClick={()=>setFiles([])}>Remove screenshot</button></div>}</div>
          {fileError && <p role="alert">{fileError}</p>}<p>Payment awaits owner verification. Do not transfer again if uploading or submitting fails.</p>
          <p role="status">{save.isPending ? 'Saving payment evidence...' : files.length ? 'Screenshot selected. Place Order saves it securely.' : 'Choose a screenshot to place your order.'}</p>
          {save.error && <p role="alert">{commerceError(save.error)} Your payment reference remains saved; do not transfer again.</p>}
        </fieldset>}
      </>}
      <details className="checkout-payment-reference"><summary>Payment reference for support</summary><bdi>{payment.reference}</bdi></details>
    </>}
  </section>;
}

function CopyValue({ value, label, text, preserveText }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  return <span><button type="button" aria-label={label} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); } catch { setError(true); } }}>{copied ? <Check size={18}/> : <Copy size={18}/>} {text && <span>{copied && !preserveText ? 'Copied' : text}</span>}</button><span className="sr-only" role="status">{copied ? 'Copied' : error ? 'Copy unavailable. Select and copy the displayed value.' : ''}</span></span>;
}
