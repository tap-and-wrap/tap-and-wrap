import ConfirmationDialog from '../components/ConfirmationDialog.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { privateQueryKey } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import ImageSourceChooser from '../components/ImageSourceChooser.jsx';
import { prepareSelectedImages } from '../components/selected-images.mjs';
import { commerceGet, commercePost, commerceError, uploadPrivateFile, money } from './api.js';
import LoadingState, { LoadingSpinner } from '../components/LoadingState.jsx';
import { persistCheckoutSession } from './checkout-session.js';
import { Copy, Check } from 'lucide-react';

export default function CheckoutInstaPay({ owner, checkoutOwner, checkoutKey, governorate, discountCode, quote, onChange, recovery, onRestart, onCheckStatus, disabled, active = true }) {
  const [files, setFiles] = useState([]), [preview, setPreview] = useState(''), [senderName, setSenderName] = useState(''), [fileError, setFileError] = useState(''), [expired, setExpired] = useState(false);
  const senderId = useId();
  const [restartTarget, setRestartTarget] = useState(null), [restartError, setRestartError] = useState(''), [cancelling, setCancelling] = useState(false);

  const uploaded = useRef(null), pending = useRef(null), mounted = useRef(true), generation = useRef(authGeneration());
  const [imageState, setImageState] = useState('idle');
  // active is set only by an intentional method selection or owned recovery.
  const transferRequested = active;
  const zeroDue = !quote.error && !quote.isFetching && quote.data?.totals?.totalPiastres === 0;
  const prepared = useQuery({ queryKey: privateQueryKey(owner, 'checkout-payment-prepare', checkoutKey, quote.data?.fingerprint),
    queryFn: ({signal}) => commercePost('/checkout/payments', { checkoutKey, ...(governorate ? {governorate} : {}), paymentMethod: 'instapay', ...(discountCode ? {discountCode} : {}) }, {signal}),
    enabled: active && transferRequested && !disabled && !quote.data?.payment && !zeroDue && Boolean(quote.data?.fingerprint) && !quote.error && !quote.isFetching, retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false });
  const code = (quote.error || prepared.error)?.response?.data?.error?.code;
  // The initial recovery read may predate instructions issued in this mount.
  // Recheck the owned record after a changed quote; never infer cancellation eligibility.
  useEffect(() => { if (code === 'CHECKOUT_PAYMENT_CHANGED') void onCheckStatus(); }, [code, onCheckStatus]);
  const canRestart = code === 'CHECKOUT_PAYMENT_CHANGED' && recovery?.canCancel === true && recovery?.state === 'open' && !recovery.payment?.proofReceived;
  async function confirmRestart() {
    setCancelling(true); setRestartError('');
    try { await onRestart(); }
    catch (error) { if (mounted.current) { setRestartError(`${commerceError(error)} Your original checkout is retained. Retry this confirmation or contact us; do not transfer again.`); setCancelling(false); } }
  }
  const [saved, setSaved] = useState(null);
  useEffect(() => { if (prepared.data?.payment) setSaved(prepared.data.payment); }, [prepared.data]);
  const current = quote.data?.payment || prepared.data?.payment;
  const payment = saved?.reference === current?.reference ? saved : current;
  const fingerprintMatches = Boolean(quote.data?.fingerprint) && !quote.error && !quote.isFetching && (Boolean(quote.data?.payment) || prepared.isSuccess && !prepared.isFetching && !prepared.error);
  const actionable = active && payment && !expired && fingerprintMatches && ['prepared','proof_received'].includes(payment.state);
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
    if (!files[0] || senderName.trim().length < 2 || !actionable) throw Error('Enter the sender name and choose one transaction screenshot.');
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
      const result = await commerceGet(`/checkout/payments/${checkoutKey}`).catch(() => null);
      if (mounted.current && generation.current === authGeneration() && result?.payment?.proofReceived) { setSaved({...payment,...result.payment}); setFiles([]); uploaded.current=null; }
    } });
  useEffect(() => {
    onChange(payment ? { ...payment, ready: Boolean(actionable && (payment.proofReceived || files.length && senderName.trim().length >= 2) && !save.isPending && !['checking','invalid'].includes(imageState) && !fileError), ensureProof: payment.proofReceived ? undefined : save.mutateAsync, busy: prepared.isFetching || save.isPending } : zeroDue ? {ready:true,noTransferDue:true} : prepared.isFetching ? {busy:true} : null);
    if (payment) persistCheckoutSession(checkoutOwner);
  }, [payment, actionable, save.isPending, prepared.isFetching, onChange, checkoutOwner, zeroDue, files.length, senderName, imageState, fileError, save.mutateAsync]);
  async function drop(event) {
    event.preventDefault(); if (disabled || save.isPending || payment?.proofReceived) return;
    const generation = authGeneration(); setImageState('checking'); setFileError('');
    try { const selected = await prepareSelectedImages([...event.dataTransfer.files], {maxFiles:1,maxBytes:5*1024*1024}); if (generation === authGeneration()) {setFiles(selected);setFileError('');setImageState('ready');} }
    catch(error) { if (generation === authGeneration()) {setFileError(error.message);setImageState('invalid');} }
  }
  return <section className="checkout-instapay" aria-label="InstaPay transfer details">
    {zeroDue ? <p>No transfer is due for this order.</p> : <>
      {!canRestart && (payment || transferRequested) && <p>Upload your transfer screenshot to complete your order.</p>}
      {payment?.revalidated && <p role="status">Your existing transfer details are ready. Upload your transfer screenshot below.</p>}
      {expired && !quote.error && <button type="button" className="button button-secondary" disabled={quote.isFetching || disabled} onClick={()=>quote.refetch()}>Check existing transfer reference</button>}
      {canRestart ? <div className="checkout-payment-update" role="alert"><p>Your cart total has changed.</p><button type="button" className="button button-secondary" disabled={disabled} onClick={event=>setRestartTarget(event.currentTarget)}>Update payment details</button><p><Link to="/contact">Already transferred? Contact us</Link></p></div> : quote.error || prepared.error || expired ? <div role="alert"><p>{code === 'CHECKOUT_REFERENCE_LIMIT' ? 'Your earlier transfer references need checking before another can be issued.' : code === 'CHECKOUT_USED' ? 'This checkout was already submitted. Check your order status before starting another order.' : code === 'CHECKOUT_QUOTE_SUPERSEDED' ? 'A newer checkout choice is saved. Refresh your total before continuing.' : code === 'CHECKOUT_PAYMENT_CHANGED' ? 'Your cart changed after transfer instructions were issued. Contact us to check the existing transfer.' : code === 'CHECKOUT_PAYMENT_REVIEW_REQUIRED' ? 'This payment reference requires review. Contact us to check your transfer.' : (quote.error || prepared.error)?.response?.status === 429 ? 'Please wait a moment, then check your payment details again.' : 'We could not load your transfer details. Retry before making a transfer.'}</p>{['CHECKOUT_USED','CHECKOUT_QUOTE_SUPERSEDED'].includes(code) && <button type="button" onClick={()=>code === 'CHECKOUT_USED' ? onCheckStatus() : quote.refetch()}>Check checkout status</button>}{!code && !expired && <button type="button" className="button button-secondary" disabled={prepared.isFetching || quote.isFetching} onClick={()=>quote.error ? quote.refetch() : prepared.refetch()}>Retry payment details</button>}<Link to="/contact">Contact Us</Link></div> : null}
      {!canRestart && (transferRequested || payment || quote.error) && (actionable && !payment.proofReceived && payment.destination ? <div className="checkout-transfer-card"><span>TRANSFER TO</span><div><strong><bdi>{payment.destination}</bdi></strong><CopyValue value={payment.destination} label="Copy transfer destination" text="Copy"/></div><div className="checkout-transfer-amount"><span>Exact amount to transfer</span><CopyValue value={(payment.amountPiastres / 100).toFixed(2)} label="Copy transfer amount" text={money(payment.amountPiastres)} preserveText/></div></div>
        : payment?.proofReceived ? <p role="status">Your screenshot is saved. Place your order below.</p> : <div className="checkout-transfer-placeholder"><span>TRANSFER TO</span>{quote.error || prepared.error || expired ? <p>Transfer details unavailable.</p> : <LoadingState label="Verifying transfer details. Please wait before transferring." count={1}/>}</div>)}
      {actionable && !payment?.proofReceived && payment.destination && <fieldset disabled={!active || disabled || save.isPending}>
        <label className="commerce-field" htmlFor={senderId}>Transfer sender name *<input id={senderId} name="senderName" value={senderName} required={active} minLength={2} maxLength={100} onChange={event=>setSenderName(event.target.value)} autoComplete="name"/></label>
        <p className="checkout-proof-label">Transaction Screenshot *</p><div className="checkout-proof-drop" onDragOver={event=>event.preventDefault()} onDrop={drop}><ImageSourceChooser uploadArea label={files.length ? 'Replace transaction screenshot' : 'Choose screenshot'} inputLabel="Transaction screenshot" context="InstaPay" maxFiles={1} maxBytes={5*1024*1024} onSelect={selected => {setFiles(selected);setFileError('');}} onError={setFileError} onStateChange={setImageState} helperText="JPEG, PNG or WebP, up to 5 MB."/>
          {preview && <div className="checkout-proof-preview"><img src={preview} alt="Selected transaction screenshot"/><button className="commerce-link-button" type="button" onClick={()=>setFiles([])}>Remove screenshot</button></div>}</div>
        {fileError && <p role="alert">{fileError}</p>}{save.isPending && <LoadingSpinner label="Saving screenshot"/>}
        {save.error && <p role="alert">{commerceError(save.error)} Please don&apos;t transfer again.</p>}
      </fieldset>}
    </>}
    {restartTarget && <ConfirmationDialog title="Have you already made an InstaPay transfer for this checkout?" description="Only continue if you have not transferred any money. If you have transferred, cancel and contact us." returnFocus={restartTarget} onCancel={()=>{setRestartTarget(null);setRestartError('');}} onConfirm={confirmRestart} confirmLabel="No, I haven't transferred" cancelLabel="Cancel" pending={cancelling} error={restartError}/>}
  </section>;
}

function CopyValue({ value, label, text, preserveText }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  return <span><button type="button" aria-label={label} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); } catch { setError(true); } }}>{copied ? <Check size={18}/> : <Copy size={18}/>} {text && <span>{copied && !preserveText ? 'Copied' : text}</span>}</button><span className="sr-only" role="status">{copied ? 'Copied' : error ? 'Copy unavailable. Select and copy the displayed value.' : ''}</span></span>;
}
