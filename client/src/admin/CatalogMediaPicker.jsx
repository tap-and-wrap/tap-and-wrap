import { useRef, useState } from 'react';
import { api, getCsrfToken } from '../services/api';
import { catalogImageUrl } from './media-url';
import './catalog-media.css';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
const message = error => error?.response?.data?.error?.message || error?.response?.data?.error?.code || error?.message || 'Upload failed.';

/** Browser chooses images; API validates and re-encodes before putting to the public catalog bucket. */
export default function CatalogMediaPicker({ kind = 'product', onSelect, disabled = false, remaining = 1 }) {
  const picker = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [focus, setFocus] = useState('attention');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [nextCursor, setNextCursor] = useState(undefined);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const isCategory = kind === 'category';

  async function uploadSelected(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || disabled || uploading) return;
    setError('');
    if (files.length > 12 || files.length > remaining) { setError(`You may add ${Math.min(12, remaining)} image(s) at a time.`); return; }
    if (files.some(file => !validTypes.includes(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES)) {
      setError('Choose JPEG, PNG or WebP images, each 10 MB or less.'); return;
    }
    setUploading(true);
    let completed = 0;
    try {
      for (const file of files) {
        setProgress(`Optimizing and uploading ${completed + 1} of ${files.length}: ${file.name}`);
        const token = await getCsrfToken();
        const response = await api.post(`/admin/media/upload?kind=${encodeURIComponent(kind)}&focus=${encodeURIComponent(focus)}`, file, {
          timeout: 90000, headers: { 'Content-Type': file.type, 'x-csrf-token': token },
        });
        onSelect([response.data.data.image]);
        completed += 1;
      }
      setProgress(`Uploaded ${completed} image${completed === 1 ? '' : 's'}. Save the form to apply changes.`);
    } catch (uploadError) {
      setError(`${completed} completed. ${message(uploadError)} Try the remaining images again.`);
      setProgress('');
    } finally { setUploading(false); if (picker.current) picker.current.value = ''; }
  }
  async function loadLibrary(append = false) {
    if (loadingLibrary) return;
    setLoadingLibrary(true); setLibraryError('');
    try {
      const result = await api.get('/admin/media', { params: { kind, limit: 20, ...(append && nextCursor ? { cursor: nextCursor } : {}) } });
      setImages(previous => append ? [...previous, ...result.data.data.images] : result.data.data.images);
      setNextCursor(result.data.data.nextCursor || null);
      setLibraryOpen(true);
    } catch (loadError) { setLibraryError(message(loadError)); }
    finally { setLoadingLibrary(false); }
  }
  return <div className="tw-media-manager">
    <div className={`tw-media-drop${dragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void uploadSelected(event.dataTransfer.files); }}>
      <strong>{isCategory ? 'Category photo' : 'Upload product photos'}</strong>
      <p>Drop JPEG, PNG or WebP here — automatically converted and optimized to WebP (10 MB per file).</p>
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple={!isCategory} aria-label="Choose catalog images" disabled={disabled || uploading || remaining < 1} onChange={event => { void uploadSelected(event.target.files); }}/>
      <p className="admin-help">{isCategory ? 'A 4:3 category card will be generated.' : 'Choose up to 12 photos at once. Photos are not cropped.'}</p>
    </div>
    {isCategory && <label>Category crop focus <select value={focus} disabled={disabled || uploading} onChange={event => setFocus(event.target.value)}><option value="attention">Automatic subject detection</option><option value="centre">Center</option><option value="north">Top</option></select></label>}
    <div className="admin-inline"><button type="button" className="admin-button admin-button-secondary" disabled={disabled || uploading || loadingLibrary || remaining < 1} onClick={() => { if (libraryOpen) setLibraryOpen(false); else void loadLibrary(); }}>{libraryOpen ? 'Close media library' : 'Choose existing uploaded photo'}</button></div>
    {uploading && <p role="status" className="admin-help">{progress}</p>}
    {!uploading && progress && <p role="status" className="admin-help">{progress}</p>}
    {error && <p role="alert" className="admin-feedback admin-feedback-error">{error}</p>}
    {libraryError && <p role="alert" className="admin-feedback admin-feedback-error">{libraryError}</p>}
    {libraryOpen && <div className="tw-media-library"><h3>Reusable uploaded images</h3>{images.length === 0 && <p>No dashboard-uploaded photos yet. Older catalog photos remain available using their existing image references.</p>}
      <div className="tw-media-grid">{images.map(image => <button key={image.key} className="tw-media-tile" type="button" disabled={disabled || remaining < 1} onClick={() => { onSelect([image]); setLibraryOpen(false); }} title="Use this image"><img src={image.thumbnailUrl || catalogImageUrl(image.key)} alt="Catalog media" loading="lazy" width="120" height="120" /><span>Select</span></button>)}</div>
      {nextCursor && <button type="button" className="admin-button admin-button-secondary" disabled={loadingLibrary} onClick={() => void loadLibrary(true)}>{loadingLibrary ? 'Loading…' : 'Load more images'}</button>}
    </div>}
  </div>;
}
