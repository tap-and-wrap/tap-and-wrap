import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { privateQueryKey } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import ImageSourceChooser from '../components/ImageSourceChooser.jsx';
import { prepareSelectedImages } from '../components/selected-images.mjs';
import { commerceGet, commercePost, commerceError, uploadPrivateFile, money } from './api.js';
import { persistCheckoutSession } from './checkout-session.js';
import { CopyPayment } from './OrderFinancials.jsx';

export default function CheckoutInstaPay({ owner, checkoutOwner, checkoutKey, governorate, discountCode, quote, onChange, disabled }) {
  const [files, setFiles] = useState([]), [preview, setPreview] = useState(''), [senderName, setSenderName] = useState(''), [fileError, setFileError] = useState(''), [expired, setExpired] = useState(false);
  const uploaded = useRef(null), pending = useRef(null), mounted = useRef(true), generation = useRef(authGeneration());
  const status = useQuery({ queryKey: privateQueryKey(owner, 'checkout-payment', checkoutKey), queryFn: ({signal}) => commerceGet(`/checkout/payments/${checkoutKey}`, undefined, signal), retry: false, staleTime: 0, gcTime: 0 });
  const zeroDue = !quote.error && !quote.isFetching && quote.data?.totals?.totalPiastres === 0;
  const prepared = useQuery({ queryKey: privateQueryKey(owner, 'checkout-payment-prepare', checkoutKey, quote.data?.fingerprint),
    queryFn: ({signal}) => commercePost('/checkout/payments', { checkoutKey, governorate, paymentMethod: 'instapay', ...(discountCode ? {discountCode} : {}) }, {signal}),
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
    return commercePost(`/checkout/payments/${checkoutKey}/proof`, { uploadId:uploaded.current.id, senderName:senderName.trim() }, {signal:controller.signal});
  }, onSuccess: result => { if (mounted.current && generation.current === authGeneration()) { setSaved({...payment,...result.payment}); setFiles([]); uploaded.current=null; } },
    onError: async () => {
      if (!mounted.current || generation.current !== authGeneration()) return;
      // An acknowledgement may have been lost after the server retained proof.
      // Recover that record before offering any further upload or submission.
      const result = await status.refetch();
      if (mounted.current && generation.current === authGeneration() && result.data?.payment?.proofReceived) { setSaved({...payment,...result.data.payment}); setFiles([]); uploaded.current=null; }
    } });
  useEffect(() => {
    onChange(payment ? { ...payment, ready: Boolean(actionable && payment.proofReceived && !save.isPending), busy: prepared.isFetching || save.isPending } : zeroDue ? {ready:true,noTransferDue:true} : prepared.isFetching ? {busy:true} : null);
    if (payment) persistCheckoutSession(checkoutOwner);
  }, [payment, actionable, save.isPending, prepared.isFetching, onChange, checkoutOwner, zeroDue]);
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
    {payment && <><p>Payment reference: <bdi>{payment.reference}</bdi></p>
      {!actionable ? <p role="alert">This payment reference requires review. Keep it for support; do not transfer again or start a replacement order. <Link to="/contact">Contact the store</Link>.</p> : <>
        {!payment.proofReceived && payment.destination && <><dl><div><dt>InstaPay recipient</dt><dd><bdi>{payment.destination}</bdi></dd></div><div><dt>Exact transfer amount</dt><dd>{money(payment.amountPiastres)}</dd></div></dl><CopyPayment destination={payment.destination} amountPiastres={payment.amountPiastres}/></>}
        {payment.proofReceived ? <p role="status">Your payment evidence is saved. Place your order below. Payment remains subject to owner verification; do not transfer again.</p> : <fieldset disabled={disabled || save.isPending}>
          <label className="commerce-field">Transfer sender name<input value={senderName} minLength={2} maxLength={100} onChange={event=>setSenderName(event.target.value)} autoComplete="name"/></label>
          <div className="checkout-proof-drop" onDragOver={event=>event.preventDefault()} onDrop={drop}><ImageSourceChooser uploadArea label={files.length ? 'Replace transaction screenshot' : 'Choose transaction screenshot'} inputLabel="Transaction screenshot" context="InstaPay" maxFiles={1} maxBytes={5*1024*1024} onSelect={setFiles} onError={setFileError} helperText="JPEG, PNG or WebP, up to 5 MB"/>
          {preview && <div className="checkout-proof-preview"><img src={preview} alt="Selected transaction screenshot"/><button className="commerce-link-button" type="button" onClick={()=>setFiles([])}>Remove screenshot</button></div>}</div>
          {fileError && <p role="alert">{fileError}</p>}<p>Payment is confirmed only after the owner reconciles the receiving account. Never repeat a transfer because an upload or submission failed.</p>
          <button className="button button-secondary" type="button" disabled={!files.length || senderName.trim().length<2 || save.isPending} onClick={()=>save.mutate()}>{save.isPending ? 'Saving payment evidence...' : 'Save payment proof'}</button>
          {save.error && <p role="alert">{commerceError(save.error)} Your payment reference remains saved; do not transfer again.</p>}
        </fieldset>}
      </>}
    </>}
  </section>;
}
