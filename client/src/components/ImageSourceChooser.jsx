import { useEffect, useRef, useState } from 'react';
import { authGeneration } from '../services/api.js';
import { IMAGE_TYPES, ImageSelectionError, prepareSelectedImages } from './selected-images.mjs';
import './image-source.css';
import { ImagePlus } from 'lucide-react';
import { LoadingSpinner } from './LoadingState.jsx';

export { IMAGE_FORMAT_HELP } from './selected-images.mjs';
export default function ImageSourceChooser({ label = 'Upload Image', context, multiple = false, disabled = false, onSelect, describedBy, invalid = false, maxBytes = 10 * 1024 * 1024, maxFiles = multiple ? 48 : 1, maxTotalBytes, acceptedTypes = IMAGE_TYPES, onError, onStateChange, inputLabel, uploadArea = false, helperText }) {
  const [preparing,setPreparing] = useState(false), [error,setError] = useState(''), [ready,setReady] = useState('');
  const inputRef = useRef(null), pending = useRef(null), active = useRef(false), pickerGeneration = useRef(null);
  useEffect(() => { active.current = true;return () => { active.current = false;pending.current?.abort(); }; }, []);
  useEffect(()=>{
    // Native file cancel bubbles; it must not dismiss an enclosing form dialog.
    const cancel=event=>{event.stopPropagation();if(!pending.current) pickerGeneration.current=null;};
    const node=inputRef.current;node.addEventListener('cancel',cancel);
    return()=>node.removeEventListener('cancel',cancel);
  },[]);
  useEffect(() => {
    const form = inputRef.current?.closest('form');
    const guard = event => { if ((preparing || error) && inputRef.current?.parentElement?.getClientRects().length) { event.preventDefault(); event.stopImmediatePropagation(); inputRef.current?.previousElementSibling?.focus(); } };
    form?.addEventListener('submit', guard, true);
    onStateChange?.(preparing ? 'checking' : error ? 'invalid' : ready ? 'ready' : 'idle');
    return () => form?.removeEventListener('submit', guard, true);
  }, [preparing, error, ready, onStateChange]);
  function reportError(message) {setError(message);onError?.(message);}
  function choose() {
    if (pending.current || disabled) return;
    reportError('');pickerGeneration.current = authGeneration();
    const input = inputRef.current;input.value = ''; // Previous files are copied or cancelled.
    try { input.click(); } catch { reportError('The file picker could not open. Try again.'); }
    // Open synchronously within the user gesture; keep the input alive while copying bytes.
  }
  async function select(event) {
    const input = event.currentTarget, files = Array.from(input.files || []);
    if (!files.length) { pickerGeneration.current = null;return; }
    if (pending.current || disabled) return;
    const operation = new AbortController(), generation = pickerGeneration.current ?? authGeneration();
    pending.current = operation;setPreparing(true);setReady('');reportError('');
    try {
      const owned = await prepareSelectedImages(files, { maxBytes, maxFiles, maxTotalBytes, acceptedTypes, signal: operation.signal });
      if (!active.current || operation.signal.aborted || generation !== authGeneration()) return;
      const outcome = await onSelect(owned);
      if (outcome?.error) throw new ImageSelectionError(outcome.error);
      if (active.current && !operation.signal.aborted && generation === authGeneration()) setReady(`${owned.length === 1 ? owned[0].name : `${owned.length} images`} · Ready to upload`);
    } catch (caught) {
      if (active.current && !operation.signal.aborted && generation === authGeneration()) reportError(caught instanceof ImageSelectionError ? caught.message : 'This image could not be read. Choose it again from Gallery or Browse Files.');
    } finally {
      input.value = '';pending.current = null;pickerGeneration.current = null;
      if (active.current) { setPreparing(false); }
    }
  }
  return <div className="image-source-chooser" data-image-state={preparing ? 'checking' : error ? 'invalid' : ready ? 'ready' : 'idle'}>
    <button type="button" className={`image-upload-button button button-secondary${uploadArea ? ' image-upload-area' : ''}`} aria-label={context ? `${context}: ${label}` : uploadArea ? label : undefined} aria-describedby={describedBy} aria-invalid={invalid || Boolean(error) || undefined} disabled={disabled || preparing} onClick={choose}>{uploadArea && <ImagePlus size={26} aria-hidden="true"/>}<span>{preparing ? <LoadingSpinner label="Preparing image"/> : label}{uploadArea && helperText && <small>{helperText}</small>}</span></button>
    {/* WAM home-reference pattern: no accept/capture hint restricting Android's native actions.
        Signature, size and decode validation still run before any selection is delivered. */}
    <input ref={inputRef} type="file" hidden tabIndex={-1} aria-hidden="true" aria-label={inputLabel} multiple={multiple} disabled={disabled} onChange={select} />
    {!(error && onError) && <p className={error ? 'image-source-error' : 'image-source-status'} role={error ? 'alert' : 'status'}>{preparing ? 'Checking image…' : error || ready}</p>}
    {error && <button type="button" className="commerce-link-button" disabled={disabled} onClick={() => { reportError(''); setReady(''); }}>Discard invalid selection</button>}
  </div>;
}
