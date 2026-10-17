import { useEffect, useRef, useState } from 'react';
import { Camera, Images, FolderOpen } from 'lucide-react';
import CatalogDialog from './CatalogDialog.jsx';
import './image-source.css';

export const IMAGE_FORMAT_HELP = 'Use JPEG, PNG or WebP. For HEIC/HEIF photos, export a JPEG or choose a compatible copy. Original files are never converted here.';
export default function ImageSourceChooser({ label = 'Upload Image', context, multiple = false, disabled = false, onSelect, describedBy, invalid = false }) {
  const [open, setOpen] = useState(false);
  const inputs = useRef({});
  const returning = useRef(false);
  useEffect(() => {
    if (!open) return;
    // A same-URL, owned entry lets browser Back dismiss just this chooser.
    // Never replace the router's state or unwind a subsequent navigation.
    const token = crypto.randomUUID();
    try { window.history.pushState({ ...window.history.state, twImageSource: token }, '', window.location.href); }
    catch { return; } // Restricted embedded browsers retain native Escape/Cancel.
    const back = () => { if (window.history.state?.twImageSource !== token) setOpen(false); };
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('popstate', back);
      if (window.history.state?.twImageSource === token) {
        returning.current = true;
        window.addEventListener('popstate', () => { returning.current = false; }, { once: true });
        window.history.back();
      }
    };
  }, [open]);
  function choose(source) {
    const input = inputs.current[source];
    input.value = ''; // Same-file reselection after selection or cancellation.
    input.click(); // Synchronous trusted action; no awaited permission request.
    setOpen(false);
  }
  return <>
    <button type="button" className="image-upload-button button button-secondary" aria-label={context ? `${context}: ${label}` : label} aria-describedby={describedBy} aria-invalid={invalid || undefined} disabled={disabled} onClick={() => { if (!returning.current) setOpen(true); }}>{label}</button>
    {['gallery', 'camera', 'files'].map(source => <input key={source} ref={node => { inputs.current[source] = node; }} type="file" hidden tabIndex={-1} aria-hidden="true" accept={source === 'files' ? 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp' : 'image/*'} capture={source === 'camera' ? 'environment' : undefined} multiple={source !== 'camera' && multiple} disabled={disabled} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) onSelect(files); }} />)}
    {open && <CatalogDialog title="Choose image source" onClose={() => setOpen(false)} bottomSheet className="image-source-dialog">
      <div className="image-source-body">
      {context && <p className="image-source-context">{context}</p>}
      <div className="image-source-options">
        <button type="button" onClick={() => choose('gallery')}><Images aria-hidden="true" size={24} /><span>Choose from Gallery</span></button>
        <button type="button" onClick={() => choose('camera')}><Camera aria-hidden="true" size={24} /><span>Take a Photo</span></button>
        <button type="button" onClick={() => choose('files')}><FolderOpen aria-hidden="true" size={24} /><span>Browse Files</span></button>
      </div>
      <p>Your browser controls the next screen. Gallery and Files may look similar. If a camera is unavailable or permission is denied, choose Gallery or Browse Files instead.</p>
      <p className="image-format-help">{IMAGE_FORMAT_HELP}</p>
      <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </CatalogDialog>}
  </>;
}
