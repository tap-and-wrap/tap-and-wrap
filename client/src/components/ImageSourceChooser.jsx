import { useEffect, useRef, useState } from 'react';
import { authGeneration } from '../services/api.js';
import { IMAGE_TYPES, ImageSelectionError, prepareSelectedImages } from './selected-images.mjs';
import './image-source.css';

export { IMAGE_FORMAT_HELP } from './selected-images.mjs';
export default function ImageSourceChooser({ label = 'Upload Image', context, multiple = false, disabled = false, onSelect, describedBy, invalid = false, maxBytes = 10 * 1024 * 1024, maxFiles = multiple ? 48 : 1, maxTotalBytes, acceptedTypes = IMAGE_TYPES, onError, inputLabel }) {
  const [preparing,setPreparing] = useState(false), [error,setError] = useState('');
  const inputRef = useRef(null), pending = useRef(null), active = useRef(false), pickerGeneration = useRef(null);
  useEffect(() => { active.current = true;return () => { active.current = false;pending.current?.abort(); }; }, []);
  useEffect(()=>{
    // Native file cancel bubbles; it must not dismiss an enclosing form dialog.
    const cancel=event=>{event.stopPropagation();if(!pending.current) pickerGeneration.current=null;};
    const node=inputRef.current;node.addEventListener('cancel',cancel);
    return()=>node.removeEventListener('cancel',cancel);
  },[]);
  function reportError(message) {setError(onError?'':message);onError?.(message);}
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
    pending.current = operation;setPreparing(true);reportError('');
    try {
      const owned = await prepareSelectedImages(files, { maxBytes, maxFiles, maxTotalBytes, acceptedTypes, signal: operation.signal });
      if (!active.current || operation.signal.aborted || generation !== authGeneration()) return;
      await onSelect(owned);
    } catch (caught) {
      if (active.current && !operation.signal.aborted && generation === authGeneration()) reportError(caught instanceof ImageSelectionError ? caught.message : 'This image could not be read. Choose it again from Gallery or Browse Files.');
    } finally {
      input.value = '';pending.current = null;pickerGeneration.current = null;
      if (active.current) { setPreparing(false); }
    }
  }
  return <>
    <button type="button" className="image-upload-button button button-secondary" aria-label={context ? `${context}: ${label}` : undefined} aria-describedby={describedBy} aria-invalid={invalid || Boolean(error) || undefined} disabled={disabled || preparing} onClick={choose}>{preparing ? 'Preparing image...' : label}</button>
    {/* WAM home-reference pattern: no accept/capture hint restricting Android's native actions.
        Signature, size and decode validation still run before any selection is delivered. */}
    <input ref={inputRef} type="file" hidden tabIndex={-1} aria-hidden="true" aria-label={inputLabel} multiple={multiple} disabled={disabled} onChange={select} />
    {error && <p className="image-source-error" role="alert">{error}</p>}
  </>;
}
