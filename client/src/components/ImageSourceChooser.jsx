import { useEffect, useRef, useState } from 'react';
import { Camera, Images, FolderOpen } from 'lucide-react';
import CatalogDialog from './CatalogDialog.jsx';
import { authGeneration } from '../services/api.js';
import { IMAGE_FORMAT_HELP, IMAGE_TYPES, ImageSelectionError, prepareSelectedImages } from './selected-images.mjs';
import './image-source.css';

export { IMAGE_FORMAT_HELP } from './selected-images.mjs';
export default function ImageSourceChooser({ label = 'Upload Image', context, multiple = false, disabled = false, onSelect, describedBy, invalid = false, maxBytes = 10 * 1024 * 1024, maxFiles = multiple ? 48 : 1, maxTotalBytes, acceptedTypes = IMAGE_TYPES, onError, inputLabel }) {
  const [open,setOpen] = useState(false), [preparing,setPreparing] = useState(false), [error,setError] = useState('');
  const inputs = useRef({}), pending = useRef(null), active = useRef(false), pickerGeneration = useRef(null);
  useEffect(() => { active.current = true;return () => { active.current = false;pending.current?.abort(); }; }, []);
  useEffect(()=>{
    // Native file cancel bubbles; it must not dismiss an enclosing form dialog.
    const cancel=event=>{event.stopPropagation();if(!pending.current){setOpen(false);pickerGeneration.current=null;}};
    const nodes=Object.values(inputs.current);nodes.forEach(node=>node.addEventListener('cancel',cancel));
    return()=>nodes.forEach(node=>node.removeEventListener('cancel',cancel));
  },[]);
  function reportError(message) {setError(onError?'':message);onError?.(message);}
  function close() { pending.current?.abort();setOpen(false); }
  function choose(source) {
    if (pending.current || disabled) return;
    reportError('');pickerGeneration.current = authGeneration();
    const input = inputs.current[source];input.value = ''; // Previous files are copied or cancelled.
    try { input.click(); } catch { reportError('This source could not open. Try Gallery or Browse Files.'); }
    // Keep dialog/input alive; never race the OS picker with history/focus changes.
  }
  async function select(event) {
    const input = event.currentTarget, files = Array.from(input.files || []);
    if (!files.length) { setOpen(false);return; }
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
      if (active.current) { setPreparing(false);setOpen(false); }
    }
  }
  return <>
    <button type="button" className="image-upload-button button button-secondary" aria-label={context ? `${context}: ${label}` : undefined} aria-describedby={describedBy} aria-invalid={invalid || Boolean(error) || undefined} disabled={disabled || preparing} onClick={() => {reportError('');setOpen(true);}}>{preparing ? 'Preparing image…' : label}</button>
    {['gallery','camera','files'].map(source => <input key={source} ref={node => {inputs.current[source] = node;}} type="file" hidden tabIndex={-1} aria-hidden="true" aria-label={source === 'gallery' ? inputLabel : undefined} accept={source === 'files' ? acceptedTypes.join(',')+',.jpg,.jpeg,.png,.webp' : 'image/*'} capture={source === 'camera' ? 'environment' : undefined} multiple={source !== 'camera' && multiple} disabled={disabled} onChange={select} />)}
    {error && <p className="image-source-error" role="alert">{error}</p>}
    {open && <CatalogDialog title="Choose image source" onClose={close} bottomSheet className="image-source-dialog">
      <div className="image-source-body" aria-busy={preparing}>
        {context && <p className="image-source-context">{context}</p>}
        <div className="image-source-options">{[['gallery',Images,'Choose from Gallery','Select photos already on your device'],['camera',Camera,'Take a Photo','Use your camera if available'],['files',FolderOpen,'Browse Files','Choose a compatible image file']].map(([source,Icon,title,description]) => <button key={source} type="button" aria-label={title} disabled={preparing} onClick={() => choose(source)}><Icon aria-hidden="true" size={24}/><span>{title}<small>{description}</small></span></button>)}</div>
        {preparing ? <p role="status">Preparing a private preview. Please keep this page open.</p> : <><p>Your browser controls the next screen. If the camera is unavailable or permission is denied, choose Gallery or Browse Files.</p><p className="image-format-help">{IMAGE_FORMAT_HELP}</p></>}
        <button type="button" className="button button-secondary" onClick={close}>Cancel</button>
      </div>
    </CatalogDialog>}
  </>;
}
