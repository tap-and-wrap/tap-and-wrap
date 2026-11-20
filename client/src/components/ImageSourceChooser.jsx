import { useEffect, useRef, useState } from 'react';
import { authGeneration } from '../services/api.js';
import { IMAGE_TYPES, ImageSelectionError, prepareSelectedImages } from './selected-images.mjs';
import './image-source.css';
import { ImagePlus } from 'lucide-react';
import { LoadingSpinner } from './LoadingState.jsx';

export { IMAGE_FORMAT_HELP } from './selected-images.mjs';
export default function ImageSourceChooser({ label = 'Upload Image', context, multiple = false, disabled = false, onSelect, describedBy, invalid = false, maxBytes = 10 * 1024 * 1024, maxFiles = multiple ? 48 : 1, maxTotalBytes, acceptedTypes = IMAGE_TYPES, onError, onStateChange, inputLabel, uploadArea = false, helperText }) {
  const [preparing,setPreparing] = useState(false), [error,setError] = useState(''), [ready,setReady] = useState('');
  const inputRef = useRef(null), buttonRef = useRef(null), pending = useRef(null), active = useRef(false), pickerGeneration = useRef(null);
  useEffect(() => { active.current = true;return () => { active.current = false;pending.current?.abort(); }; }, []);
  useEffect(()=>{
    // Native file cancel bubbles; it must not dismiss an enclosing form dialog.
    const cancel=event=>{ event.stopPropagation(); if (!pending.current) pickerGeneration.current = null; };
    const node=inputRef.current;node.addEventListener('cancel',cancel);
    return()=>node.removeEventListener('cancel',cancel);
  },[]);
  useEffect(() => {
    const form = inputRef.current?.closest('form');
    // Rejected replacement files never become selected files. Do not block a
    // separate valid form draft merely because the last picker attempt failed.
    const guard = event => { if (preparing && inputRef.current?.parentElement?.getClientRects().length) { event.preventDefault(); event.stopImmediatePropagation(); inputRef.current?.previousElementSibling?.focus(); } };
    form?.addEventListener('submit', guard, true);
    onStateChange?.(preparing ? 'checking' : error ? 'invalid' : ready ? 'ready' : 'idle');
    return () => form?.removeEventListener('submit', guard, true);
  }, [preparing, error, ready, onStateChange]);
  function reportError(message) {setError(message);onError?.(message);}
  function choose() {
    if (pending.current || disabled) return;
    // Do not set React state before opening the native picker: mobile WebView
    // layout can be invalidated while the OS picker owns the viewport.
    pickerGeneration.current = authGeneration();
    const input = inputRef.current;input.value = ''; // Previous files are copied or cancelled.
    try { input.click(); } catch { reportError('The file picker could not open. Try again.'); }
    // Open synchronously within the user gesture; keep the input alive while copying bytes.
  }
  async function select(event) {
    const input = event.currentTarget, files = Array.from(input.files || []);
    if (!files.length) { pickerGeneration.current = null; return; }
    if (pending.current || disabled) return;
    const operation = new AbortController(), generation = pickerGeneration.current ?? authGeneration();
    pending.current = operation;setPreparing(true);setReady('');reportError('');
    try {
      const owned = await prepareSelectedImages(files, { maxBytes, maxFiles, maxTotalBytes, acceptedTypes, signal: operation.signal });
      if (!active.current || operation.signal.aborted || generation !== authGeneration()) return;
      const outcome = await onSelect(owned);
      if (outcome?.error) throw new ImageSelectionError(outcome.error);
      if (active.current && !operation.signal.aborted && generation === authGeneration()) setReady('selected');
    } catch (caught) {
      // Keep the last valid preview unchanged, but explain the rejected picker
      // attempt. Only our controlled validation messages are shown verbatim.
      // Arbitrary SDK/provider errors must not leak private file information.
      if (active.current && !operation.signal.aborted && generation === authGeneration()) {
        const message = caught instanceof ImageSelectionError
          ? caught.message : 'This image could not be prepared. Choose it again or use another file.';
        setReady(''); reportError(message);
      }
    } finally {
      input.value = '';pending.current = null;pickerGeneration.current = null;
      if (active.current) { setPreparing(false); }
    }
  }
  return <div className="image-source-chooser" data-image-state={preparing ? 'checking' : error ? 'invalid' : ready ? 'ready' : 'idle'}>
    <button ref={buttonRef} type="button" className={`image-upload-button button button-secondary${uploadArea ? ' image-upload-area' : ''}`} aria-label={context ? `${context}: ${label}` : uploadArea ? label : undefined} aria-describedby={describedBy} aria-invalid={invalid || Boolean(error) || undefined} disabled={disabled || preparing} onClick={choose}>{uploadArea && <ImagePlus size={26} aria-hidden="true"/>}<span>{preparing ? <LoadingSpinner label="Preparing image"/> : label}{uploadArea && helperText && <small>{helperText}</small>}</span></button>
    {/* WAM home-reference pattern: no accept/capture hint restricting Android's native actions.
        Signature, size and decode validation still run before any selection is delivered. */}
    <input ref={inputRef} type="file" hidden tabIndex={-1} aria-hidden="true" aria-label={inputLabel} multiple={multiple} disabled={disabled} onChange={select} />
    {!(error && onError) && <p className={error ? 'image-source-error' : 'image-source-status'} role={error ? 'alert' : 'status'}>{preparing ? 'Checking image…' : error}</p>}
  </div>;
}
